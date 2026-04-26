// 上游 OpenAI-compatible API 适配层。未来接多家兼容网关时，按 §附录 B 的 Adapter 接口扩展。
// 当前覆盖 Image Generations 与 Chat Completions 两类模型。

import {
  CHAT_OPTIONAL_PASSTHROUGH_KEYS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_MODEL,
  OPTIONAL_PASSTHROUGH_KEYS
} from '../shared/constants.js';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

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

function isBlockedIpv6(ip) {
  const value = normalizeHostname(ip);
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isBlockedIpv4(mapped);
  }
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

export async function assertAllowedUpstreamUrl(url, { lookupImpl = dnsLookup } = {}) {
  const parsed = new URL(url);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:') {
    if (protocol !== 'http:' || process.env.ALLOW_INSECURE_UPSTREAMS !== '1') {
      throw new Error('Upstream URL must use https.');
    }
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) throw new Error('Upstream host is required.');

  // Local/private upstreams are useful in isolated development, but should be
  // explicit opt-in; otherwise user-controlled Base URL becomes SSRF.
  if (process.env.ALLOW_PRIVATE_UPSTREAMS === '1') return true;

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isBlockedAddress(host)) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isIP(host)) return true;

  let records;
  try {
    records = await lookupImpl(host, { all: true, verbatim: false });
  } catch (err) {
    throw new Error(`Unable to resolve upstream host: ${err.message || String(err)}`);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Unable to resolve upstream host.');
  }
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('Upstream host resolves to a private address.');
    }
  }
  return true;
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
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  let response;
  try {
    response = await fetchImpl(targetUrl, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        status: timedOut ? 504 : 499,
        data: { error: { message: timedOut ? timeoutMessage : 'Client closed request.' } },
        durationMs: Date.now() - started
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data, durationMs: Date.now() - started };
}
