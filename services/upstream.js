// 上游 OpenAI-compatible API 适配层。未来接多家兼容网关时，按 §附录 B 的 Adapter 接口扩展。
// 当前覆盖 Image Generations 与 Chat Completions 两类模型。

import {
  CHAT_OPTIONAL_PASSTHROUGH_KEYS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_MODEL,
  OPTIONAL_PASSTHROUGH_KEYS
} from '../shared/constants.js';

function normalizeBase(baseUrl) {
  const cleaned = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleaned) throw new Error('Base URL is required.');
  // eslint-disable-next-line no-new
  new URL(cleaned); // 触发 URL 合法性校验，由调用方兜底成 400。
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
  timeoutMessage = 'Upstream request timed out.'
}) {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
        status: 504,
        data: { error: { message: timeoutMessage } },
        durationMs: Date.now() - started
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data, durationMs: Date.now() - started };
}
