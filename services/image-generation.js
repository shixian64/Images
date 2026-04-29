// Image generation worker primitives shared by HTTP routes and the async queue.
// Keeps upstream execution reusable while queueing/cancellation live in services/job-queue.js.

import { logger } from '../utils/logger.js';
import { maskApiKey, redactSecrets } from '../utils/mask.js';
import { assertAllowedUpstreamUrl, buildImagePayload, callUpstream, resolveApiUrl } from './upstream.js';
import { saveGeneratedImages } from './gallery-store.js';
import { getSystemEndpoint } from './interface-defaults.js';
import { recordSuccess, recordFailure } from './quota.js';

function positiveIntFromEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_STREAM_HEARTBEAT_MS = 15 * 1000;
const DEFAULT_MAX_IMAGES_PER_REQUEST = 4;
const DEFAULT_IMAGE_BATCH_CONCURRENCY = 2;

const PERSISTED_IMAGE_FIELDS = [
  'model',
  'prompt',
  'n',
  'size',
  'quality',
  'output_format',
  'moderation'
];

export function getMaxImagesPerRequest() {
  return positiveIntFromEnv('MAX_IMAGES_PER_REQUEST', DEFAULT_MAX_IMAGES_PER_REQUEST);
}

export function getImageGenerationTimeoutMs() {
  return positiveIntFromEnv('IMAGE_GENERATION_TIMEOUT_MS', DEFAULT_IMAGE_TIMEOUT_MS);
}

export function getGenerateStreamHeartbeatMs() {
  return positiveIntFromEnv('GENERATE_STREAM_HEARTBEAT_MS', DEFAULT_STREAM_HEARTBEAT_MS);
}

export function getImageGenerationBatchConcurrency() {
  return positiveIntFromEnv('IMAGE_GENERATION_BATCH_CONCURRENCY', DEFAULT_IMAGE_BATCH_CONCURRENCY);
}

export function shouldUseSystemDefault(body = {}) {
  return body.useSystemDefault === true || body.interfaceMode === 'system';
}

export function sanitizeGenerationPayload(body = {}) {
  const source = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const key of PERSISTED_IMAGE_FIELDS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = source[key];
    }
  }

  if (shouldUseSystemDefault(body)) {
    out.useSystemDefault = true;
    out.interfaceMode = 'system';
  } else {
    out.useSystemDefault = false;
    out.interfaceMode = 'custom';
  }
  return out;
}

export function resolveImageRequest(body = {}) {
  if (shouldUseSystemDefault(body)) {
    const endpoint = getSystemEndpoint('image');
    return {
      apiKey: endpoint.apiKey,
      targetUrl: resolveApiUrl(endpoint.baseUrl),
      profileName: endpoint.name || '系统默认接口',
      bodyForPayload: {
        ...body,
        model: body.model || body.imageDefaultModel || endpoint.defaultModel
      },
      usingSystemDefault: true
    };
  }

  const apiKey = String(body.imageApiKey || body.apiKey || '').trim();
  if (!apiKey) throw new Error('API key is required.');
  return {
    apiKey,
    targetUrl: resolveApiUrl(body.imageBaseUrl || body.baseUrl),
    profileName: body.name,
    bodyForPayload: body,
    usingSystemDefault: false
  };
}

function validateRequestedImages(n) {
  const maxImagesPerRequest = getMaxImagesPerRequest();
  if (!Number.isInteger(n) || n < 1 || n > maxImagesPerRequest) {
    throw new Error(`n must be an integer between 1 and ${maxImagesPerRequest}.`);
  }
  return Math.max(1, Number(n) || 1);
}

function promptPreview(prompt) {
  return String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 50);
}

function errorMessageFromUpstream(data, status, apiKey) {
  return redactSecrets(data?.error?.message || data?.message || `Request failed with ${status}`, [apiKey]);
}

function callErrorResult(err, started) {
  return {
    ok: false,
    status: err?.statusCode || 500,
    data: { error: { message: err?.message || String(err) } },
    durationMs: Date.now() - started
  };
}

async function runLimited(count, concurrency, worker) {
  const results = new Array(count);
  let next = 0;
  const workerCount = Math.min(count, Math.max(1, concurrency));

  async function runWorker() {
    while (next < count) {
      const index = next;
      next += 1;
      results[index] = await worker(index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function callImageUpstream({ targetUrl, apiKey, payload, requestedImages, signal, timeoutMs, onProgress, started }) {
  if (requestedImages <= 1) {
    const result = await callUpstream({
      targetUrl,
      apiKey,
      payload,
      signal,
      timeoutMs: timeoutMs || getImageGenerationTimeoutMs()
    });
    return { ...result, upstreamRequestCount: 1 };
  }

  const concurrency = Math.min(requestedImages, getImageGenerationBatchConcurrency());
  let completed = 0;
  onProgress?.({
    stage: 'upstream',
    message: `正在并发生图：${payload.model} · 0/${requestedImages}（最多 ${concurrency} 路）`,
    elapsedMs: Date.now() - started
  });

  const results = await runLimited(requestedImages, concurrency, async (index) => {
    const callStarted = Date.now();
    const itemPayload = { ...payload, n: 1 };
    const result = await callUpstream({
      targetUrl,
      apiKey,
      payload: itemPayload,
      signal,
      timeoutMs: timeoutMs || getImageGenerationTimeoutMs()
    }).catch((err) => callErrorResult(err, callStarted));

    completed += 1;
    onProgress?.({
      stage: 'upstream',
      message: `正在并发生图：${payload.model} · ${completed}/${requestedImages}`,
      elapsedMs: Date.now() - started
    });
    return result;
  });

  const failed = results.find((item) => !item?.ok);
  if (failed) {
    return {
      ...failed,
      durationMs: Date.now() - started,
      upstreamRequestCount: results.length
    };
  }

  const firstData = results.find((item) => item?.data && typeof item.data === 'object')?.data || {};
  const data = {
    ...firstData,
    data: results
      .flatMap((item) => Array.isArray(item?.data?.data) ? item.data.data : [])
      .slice(0, requestedImages)
  };

  return {
    ok: true,
    status: 200,
    data,
    durationMs: Date.now() - started,
    upstreamRequestCount: results.length
  };
}

export async function prepareImageGenerationJob(body = {}) {
  const requestConfig = resolveImageRequest(body);
  const { targetUrl, bodyForPayload } = requestConfig;
  await assertAllowedUpstreamUrl(targetUrl);
  const payload = buildImagePayload(bodyForPayload);
  const requestedImages = validateRequestedImages(payload.n);
  const sanitizedPayload = sanitizeGenerationPayload({
    ...body,
    model: payload.model,
    prompt: payload.prompt,
    n: requestedImages
  });

  const transientSecret = requestConfig.usingSystemDefault ? null : {
    apiKey: requestConfig.apiKey,
    baseUrl: body.imageBaseUrl || body.baseUrl || '',
    imageBaseUrl: body.imageBaseUrl || body.baseUrl || ''
  };

  return {
    payload: sanitizedPayload,
    requestedImages,
    model: payload.model,
    prompt: payload.prompt,
    promptPreview: promptPreview(payload.prompt),
    profileName: requestConfig.profileName || body.name || (requestConfig.usingSystemDefault ? '系统默认接口' : ''),
    usingSystemDefault: requestConfig.usingSystemDefault,
    transientSecret
  };
}

export async function runImageGeneration(body, userInfo, { signal, onProgress, timeoutMs } = {}) {
  const started = Date.now();
  const requestConfig = resolveImageRequest(body);
  const { apiKey, targetUrl, bodyForPayload, usingSystemDefault } = requestConfig;
  await assertAllowedUpstreamUrl(targetUrl);
  const payload = buildImagePayload(bodyForPayload);
  const requestedImages = validateRequestedImages(payload.n);

  logger.info('image.generate.request', {
    userId: userInfo?.id,
    targetUrl,
    model: payload.model,
    profileName: requestConfig.profileName,
    usingSystemDefault,
    apiKey: maskApiKey(apiKey)
  });
  onProgress?.({
    stage: 'upstream',
    message: `正在调用 ${payload.model}，连接会持续保活…`,
    elapsedMs: Date.now() - started
  });

  const { ok, status, data, durationMs, upstreamRequestCount } = await callImageUpstream({
    targetUrl,
    apiKey,
    payload,
    requestedImages,
    signal,
    timeoutMs,
    onProgress,
    started
  });

  if (!ok) {
    const errMsg = errorMessageFromUpstream(data, status, apiKey);
    logger.error('image.generate.failed', {
      userId: userInfo?.id,
      status,
      durationMs,
      model: payload.model,
      error: errMsg,
      upstreamRequestCount
    });
    recordFailure(userInfo?.id, { calls: requestedImages });
    return { status, body: { error: errMsg } };
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
        size: bodyForPayload.size || body.size || '',
        quality: bodyForPayload.quality || body.quality || '',
        outputFormat: bodyForPayload.output_format || body.output_format || '',
        profileName: requestConfig.profileName || body.name || ''
      },
      { userId: userInfo?.id }
    );
    saved = saveResult.saved;
    if (Array.isArray(data?.data)) data.data = saveResult.items;
  } catch (saveError) {
    logger.warn('image.generate.save_failed', {
      userId: userInfo?.id,
      model: payload.model,
      imageCount: imageItems.length,
      error: saveError.message || String(saveError)
    });
  }

  // 用量记账：多图请求按请求张数消耗额度，同时记录实际返回/入库图数与字节数。
  const savedBytes = saved.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  recordSuccess(userInfo?.id, {
    calls: requestedImages,
    images: saved.length || imageItems.length || 0,
    bytes: savedBytes
  });

  logger.info('image.generate.success', {
    userId: userInfo?.id,
    status,
    durationMs,
    model: payload.model,
    imageCount: imageItems.length,
    savedCount: saved.length,
    upstreamRequestCount
  });

  return { status: 200, body: { ...data, saved } };
}
