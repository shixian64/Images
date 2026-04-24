// 上游 Image API 适配层。未来接多家兼容网关时，按 §附录 B 的 ImageAdapter 接口扩展。
// 当前只覆盖 OpenAI-compatible /v1/images/generations。

import { DEFAULT_MODEL, OPTIONAL_PASSTHROUGH_KEYS } from '../shared/constants.js';

function normalizeBase(baseUrl) {
  const cleaned = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleaned) throw new Error('Base URL is required.');
  // eslint-disable-next-line no-new
  new URL(cleaned); // 触发 URL 合法性校验，由调用方兜底成 400。
  const hasV1 = cleaned.replace(/\/+$/, '').endsWith('/v1');
  return { base: cleaned, hasV1 };
}

// 把 "https://host" 或 "https://host/v1" 规范化为 /v1/images/generations 端点。
export function resolveApiUrl(baseUrl) {
  const { base, hasV1 } = normalizeBase(baseUrl);
  return `${base}${hasV1 ? '' : '/v1'}/images/generations`;
}

// 同样规则下的 /v1/models 端点，用于连通性测试（§4.1）。
export function resolveModelsUrl(baseUrl) {
  const { base, hasV1 } = normalizeBase(baseUrl);
  return `${base}${hasV1 ? '' : '/v1'}/models`;
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

// 调用上游。把 fetch 结果统一成 { ok, status, data, durationMs }。
export async function callUpstream({ targetUrl, apiKey, payload, fetchImpl = fetch }) {
  const started = Date.now();
  const response = await fetchImpl(targetUrl, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data, durationMs: Date.now() - started };
}
