// Image generation entrypoints.
// POST /api/generate now enqueues a persistent job and returns immediately.
// POST /api/generate/stream keeps legacy semantics: enqueue, stream status, end with result/error.

import { readJsonBody, readMultipartFormData, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { createSseSession, openSse, writeSse, writeSseComment } from '../utils/sse.js';
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

function statusFromError(error) {
  return error?.statusCode || bodyErrorStatus(error);
}

function parseMaybeJson(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function readGenerateBody(req) {
  const contentType = String(req.headers?.['content-type'] || req.headers?.['Content-Type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) return readJsonBody(req);

  const form = await readMultipartFormData(req);
  const payload = parseMaybeJson(form.fields.payload, {});
  const body = {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    ...form.fields
  };
  delete body.payload;
  if (typeof body.useSystemDefault === 'string') body.useSystemDefault = body.useSystemDefault === 'true';
  if (typeof body.references === 'string') {
    const parsed = parseMaybeJson(body.references, null);
    if (Array.isArray(parsed)) body.references = parsed;
  }
  if (typeof body.referenceImageIds === 'string') {
    const parsed = parseMaybeJson(body.referenceImageIds, null);
    if (Array.isArray(parsed)) body.referenceImageIds = parsed;
  }
  body._uploadedReferenceFiles = form.files;
  return body;
}

export async function handleGenerate(req, res) {
  const started = Date.now();
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = {};
  try {
    body = await readGenerateBody(req);
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
    body = await readGenerateBody(req);
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

  openSse(res);
  writeSse(res, 'progress', {
    stage: 'accepted',
    message: job.position ? `已加入队列，当前第 ${job.position} 位。` : '已加入队列。',
    elapsedMs: Date.now() - started,
    job
  });

  let completed = false;
  let cleanup = () => {};
  let session = null;
  const finish = () => {
    if (completed) return;
    completed = true;
    session?.end();
  };
  session = createSseSession(res, {
    heartbeatMs: getGenerateStreamHeartbeatMs(),
    onClose: () => cleanup(),
    onHeartbeat: () => {
      if (completed || session?.isClosed()) return;
      writeSseComment(res, `heartbeat ${Date.now()}`);
      try {
        const current = getJobForUser(job.id, req.session.user);
        const done = streamJobResult(current, res, started);
        if (done) finish();
      } catch {
        writeSse(res, 'progress', {
          stage: 'waiting',
          message: '仍在等待任务更新…',
          elapsedMs: Date.now() - started
        });
      }
    }
  });
  cleanup = onJobUpdate(job.id, (updated) => {
    if (completed || session.isClosed()) return;
    const done = streamJobResult(updated, res, started);
    if (done) finish();
  });

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
