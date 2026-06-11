// 上游 OpenAI-compatible API 适配层。未来接多家兼容网关时，按 §附录 B 的 Adapter 接口扩展。
// 当前覆盖 Image Generations 与 Chat Completions 两类模型。

import { positiveIntFromEnv } from '../utils/config.js';
import { buildMultipartBody } from './upstream-multipart.js';
import { createAbortError, guardedFetch } from './upstream-transport.js';

const DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES = 40 * 1024 * 1024;

export function getMaxUpstreamResponseBytes() {
  return positiveIntFromEnv('MAX_UPSTREAM_RESPONSE_BYTES', DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES);
}

function upstreamHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertContentLengthWithinLimit(response, limitBytes) {
  const raw = response.headers?.get?.('content-length');
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > limitBytes) {
    throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

export async function readResponseTextLimited(
  response,
  limitBytes = getMaxUpstreamResponseBytes(),
  { signal } = {}
) {
  throwIfAborted(signal);
  assertContentLengthWithinLimit(response, limitBytes);

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    throwIfAborted(signal);
    if (buffer.length > limitBytes) {
      throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
    }
    return buffer.toString('utf8');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf8');
  const chunks = [];
  let total = 0;
  const onAbort = () => {
    try { reader.cancel?.(createAbortError()); } catch { /* ignore */ }
  };
  try {
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > limitBytes) {
        await reader.cancel?.();
        throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    reader.releaseLock?.();
  }
  const tail = decoder.decode();
  if (tail) chunks.push(tail);
  return chunks.join('');
}

// 调用上游。把 fetch 结果统一成 { ok, status, data, durationMs }。
export async function callUpstream({
  targetUrl,
  apiKey,
  payload,
  fetchImpl = fetch,
  timeoutMs = 180000,
  timeoutMessage = 'Upstream request timed out.',
  signal
}) {
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutValue = Number(timeoutMs);
  const hasTimeout = Number.isFinite(timeoutValue) && timeoutValue > 0;
  const timeoutId = hasTimeout
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.floor(timeoutValue))
    : null;
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  try {
    const response = await guardedFetch(targetUrl, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: controller.signal
    }, { fetchImpl });
    const text = await readResponseTextLimited(response, getMaxUpstreamResponseBytes(), {
      signal: controller.signal
    });
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data, durationMs: Date.now() - started };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        status: timedOut ? 504 : 499,
        data: { error: { message: timedOut ? timeoutMessage : 'Client closed request.' } },
        durationMs: Date.now() - started
      };
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

// 调用 multipart 上游（Images Edits）。返回结构与 callUpstream 保持一致。
export async function callUpstreamMultipart({
  targetUrl,
  apiKey,
  fields,
  files,
  fetchImpl = fetch,
  timeoutMs = 180000,
  timeoutMessage = 'Upstream request timed out.',
  signal
}) {
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutValue = Number(timeoutMs);
  const hasTimeout = Number.isFinite(timeoutValue) && timeoutValue > 0;
  const timeoutId = hasTimeout
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.floor(timeoutValue))
    : null;
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const multipart = buildMultipartBody({ fields, files });
    const response = await guardedFetch(targetUrl, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': multipart.contentType,
        'accept': 'application/json'
      },
      body: multipart.body,
      redirect: 'manual',
      signal: controller.signal
    }, { fetchImpl });
    const text = await readResponseTextLimited(response, getMaxUpstreamResponseBytes(), {
      signal: controller.signal
    });
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data, durationMs: Date.now() - started };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        status: timedOut ? 504 : 499,
        data: { error: { message: timedOut ? timeoutMessage : 'Client closed request.' } },
        durationMs: Date.now() - started
      };
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export { buildMultipartBody } from './upstream-multipart.js';
export { assertAllowedUpstreamUrl } from './upstream-url-policy.js';
export { guardedFetch } from './upstream-transport.js';
export {
  buildChatPayload,
  buildImagePayload,
  resolveApiUrl,
  resolveChatCompletionsUrl,
  resolveImageEditsUrl,
  resolveImageGenerationsUrl,
  resolveModelsUrl
} from './upstream-payloads.js';
