// /api/users* 路由：仅 admin 可用。
// TAG: hmt---

import { sendJson, readJsonBody } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import {
  listUsers,
  patchUser,
  createUserByAdmin,
  resetPasswordByAdmin,
  forceLogoutByAdmin,
  deleteUserByAdmin,
  getUserDetail
} from '../services/users.js';
import { record as auditRecord, listForTarget as listAuditForTarget } from '../services/audit.js';

const VALID_ROLES = new Set(['all', 'admin', 'user']);
const VALID_STATUSES = new Set(['all', 'active', 'disabled']);

function applyFilters(items, urlObj) {
  if (!urlObj) return items;
  const sp = urlObj.searchParams;
  const search = String(sp.get('search') || '').trim().toLowerCase();
  const role = String(sp.get('role') || 'all');
  const status = String(sp.get('status') || 'all');
  const validRole = VALID_ROLES.has(role) ? role : 'all';
  const validStatus = VALID_STATUSES.has(status) ? status : 'all';

  return items.filter((u) => {
    if (validRole !== 'all' && u.role !== validRole) return false;
    if (validStatus !== 'all' && u.status !== validStatus) return false;
    if (search) {
      const blob = `${u.username || ''}\n${u.email || ''}\n${u.id || ''}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

function statusFromError(msg) {
  if (msg === 'user not found') return 404;
  if (msg === 'self-modify forbidden') return 403;
  if (msg === 'cannot remove last active admin') return 409;
  if (msg === 'username already taken' || msg === 'email already taken') return 409;
  return 400;
}

async function handleCollection(req, res, urlObj) {
  if (req.method === 'GET') {
    const all = listUsers();
    const items = applyFilters(all, urlObj);
    sendJson(res, 200, { items, total: all.length, filtered: items.length });
    return;
  }
  if (req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    try {
      const user = createUserByAdmin(body || {});
      auditRecord(req, 'user.create', { type: 'user', id: user.id }, {
        username: user.username, email: user.email, role: user.role
      });
      sendJson(res, 200, { user });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }
  sendJson(res, 405, { error: 'method not allowed' });
}

async function handleDetail(req, res, id) {
  const method = req.method;

  if (method === 'GET') {
    try {
      const detail = getUserDetail(id);
      const audits = listAuditForTarget('user', id, 50);
      sendJson(res, 200, { ...detail, audits });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  if (method === 'PATCH') {
    let body;
    try { body = await readJsonBody(req); } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    const { role, status } = body || {};
    try {
      const user = patchUser(req.session.user.id, id, { role, status });
      auditRecord(req, 'user.patch', { type: 'user', id }, { role, status });
      sendJson(res, 200, { user });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  if (method === 'DELETE') {
    try {
      const result = await deleteUserByAdmin(req.session.user.id, id);
      auditRecord(req, 'user.delete', { type: 'user', id }, {
        removedImages: result.removedImages,
        removedBytes: result.removedBytes,
        username: result.user?.username
      });
      sendJson(res, 200, { ok: true, removed: result });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

async function handleAction(req, res, id, action) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  if (action === 'reset-password') {
    let body = {};
    try { body = await readJsonBody(req); } catch { /* 可空 */ }
    try {
      const result = resetPasswordByAdmin(req.session.user.id, id, body || {});
      auditRecord(req, 'user.reset_password', { type: 'user', id }, {
        generated: result.generated
      });
      // 仅当系统生成时回显明文，调用者口令不会回显
      sendJson(res, 200, {
        ok: true,
        generated: result.generated,
        password: result.generated ? result.password : null
      });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  if (action === 'logout') {
    try {
      const user = forceLogoutByAdmin(req.session.user.id, id);
      auditRecord(req, 'user.force_logout', { type: 'user', id });
      sendJson(res, 200, { ok: true, user });
    } catch (err) {
      sendJson(res, statusFromError(err.message), { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

export async function handleUsersRoute(req, res, pathname, urlObj) {
  if (!requireAdmin(req, res)) return;

  if (pathname === '/api/users' || pathname === '/api/users/') {
    return handleCollection(req, res, urlObj);
  }

  // /api/users/:id/<action>
  const action = pathname.match(/^\/api\/users\/([^/]+)\/([^/]+)\/?$/);
  if (action) {
    const id = decodeURIComponent(action[1]);
    const verb = action[2];
    return handleAction(req, res, id, verb);
  }

  // /api/users/:id
  const detail = pathname.match(/^\/api\/users\/([^/]+)\/?$/);
  if (detail) {
    const id = decodeURIComponent(detail[1]);
    return handleDetail(req, res, id);
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleUsersRoute;
