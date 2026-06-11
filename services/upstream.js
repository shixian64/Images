// 上游 OpenAI-compatible API 适配层。未来接多家兼容网关时，按 §附录 B 的 Adapter 接口扩展。
// 当前覆盖 Image Generations 与 Chat Completions 两类模型。

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { positiveIntFromEnv } from '../utils/config.js';
import { buildMultipartBody } from './upstream-multipart.js';
import { assertAllowedUpstreamUrl } from './upstream-url-policy.js';

const DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES = 40 * 1024 * 1024;

export function getMaxUpstreamResponseBytes() {
  return positiveIntFromEnv('MAX_UPSTREAM_RESPONSE_BYTES', DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES);
}

function normalizeHeaders(headers = {}) {
  const out = {};
  const source = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers || {});
  for (const [key, value] of source) {
    if (value === undefined || value === null) continue;
    const lower = String(key).toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function headersFromIncoming(raw = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, String(item));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function abortError() {
  return new DOMException('This operation was aborted.', 'AbortError');
}

function fetchWithPinnedDns(policy, options = {}) {
  const parsed = policy.parsed || new URL(policy.url || '');
  const requestImpl = parsed.protocol === 'http:' ? httpRequest : httpsRequest;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(options.headers || {});
  const body = options.body;
  const bodyBuffer = body === undefined || body === null
    ? null
    : Buffer.isBuffer(body)
      ? body
      : body instanceof Uint8Array
        ? Buffer.from(body)
        : Buffer.from(String(body));
  if (bodyBuffer && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['content-length'] = String(bodyBuffer.length);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = requestImpl({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      method,
      headers,
      lookup: policy.lookup || undefined,
      servername: parsed.hostname
    }, (incoming) => {
      settled = true;
      const status = incoming.statusCode || 0;
      const responseHeaders = headersFromIncoming(incoming.headers);
      const bodyStream = status === 204 || status === 304 ? null : Readable.toWeb(incoming);
      resolve(new Response(bodyStream, {
        status,
        statusText: incoming.statusMessage || '',
        headers: responseHeaders
      }));
    });

    const onAbort = () => {
      req.destroy(abortError());
    };
    req.on('error', (err) => {
      options.signal?.removeEventListener?.('abort', onAbort);
      if (!settled) reject(err);
    });
    req.on('close', () => {
      options.signal?.removeEventListener?.('abort', onAbort);
    });
    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(abortError());
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

function withTimeoutSignal(options = {}, timeoutMs = null) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return { options, cleanup: () => {} };
  }

  const controller = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), Math.floor(ms));
  timeoutId.unref?.();

  return {
    options: { ...options, signal: controller.signal },
    cleanup: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener?.('abort', abortFromCaller);
    }
  };
}

export async function guardedFetch(url, options = {}, { lookupImpl = dnsLookup, fetchImpl = null, timeoutMs = null } = {}) {
  // Unit tests pass explicit fetchImpl stubs; production code should use the
  // pinned transport below so the socket connects to the already-vetted DNS
  // answer instead of re-resolving after the SSRF check.
  const timed = withTimeoutSignal(options, timeoutMs);
  try {
    if (fetchImpl && fetchImpl !== fetch) {
      return await fetchImpl(url, timed.options);
    }
    const policy = await assertAllowedUpstreamUrl(url, { lookupImpl });
    return await fetchWithPinnedDns(policy, timed.options);
  } finally {
    timed.cleanup();
  }
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
  if (signal?.aborted) throw abortError();
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
    try { reader.cancel?.(abortError()); } catch { /* ignore */ }
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
export {
  buildChatPayload,
  buildImagePayload,
  resolveApiUrl,
  resolveChatCompletionsUrl,
  resolveImageEditsUrl,
  resolveImageGenerationsUrl,
  resolveModelsUrl
} from './upstream-payloads.js';
