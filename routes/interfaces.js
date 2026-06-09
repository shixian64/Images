// 接口管理路由：
//   /api/interfaces/default                 —— 当前用户读取系统默认接口摘要
//   /api/admin/interfaces/default           —— 管理员读取/保存全局默认接口
//   /api/admin/interfaces/default/test      —— 管理员测试已保存的全局默认接口

import { readJsonBody, sendJson, sendMethodNotAllowed, bodyErrorStatus, routeErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import { record as auditRecord } from '../services/audit.js';
import {
  adminInterfaceConfig,
  getGlobalInterfaceConfig,
  getSystemEndpoint,
  setGlobalInterfaceConfig
} from '../services/interface-defaults.js';
import { guardedFetch, readResponseTextLimited, resolveModelsUrl } from '../services/upstream.js';
import { logger } from '../utils/logger.js';
import { maskApiKey, redactSecrets } from '../utils/mask.js';

const VALID_KINDS = new Set(['image', 'chat']);
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

function kindLabel(kind) {
  return kind === 'chat' ? '对话' : '生图';
}

const INTERFACE_ERROR_STATUS_OPTIONS = Object.freeze({
  includes: {
    '缺少 API Key': 400,
    '已停用': 409
  }
});

function publicPayload() {
  return { default: getGlobalInterfaceConfig({ publicView: true }) };
}

function adminPayload(config = getGlobalInterfaceConfig()) {
  return { default: adminInterfaceConfig(config) };
}

async function handlePublicDefault(req, res) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, ['GET']);
    return;
  }
  sendJson(res, 200, publicPayload());
}

async function handleAdminDefault(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    sendJson(res, 200, adminPayload());
    return;
  }

  if (req.method === 'PUT') {
    let body = {};
    try { body = await readJsonBody(req); } catch (err) {
      sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      return;
    }
    try {
      const next = setGlobalInterfaceConfig(body || {}, req.session.user.id);
      auditRecord(req, 'interface.default_update', { type: 'system', id: 'interfaces.default' }, {
        enabled: next.enabled,
        name: next.name,
        imageBaseUrl: next.image.baseUrl,
        imageModel: next.image.defaultModel,
        imageHasKey: Boolean(next.image.apiKey),
        chatBaseUrl: next.chat.baseUrl,
        chatModel: next.chat.defaultModel,
        chatHasKey: Boolean(next.chat.apiKey)
      });
      sendJson(res, 200, adminPayload(next));
    } catch (err) {
      sendJson(res, routeErrorStatus(err, INTERFACE_ERROR_STATUS_OPTIONS), { error: err.message || String(err) });
    }
    return;
  }

  sendMethodNotAllowed(res, ['GET', 'PUT']);
}

async function handleAdminTest(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  let body = {};
  try { body = await readJsonBody(req); } catch (err) {
    if (bodyErrorStatus(err) === 413) {
      sendJson(res, 413, { error: err.message });
      return;
    }
    body = {};
  }

  const kind = VALID_KINDS.has(body?.kind) ? body.kind : 'image';
  const started = Date.now();
  let probeApiKey = '';

  try {
    const endpoint = getSystemEndpoint(kind);
    probeApiKey = endpoint.apiKey;
    const targetUrl = resolveModelsUrl(endpoint.baseUrl);

    logger.info('interface.default.test.request', {
      kind,
      targetUrl,
      apiKey: maskApiKey(endpoint.apiKey)
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), testProfileTimeoutMs());
    timeoutId.unref?.();
    let response;
    let text;
    try {
      response = await guardedFetch(targetUrl, {
        method: 'GET',
        headers: { authorization: `Bearer ${endpoint.apiKey}`, accept: 'application/json' },
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
      const upstreamError = redactSecrets(data?.error?.message || data?.message || `Request failed with ${response.status}`, [probeApiKey]);
      const error = safeProbeError(response.status);
      const next = setGlobalInterfaceConfig({
        [kind]: {
          testStatus: 'err',
          testLatencyMs: null,
          testedAt: new Date().toISOString(),
          testError: error
        }
      }, req.session.user.id);
      logger.warn('interface.default.test.failed', { kind, status: response.status, durationMs, error: upstreamError });
      auditRecord(req, 'interface.default_test_failed', { type: 'system', id: 'interfaces.default' }, {
        kind,
        status: response.status,
        error
      });
      sendJson(res, UPSTREAM_PROBE_FAILURE_STATUS, {
        ok: false,
        error,
        default: adminInterfaceConfig(next)
      });
      return;
    }

    const models = Array.isArray(data?.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    const next = setGlobalInterfaceConfig({
      [kind]: {
        testStatus: 'ok',
        testLatencyMs: durationMs,
        testedAt: new Date().toISOString(),
        testError: ''
      }
    }, req.session.user.id);
    logger.info('interface.default.test.success', { kind, durationMs, modelCount: models.length });
    auditRecord(req, 'interface.default_test_ok', { type: 'system', id: 'interfaces.default' }, {
      kind,
      durationMs,
      modelCount: models.length
    });
    sendJson(res, 200, {
      ok: true,
      kind,
      label: kindLabel(kind),
      durationMs,
      modelCount: models.length,
      models: models.slice(0, 50),
      default: adminInterfaceConfig(next)
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const error = redactSecrets(err.message || String(err), [probeApiKey]);
    const next = setGlobalInterfaceConfig({
      [kind]: {
        testStatus: 'err',
        testLatencyMs: null,
        testedAt: new Date().toISOString(),
        testError: error
      }
    }, req.session.user.id);
    logger.warn('interface.default.test.rejected', { kind, durationMs, error });
    sendJson(res, routeErrorStatus(err, INTERFACE_ERROR_STATUS_OPTIONS), {
      ok: false,
      error,
      default: adminInterfaceConfig(next)
    });
  }
}

export async function handleInterfacesRoute(req, res, pathname) {
  if (pathname === '/api/interfaces/default') {
    return handlePublicDefault(req, res);
  }
  if (pathname === '/api/admin/interfaces/default') {
    return handleAdminDefault(req, res);
  }
  if (pathname === '/api/admin/interfaces/default/test') {
    return handleAdminTest(req, res);
  }
  sendJson(res, 404, { error: 'not found' });
}

export default handleInterfacesRoute;
