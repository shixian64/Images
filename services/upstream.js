// 上游 OpenAI-compatible API 适配层。未来接多家兼容网关时，按 §附录 B 的 Adapter 接口扩展。
// 当前覆盖 Image Generations 与 Chat Completions 两类模型。

import {
  CHAT_OPTIONAL_PASSTHROUGH_KEYS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_MODEL,
  OPTIONAL_PASSTHROUGH_KEYS
} from '../shared/constants.js';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

import { positiveIntFromEnv } from '../utils/config.js';

const DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024 * 1024;

const BLOCKED_IPV4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32]
];

export function getMaxUpstreamResponseBytes() {
  return positiveIntFromEnv('MAX_UPSTREAM_RESPONSE_BYTES', DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES);
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0) >>> 0;
}

function ipv4InCidr(ip, base, bits) {
  const value = ipv4ToInt(ip);
  const start = ipv4ToInt(base);
  if (value === null || start === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (start & mask);
}

function isBlockedIpv4(ip) {
  return BLOCKED_IPV4_CIDRS.some(([base, bits]) => ipv4InCidr(ip, base, bits));
}

function ipv6ToHextets(ip) {
  let value = normalizeHostname(ip).split('%')[0];

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const dotted = value.slice(lastColon + 1);
    const embedded = ipv4ToInt(dotted);
    if (lastColon < 0 || embedded === null) return null;
    value = `${value.slice(0, lastColon)}:${((embedded >>> 16) & 0xffff).toString(16)}:${(embedded & 0xffff).toString(16)}`;
  }

  const compressed = value.split('::');
  if (compressed.length > 2) return null;

  const left = compressed[0] ? compressed[0].split(':') : [];
  const right = compressed.length === 2 && compressed[1] ? compressed[1].split(':') : [];
  const zeroCount = compressed.length === 2 ? 8 - left.length - right.length : 0;
  if (zeroCount < 0) return null;

  const parts = compressed.length === 2
    ? [...left, ...Array(zeroCount).fill('0'), ...right]
    : left;
  if (parts.length !== 8) return null;

  const hextets = parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    return Number.parseInt(part, 16);
  });
  return hextets.some((part) => part === null) ? null : hextets;
}

function embeddedIpv4FromIpv6(ip) {
  const hextets = ipv6ToHextets(ip);
  if (!hextets) return null;

  const first80Zero = hextets.slice(0, 5).every((part) => part === 0);
  const first96Zero = first80Zero && hextets[5] === 0;
  const isMapped = first80Zero && hextets[5] === 0xffff;
  const isCompatible = first96Zero && (hextets[6] !== 0 || hextets[7] !== 0);
  if (!isMapped && !isCompatible) return null;

  return [
    (hextets[6] >>> 8) & 0xff,
    hextets[6] & 0xff,
    (hextets[7] >>> 8) & 0xff,
    hextets[7] & 0xff
  ].join('.');
}

function isBlockedIpv6(ip) {
  const value = normalizeHostname(ip);
  if (value === '::' || value === '::1') return true;
  const embeddedIpv4 = embeddedIpv4FromIpv6(value);
  if (embeddedIpv4) return isBlockedIpv4(embeddedIpv4);
  return /^(fc|fd)/.test(value)
    || /^fe[89ab]/.test(value)
    || value.startsWith('ff');
}

function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return false;
}

function normalizeLookupRecords(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      address: String(record?.address || '').trim(),
      family: Number(record?.family) || isIP(record?.address)
    }))
    .filter((record) => record.address && (record.family === 4 || record.family === 6));
}

function pinnedLookup(records) {
  const clean = normalizeLookupRecords(records);
  return function lookup(_hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!clean.length) {
      callback(new Error('No vetted upstream address is available.'));
      return;
    }
    if (options?.all) {
      callback(null, clean.map((record) => ({ ...record })));
      return;
    }
    callback(null, clean[0].address, clean[0].family);
  };
}

export async function assertAllowedUpstreamUrl(url, { lookupImpl = dnsLookup } = {}) {
  const parsed = new URL(url);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:') {
    if (protocol !== 'http:' || process.env.ALLOW_INSECURE_UPSTREAMS !== '1') {
      throw new Error('Upstream URL must use https.');
    }
  }
  if (parsed.username || parsed.password) {
    throw new Error('Upstream URL must not include credentials.');
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) throw new Error('Upstream host is required.');

  // Local/private upstreams are common in isolated development and CTF-style
  // sandboxes where a public-looking domain may resolve to an internal gateway.
  // Keep production strict by default; development can still force strict mode
  // with ALLOW_PRIVATE_UPSTREAMS=0.
  const allowPrivateUpstreams = process.env.ALLOW_PRIVATE_UPSTREAMS === '1'
    || (process.env.NODE_ENV !== 'production' && process.env.ALLOW_PRIVATE_UPSTREAMS !== '0');
  if (allowPrivateUpstreams) {
    return { ok: true, parsed, host, records: null, lookup: null, privateUpstreamsAllowed: true };
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isBlockedAddress(host)) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isIP(host)) {
    const record = { address: host, family: isIP(host) };
    return { ok: true, parsed, host, records: [record], lookup: pinnedLookup([record]) };
  }

  let records;
  try {
    records = await lookupImpl(host, { all: true, verbatim: false });
  } catch (err) {
    throw new Error(`Unable to resolve upstream host: ${err.message || String(err)}`);
  }
  records = normalizeLookupRecords(records);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Unable to resolve upstream host.');
  }
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('Upstream host resolves to a private address.');
    }
  }
  return { ok: true, parsed, host, records, lookup: pinnedLookup(records) };
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

function normalizeBase(baseUrl) {
  const cleaned = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleaned) throw new Error('Base URL is required.');
  const parsed = new URL(cleaned); // Validate URL shape; callers convert failures to 400 responses.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Base URL must use http or https.');
  }
  const hasV1 = cleaned.replace(/\/+$/, '').endsWith('/v1');
  return { base: cleaned, hasV1 };
}

function resolveV1Url(baseUrl, path) {
  const { base, hasV1 } = normalizeBase(baseUrl);
  return `${base}${hasV1 ? '' : '/v1'}${path}`;
}

// 把 "https://host" 或 "https://host/v1" 规范化为 /v1/images/generations 端点。
export function resolveImageGenerationsUrl(baseUrl) {
  return resolveV1Url(baseUrl, '/images/generations');
}

// 兼容旧测试与旧调用名。
export const resolveApiUrl = resolveImageGenerationsUrl;

// 同样规则下的 /v1/images/edits 端点，用于带参考图的图片编辑/再创作。
export function resolveImageEditsUrl(baseUrl) {
  return resolveV1Url(baseUrl, '/images/edits');
}

// 同样规则下的 /v1/chat/completions 端点，用于对话模型适配。
export function resolveChatCompletionsUrl(baseUrl) {
  return resolveV1Url(baseUrl, '/chat/completions');
}

// 同样规则下的 /v1/models 端点，用于连通性测试（§4.1）。
export function resolveModelsUrl(baseUrl) {
  return resolveV1Url(baseUrl, '/models');
}

// 构造 OpenAI-compatible payload。只在显式选择（非 auto）时带上可选字段，
// 以便兼容那些版本落后的网关。
export function buildImagePayload(body) {
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) throw new Error('Prompt is required.');

  const payload = {
    model: body.model || DEFAULT_MODEL,
    prompt,
    n: Number(body.n || 1)
  };

  for (const key of OPTIONAL_PASSTHROUGH_KEYS) {
    if (body[key] && body[key] !== 'auto') payload[key] = body[key];
  }
  return payload;
}

function normalizeChatMessages(body) {
  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        role: String(item.role || '').trim(),
        content: item.content
      }))
      .filter((item) => item.role && item.content !== undefined && item.content !== null && String(item.content).trim() !== '')
    : [];

  if (messages.length) return messages;

  const prompt = String(body.prompt ?? body.input ?? '').trim();
  if (prompt) return [{ role: 'user', content: prompt }];

  throw new Error('Messages are required.');
}

// 构造 OpenAI-compatible Chat Completions payload。
// 只透传白名单参数，避免把 apiKey / baseUrl 等配置字段带到上游。
export function buildChatPayload(body) {
  const payload = {
    model: body.model || body.chatModel || DEFAULT_CHAT_MODEL,
    messages: normalizeChatMessages(body)
  };

  for (const key of CHAT_OPTIONAL_PASSTHROUGH_KEYS) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') payload[key] = body[key];
  }
  return payload;
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
      chunks.push(chunk);
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total).toString('utf8');
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

function multipartEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}

function multipartFieldBuffer(boundary, key, value) {
  return Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="${multipartEscape(key)}"`,
    '',
    String(value ?? '')
  ].join('\r\n') + '\r\n', 'utf8');
}

function multipartFileBuffer(boundary, file) {
  const fieldName = file.fieldName || 'image[]';
  const filename = file.filename || 'reference.png';
  const contentType = file.contentType || file.mimeType || 'application/octet-stream';
  return Buffer.concat([
    Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="${multipartEscape(fieldName)}"; filename="${multipartEscape(filename)}"`,
      `Content-Type: ${contentType}`,
      '',
      ''
    ].join('\r\n'), 'utf8'),
    Buffer.from(file.buffer || Buffer.alloc(0)),
    Buffer.from('\r\n', 'utf8')
  ]);
}

export function buildMultipartBody({ fields = {}, files = [] } = {}) {
  const boundary = `----image-studio-${randomUUID()}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) chunks.push(multipartFieldBuffer(boundary, key, item));
    } else {
      chunks.push(multipartFieldBuffer(boundary, key, value));
    }
  }
  for (const file of files || []) {
    chunks.push(multipartFileBuffer(boundary, file));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    boundary,
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
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
