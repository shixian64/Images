// 额度路由：
//   /api/quota/me                     —— 当前用户的额度 + 用量
//   /api/admin/quota/defaults         —— 全局默认值 GET / PUT
//   /api/admin/quota/users            —— 所有用户额度 + 用量列表
//   /api/admin/quota/users/:id        —— GET / PUT / DELETE
//   /api/admin/quota/users/:id/reset  —— POST { scope: today|month }
// TAG: hmt---

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/guard.js';
import { users as usersTable } from '../services/db.js';
import {
  summary,
  effectiveQuota,
  usageSnapshot,
  patchUserQuota,
  clearUserQuota,
  getDefaults,
  setDefaults,
  resetUsage
} from '../services/quota.js';
import { record as auditRecord } from '../services/audit.js';
import { sanitizeUser } from '../services/auth.js';

function statusFromError(msg) {
  if (msg === 'user not found') return 404;
  if (String(msg).startsWith('invalid ')) return 400;
  return 400;
}

async function handleMe(req, res) {
  if (!requireAuth(req, res)) return;
  const data = summary(req.session.user.id);
  sendJson(res, 200, data);
}

async function handleDefaults(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { defaults: getDefaults() });
    return;
  }
  if (req.method === 'PUT') {
    let body = {};
    try { body = await readJsonBody(req); } catch (err) {
      sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      return;
    }
    try {
      const next = setDefaults(sanitizeQuotaPatch(body || {}), req.session.user.id);
      auditRecord(req, 'quota.defaults_update', { type: 'system', id: 'quota.defaults' }, next);
      sendJson(res, 200, { defaults: next });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }
  sendJson(res, 405, { error: 'method not allowed' });
}

function sanitizeQuotaPatch(body) {
  const allowed = ['daily_limit', 'monthly_limit', 'storage_limit_mb', 'concurrent_limit'];
  const out = {};
  for (const k of allowed) {
    if (body[k] === undefined) continue;
    const raw = body[k];
    if (raw === null || raw === '' || raw === 'null') {
      out[k] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`invalid ${k}`);
    out[k] = Math.floor(n);
  }
  return out;
}

async function handleListUsers(req, res) {
  const items = usersTable.list().map((u) => {
    const sum = summary(u.id);
    return {
      user: sanitizeUser(u),
      quota: sum.quota,
      usage: sum.usage
    };
  });
  sendJson(res, 200, { items, defaults: getDefaults() });
}

async function handleUserDetail(req, res, id) {
  const target = usersTable.findById(id);
  if (!target) {
    sendJson(res, 404, { error: 'user not found' });
    return;
  }

  const method = req.method;

  if (method === 'GET') {
    sendJson(res, 200, {
      user: sanitizeUser(target),
      quota: effectiveQuota(id),
      usage: usageSnapshot(id)
    });
    return;
  }

  if (method === 'PUT') {
    let body = {};
    try { body = await readJsonBody(req); } catch (err) {
      sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      return;
    }
    try {
      patchUserQuota(id, body || {}, req.session.user.id);
      const quota = effectiveQuota(id);
      auditRecord(req, 'quota.user_update', { type: 'user', id }, body);
      sendJson(res, 200, { quota, usage: usageSnapshot(id) });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  if (method === 'DELETE') {
    try {
      const quota = clearUserQuota(id);
      auditRecord(req, 'quota.user_clear', { type: 'user', id });
      sendJson(res, 200, { quota, usage: usageSnapshot(id) });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

async function handleUserReset(req, res, id) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const target = usersTable.findById(id);
  if (!target) { sendJson(res, 404, { error: 'user not found' }); return; }

  let body = {};
  try { body = await readJsonBody(req); } catch (err) {
    if (bodyErrorStatus(err) === 413) {
      sendJson(res, 413, { error: err.message });
      return;
    }
    /* allow empty */
  }
  const scope = body?.scope === 'month' ? 'month' : 'today';
  resetUsage(id, scope);
  auditRecord(req, 'quota.user_reset_usage', { type: 'user', id }, { scope });
  sendJson(res, 200, { ok: true, usage: usageSnapshot(id) });
}

export async function handleQuotaRoute(req, res, pathname) {
  // /api/quota/me
  if (pathname === '/api/quota/me') return handleMe(req, res);

  // 以下需 admin
  if (!requireAdmin(req, res)) return;

  if (pathname === '/api/admin/quota/defaults') {
    return handleDefaults(req, res);
  }
  if (pathname === '/api/admin/quota/users') {
    if (req.method === 'GET') return handleListUsers(req, res);
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const reset = pathname.match(/^\/api\/admin\/quota\/users\/([^/]+)\/reset\/?$/);
  if (reset) {
    return handleUserReset(req, res, decodeURIComponent(reset[1]));
  }
  const detail = pathname.match(/^\/api\/admin\/quota\/users\/([^/]+)\/?$/);
  if (detail) {
    return handleUserDetail(req, res, decodeURIComponent(detail[1]));
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleQuotaRoute;
