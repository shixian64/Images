// POST /api/generate —— 前端直接把完整 profile + 生成参数打过来，
// 我们负责校验、脱敏记日志、调用上游。
// /api/generate/stream 会用 SSE heartbeat 先返回字节，避免长图生成时被 CDN/反代空闲超时断开。

import { readJsonBody, sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { buildImagePayload, callUpstream, resolveApiUrl } from '../services/upstream.js';
import { saveGeneratedImages } from '../services/gallery-store.js';
import {
  assertCanGenerate,
  recordSuccess,
  recordFailure
} from '../services/quota.js';

const DEFAULT_IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS || 10 * 60 * 1000);
const STREAM_HEARTBEAT_MS = Number(process.env.GENERATE_STREAM_HEARTBEAT_MS || 15 * 1000);

function writeSse(res, event, data = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseComment(res, message) {
  res.write(`: ${message}\n\n`);
}

async function runImageGeneration(body, userInfo, { signal, onProgress } = {}) {
  const started = Date.now();
  const apiKey = String(body.imageApiKey || body.apiKey || '').trim();
  if (!apiKey) throw new Error('API key is required.');

  const targetUrl = resolveApiUrl(body.imageBaseUrl || body.baseUrl);
  const payload = buildImagePayload(body);

  // 配额拦截：管理员豁免，其他用户按 daily/monthly/storage 检查。
  if (userInfo.role !== 'admin') {
    const check = assertCanGenerate(userInfo.id, { n: payload.n || 1 });
    if (!check.ok) {
      logger.warn('image.generate.quota_exceeded', {
        userId: userInfo.id,
        code: check.code,
        model: payload.model
      });
      return { status: 429, body: { error: check.message, code: check.code } };
    }
  }

  logger.info('image.generate.request', {
    targetUrl,
    model: payload.model,
    profileName: body.name,
    apiKey: maskApiKey(apiKey)
  });
  onProgress?.({
    stage: 'upstream',
    message: `正在调用 ${payload.model}，连接会持续保活…`,
    elapsedMs: Date.now() - started
  });

  const { ok, status, data, durationMs } = await callUpstream({
    targetUrl,
    apiKey,
    payload,
    signal,
    timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS
  });

  if (!ok) {
    const errMsg = data?.error?.message || data?.message || `Request failed with ${status}`;
    logger.error('image.generate.failed', {
      status, durationMs, model: payload.model, error: errMsg
    });
    recordFailure(userInfo.id);
    return { status, body: { error: errMsg, details: data } };
  }

  onProgress?.({
    stage: 'saving',
    message: '上游已返回，正在保存图片到本地…',
    elapsedMs: Date.now() - started
  });

  const imageItems = Array.isArray(data?.data) ? data.data : [];
  let saved = [];
  try {
    const saveResult = await saveGeneratedImages(
      imageItems,
      {
        prompt: payload.prompt,
        model: payload.model,
        size: body.size || '',
        quality: body.quality || '',
        outputFormat: body.output_format || '',
        profileName: body.name || ''
      },
      { userId: userInfo.id }
    );
    saved = saveResult.saved;
    if (Array.isArray(data?.data)) data.data = saveResult.items;
  } catch (saveError) {
    logger.warn('image.generate.save_failed', {
      model: payload.model,
      imageCount: imageItems.length,
      error: saveError.message || String(saveError)
    });
  }

  // 用量记账：成功调用计 1 次 + 实际入库的图数 / 字节数
  const savedBytes = saved.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  recordSuccess(userInfo.id, {
    calls: 1,
    images: saved.length || imageItems.length || 0,
    bytes: savedBytes
  });

  logger.info('image.generate.success', {
    status, durationMs,
    model: payload.model,
    imageCount: imageItems.length,
    savedCount: saved.length
  });

  return { status: 200, body: { ...data, saved } };
}

export async function handleGenerate(req, res) {
  const started = Date.now();
  // 防御性鉴权（server.js 也会拦）：未登录直接 401
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
    const result = await runImageGeneration(body, req.session.user);
    return sendJson(res, result.status, result.body);
  } catch (error) {
    logger.warn('image.generate.rejected', {
      durationMs: Date.now() - started,
      model: body?.model,
      baseUrl: body?.imageBaseUrl || body?.baseUrl,
      error: error.message || String(error)
    });
    return sendJson(res, 400, { error: error.message || String(error) });
  }
}

export async function handleGenerateStream(req, res) {
  const started = Date.now();
  // 防御性鉴权（server.js 也会拦）：未登录直接 401
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || String(error) });
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    // Nginx 识别该头后会关闭响应缓冲，否则 heartbeat 可能被攒住，Cloudflare 仍看不到数据。
    'x-accel-buffering': 'no'
  });
  res.flushHeaders?.();
  writeSseComment(res, 'connected');
  writeSse(res, 'progress', {
    stage: 'accepted',
    message: '已建立生成连接，等待上游返回…',
    elapsedMs: Date.now() - started
  });

  const controller = new AbortController();
  let closed = false;
  let completed = false;
  res.on('close', () => {
    if (!completed) {
      closed = true;
      controller.abort();
    }
  });

  const heartbeat = setInterval(() => {
    if (closed || res.destroyed || res.writableEnded) return;
    writeSseComment(res, `heartbeat ${Date.now()}`);
    writeSse(res, 'progress', {
      stage: 'waiting',
      message: '仍在生成中，连接保持中…',
      elapsedMs: Date.now() - started
    });
  }, STREAM_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const result = await runImageGeneration(body, req.session.user, {
      signal: controller.signal,
      onProgress: (data) => {
        if (!closed && !res.destroyed && !res.writableEnded) writeSse(res, 'progress', data);
      }
    });

    if (closed || res.destroyed || res.writableEnded) return;
    if (result.status >= 200 && result.status < 300) {
      writeSse(res, 'result', result.body);
    } else {
      writeSse(res, 'error', { status: result.status, ...result.body });
    }
    completed = true;
    return res.end();
  } catch (error) {
    if (closed || res.destroyed || res.writableEnded) return;
    logger.warn('image.generate.rejected', {
      durationMs: Date.now() - started,
      model: body?.model,
      baseUrl: body?.imageBaseUrl || body?.baseUrl,
      error: error.message || String(error)
    });
    writeSse(res, 'error', { status: 400, error: error.message || String(error) });
    completed = true;
    return res.end();
  } finally {
    clearInterval(heartbeat);
  }
}
