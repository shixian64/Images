// /api/users* 路由：仅 admin 可用。
// TAG: hmt---

import { sendJson, sendMethodNotAllowed, readJsonBody, bodyErrorStatus, routeErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import {
  listUsers,
  countUsers,
  patchUser,
  createUserByAdmin,
  resetPasswordByAdmin,
  forceLogoutByAdmin,
  deleteUserByAdmin,
  getUserDetail
} from '../services/users.js';
import { record as auditRecord, listForActor as listAuditForActor, listForTarget as listAuditForTarget } from '../services/audit.js';
import { getAdminJobs } from '../services/job-queue.js';
import { listClientLogsForUser } from '../services/client-logs.js';

const VALID_ROLES = new Set(['all', 'admin', 'user']);
const VALID_STATUSES = new Set(['all', 'active', 'disabled']);
const DETAIL_INCLUDES = new Set(['audits', 'activityLogs', 'jobs', 'clientLogs']);

function listOptionsFromQuery(urlObj) {
  const sp = urlObj.searchParams;
  const search = String(sp.get('search') || '').trim().toLowerCase();
  const role = String(sp.get('role') || 'all');
  const status = String(sp.get('status') || 'all');
  const validRole = VALID_ROLES.has(role) ? role : 'all';
  const validStatus = VALID_STATUSES.has(status) ? status : 'all';
  const page = Math.max(1, Math.floor(Number(sp.get('page') || 1)));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(sp.get('size') || sp.get('pageSize') || 50))));
  return {
    page,
    pageSize,
    search,
    role: validRole === 'all' ? '' : validRole,
    status: validStatus === 'all' ? '' : validStatus
  };
}

function detailIncludesFromQuery(urlObj) {
  const raw = String(urlObj?.searchParams?.get('include') || '').trim();
  if (!raw) return new Set();
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.includes('all')) return new Set(DETAIL_INCLUDES);
  return new Set(parts.filter((item) => DETAIL_INCLUDES.has(item)));
}

function appendUserDetailIncludes(id, payload, includes) {
  if (includes.has('audits')) payload.audits = listAuditForTarget('user', id, 50);
  if (includes.has('activityLogs')) payload.activityLogs = listAuditForActor(id, 50);
  if (includes.has('jobs')) payload.jobs = getAdminJobs({ userId: id, limit: 50 });
  if (includes.has('clientLogs')) payload.clientLogs = listClientLogsForUser(id, { limit: 100 });
  return payload;
}

async function handleCollection(req, res, urlObj) {
  if (req.method === 'GET') {
    const options = listOptionsFromQuery(urlObj);
    const items = listUsers(options);
    const total = countUsers();
    const filtered = countUsers(options);
    sendJson(res, 200, {
      items,
      total,
      filtered,
      page: options.page,
      pageSize: options.pageSize
    });
    return;
  }
  if (req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch (err) {
      sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      return;
    }
    try {
      const user = createUserByAdmin(body || {});
      auditRecord(req, 'user.create', { type: 'user', id: user.id }, {
        username: user.username, email: user.email, role: user.role
      });
      sendJson(res, 200, { user });
    } catch (err) {
      sendJson(res, routeErrorStatus(err), { error: err.message });
    }
    return;
  }
  sendMethodNotAllowed(res, ['GET', 'POST']);
}

async function handleDetail(req, res, id, urlObj) {
  const method = req.method;

  if (method === 'GET') {
    try {
      const detail = getUserDetail(id);
      const includes = detailIncludesFromQuery(urlObj);
      sendJson(res, 200, appendUserDetailIncludes(id, { ...detail }, includes));
    } catch (err) {
      sendJson(res, routeErrorStatus(err), { error: err.message });
    }
    return;
  }

  if (method === 'PATCH') {
    let body;
    try { body = await readJsonBody(req); } catch (err) {
      sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      return;
    }
    const { role, status } = body || {};
    try {
      const user = patchUser(req.session.user.id, id, { role, status });
      auditRecord(req, 'user.patch', { type: 'user', id }, { role, status });
      sendJson(res, 200, { user });
    } catch (err) {
      sendJson(res, routeErrorStatus(err), { error: err.message });
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
      sendJson(res, routeErrorStatus(err), { error: err.message });
    }
    return;
  }

  sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
}

async function handleAction(req, res, id, action) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  if (action === 'reset-password') {
    let body = {};
    try { body = await readJsonBody(req); } catch (err) {
      if (bodyErrorStatus(err) === 413) {
        sendJson(res, 413, { error: err.message });
        return;
      }
      /* 可空 */
    }
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
      sendJson(res, routeErrorStatus(err), { error: err.message });
    }
    return;
  }

  if (action === 'logout') {
    try {
      const user = forceLogoutByAdmin(req.session.user.id, id);
      auditRecord(req, 'user.force_logout', { type: 'user', id });
      sendJson(res, 200, { ok: true, user });
    } catch (err) {
      sendJson(res, routeErrorStatus(err), { error: err.message });
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
    return handleDetail(req, res, id, urlObj);
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleUsersRoute;
