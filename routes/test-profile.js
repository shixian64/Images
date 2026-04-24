// POST /api/test-profile —— 用 GET /v1/models 探活。
// 对应文档 §4.1 首次上手：添加 Key 后自动探测可用模型。

import { readJsonBody, sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { resolveModelsUrl } from '../services/upstream.js';

export async function handleTestProfile(req, res) {
  const started = Date.now();
  let body = {};
  try {
    body = await readJsonBody(req);
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) throw new Error('API key is required.');
    const targetUrl = resolveModelsUrl(body.baseUrl);
    const kind = body.kind === 'chat' ? 'chat' : 'image';

    logger.info('profile.test.request', {
      targetUrl,
      kind,
      profileName: body.name,
      apiKey: maskApiKey(apiKey)
    });

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'authorization': `Bearer ${apiKey}`, 'accept': 'application/json' }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const durationMs = Date.now() - started;

    if (!response.ok) {
      const error = data?.error?.message || data?.message || `Request failed with ${response.status}`;
      logger.warn('profile.test.failed', { status: response.status, durationMs, kind, error });
      return sendJson(res, response.status, { ok: false, error, details: data });
    }

    const models = Array.isArray(data?.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    logger.info('profile.test.success', { status: response.status, durationMs, kind, modelCount: models.length });
    return sendJson(res, 200, {
      ok: true,
      status: response.status,
      kind,
      durationMs,
      modelCount: models.length,
      models: models.slice(0, 50)
    });
  } catch (error) {
    logger.warn('profile.test.rejected', {
      durationMs: Date.now() - started,
      baseUrl: body?.baseUrl,
      error: error.message || String(error)
    });
    return sendJson(res, 400, { ok: false, error: error.message || String(error) });
  }
}
