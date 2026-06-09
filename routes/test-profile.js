// POST /api/test-profile —— 用 GET /v1/models 探活。
// 对应文档 §4.1 首次上手：添加 Key 后自动探测可用模型。

import { readJsonBody, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey, redactSecrets } from '../utils/mask.js';
import { guardedFetch, readResponseTextLimited, resolveModelsUrl } from '../services/upstream.js';

const DEFAULT_TEST_PROFILE_TIMEOUT_MS = 30_000;
const UPSTREAM_PROBE_FAILURE_STATUS = 502;

function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function testProfileTimeoutMs() {
  return envPositiveInt('TEST_PROFILE_TIMEOUT_MS', DEFAULT_TEST_PROFILE_TIMEOUT_MS);
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function safeProbeError(status) {
  if (status === 401 || status === 403) return 'Upstream rejected the API key or access.';
  if (status >= 500) return 'Upstream service returned an error.';
  return 'Upstream profile test failed.';
}

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), testProfileTimeoutMs());
    timeoutId.unref?.();
    let response;
    let text;
    try {
      response = await guardedFetch(targetUrl, {
        method: 'GET',
        headers: { 'authorization': `Bearer ${apiKey}`, 'accept': 'application/json' },
        redirect: 'manual',
        signal: controller.signal
      });
      text = await readResponseTextLimited(response, undefined, { signal: controller.signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw httpError(504, 'Profile test timed out.');
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const durationMs = Date.now() - started;

    if (!response.ok) {
      const upstreamError = redactSecrets(data?.error?.message || data?.message || `Request failed with ${response.status}`, [apiKey]);
      const error = safeProbeError(response.status);
      logger.warn('profile.test.failed', { status: response.status, durationMs, kind, error: upstreamError });
      return sendJson(res, UPSTREAM_PROBE_FAILURE_STATUS, { ok: false, error });
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
    const safeError = redactSecrets(error.message || String(error), [body?.apiKey]);
    logger.warn('profile.test.rejected', {
      durationMs: Date.now() - started,
      baseUrl: body?.baseUrl,
      error: safeError
    });
    return sendJson(res, bodyErrorStatus(error), { ok: false, error: safeError });
  }
}
