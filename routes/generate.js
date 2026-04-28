// Image generation entrypoints.
// POST /api/generate now enqueues a persistent job and returns immediately.
// POST /api/generate/stream keeps legacy semantics: enqueue, stream status, end with result/error.

import { readJsonBody, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import {
  getMaxImagesPerRequest,
  getImageGenerationTimeoutMs,
  getGenerateStreamHeartbeatMs,
  runImageGeneration
} from '../services/image-generation.js';
import { enqueueImageGeneration, getJobForUser, onJobUpdate } from '../services/job-queue.js';

export {
  getMaxImagesPerRequest,
  getImageGenerationTimeoutMs,
  getGenerateStreamHeartbeatMs,
  runImageGeneration
};

export function handleGenerateConfig(req, res) {
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  return sendJson(res, 200, { maxImagesPerRequest: getMaxImagesPerRequest() });
}

function writeSse(res, event, data = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseComment(res, message) {
  res.write(`: ${message}\n\n`);
}

function statusFromError(error) {
  return error?.statusCode || bodyErrorStatus(error);
}

export async function handleGenerate(req, res) {
  const started = Date.now();
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
    const job = await enqueueImageGeneration(body, req.session.user);
    return sendJson(res, 202, {
      jobId: job.id,
      status: job.status,
      position: job.position,
      job
    });
  } catch (error) {
    logger.warn('image.generate.rejected', {
      durationMs: Date.now() - started,
      model: body?.model,
      baseUrl: body?.imageBaseUrl || body?.baseUrl,
      code: error?.code,
      error: error.message || String(error)
    });
    return sendJson(res, statusFromError(error), {
      error: error.message || String(error),
      code: error?.code
    });
  }
}

function streamJobResult(job, res, started) {
  const elapsedMs = Date.now() - started;
  if (job.status === 'queued') {
    writeSse(res, 'progress', {
      stage: 'queued',
      message: job.position ? `已加入队列，当前第 ${job.position} 位。` : '已加入队列。',
      elapsedMs,
      job
    });
    return false;
  }
  if (job.status === 'running') {
    writeSse(res, 'progress', {
      ...(job.progress || {}),
      stage: job.progress?.stage || 'running',
      message: job.progress?.message || '任务正在执行…',
      elapsedMs,
      job
    });
    return false;
  }
  if (job.status === 'succeeded') {
    writeSse(res, 'result', job.result || { data: [], saved: [] });
    return true;
  }
  writeSse(res, 'error', {
    status: job.status === 'timeout' ? 504 : job.status === 'cancelled' ? 499 : 500,
    error: job.error || job.progress?.message || '生成失败',
    job
  });
  return true;
}

export async function handleGenerateStream(req, res) {
  const started = Date.now();
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  let body = {};
  let job;
  try {
    body = await readJsonBody(req);
    job = await enqueueImageGeneration(body, req.session.user);
  } catch (error) {
    logger.warn('image.generate.rejected', {
      durationMs: Date.now() - started,
      model: body?.model,
      baseUrl: body?.imageBaseUrl || body?.baseUrl,
      code: error?.code,
      error: error.message || String(error)
    });
    return sendJson(res, statusFromError(error), {
      error: error.message || String(error),
      code: error?.code
    });
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no'
  });
  res.flushHeaders?.();
  writeSseComment(res, 'connected');
  writeSse(res, 'progress', {
    stage: 'accepted',
    message: job.position ? `已加入队列，当前第 ${job.position} 位。` : '已加入队列。',
    elapsedMs: Date.now() - started,
    job
  });

  let closed = false;
  let completed = false;
  let heartbeat = null;
  let cleanup = () => {};
  const finish = () => {
    completed = true;
    cleanup();
    if (heartbeat) clearInterval(heartbeat);
    if (!res.destroyed && !res.writableEnded) res.end();
  };
  cleanup = onJobUpdate(job.id, (updated) => {
    if (closed || completed || res.destroyed || res.writableEnded) return;
    const done = streamJobResult(updated, res, started);
    if (done) finish();
  });

  res.on('close', () => {
    closed = true;
    cleanup();
    if (heartbeat) clearInterval(heartbeat);
  });

  heartbeat = setInterval(() => {
    if (closed || completed || res.destroyed || res.writableEnded) return;
    writeSseComment(res, `heartbeat ${Date.now()}`);
    try {
      const current = getJobForUser(job.id, req.session.user);
      writeSse(res, 'progress', {
        stage: current.status,
        message: current.status === 'queued' ? '仍在队列中，连接保持中…' : '仍在生成中，连接保持中…',
        elapsedMs: Date.now() - started,
        job: current
      });
    } catch {
      writeSse(res, 'progress', {
        stage: 'waiting',
        message: '仍在等待任务更新…',
        elapsedMs: Date.now() - started
      });
    }
  }, getGenerateStreamHeartbeatMs());
  heartbeat.unref?.();

  try {
    const current = getJobForUser(job.id, req.session.user);
    if (current.status !== 'queued') {
      const done = streamJobResult(current, res, started);
      if (done) finish();
    }
  } catch {
    // Ignore; heartbeat will surface a waiting message or the stream will close.
  }
}
