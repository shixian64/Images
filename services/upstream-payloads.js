import {
  CHAT_OPTIONAL_PASSTHROUGH_KEYS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_MODEL,
  OPTIONAL_PASSTHROUGH_KEYS
} from '../shared/constants.js';

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
