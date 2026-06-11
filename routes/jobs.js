// /api/jobs and /api/admin/jobs routes for the persistent generation queue.

import { sendJson, sendMethodNotAllowed, readJsonBody, bodyErrorStatus, routeErrorStatus } from '../utils/http.js';
import { createSseSession, openSse, writeSse } from '../utils/sse.js';
import { requireAdmin } from '../middleware/guard.js';
import { record as auditRecord } from '../services/audit.js';
import {
  cancelJob,
  getAdminJob,
  getAdminJobs,
  getJobForUser,
  getQueueSettings,
  getUserJobs,
  queueEventWatermark,
  queueStats,
  replayAdminJobEvents,
  replaySingleJobEvents,
  replayUserJobEvents,
  retryJob,
  setQueueSettings,
  subscribeAdminJobs,
  subscribeJob,
  subscribeUserJobs,
  updateJobPriority
} from '../services/job-queue.js';

function replayAfterId(req, url) {
  const raw = url?.searchParams?.get('after')
    || req.headers?.['last-event-id']
    || req.headers?.['Last-Event-ID']
    || '';
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
}

async function readBodyOrEmpty(req) {
  try { return await readJsonBody(req); }
  catch (err) {
    if (bodyErrorStatus(err) === 413) throw err;
    return {};
  }
}

async function handleUserJobs(req, res, pathname, url) {
  const user = req.session.user;

  if (pathname === '/api/jobs') {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    return sendJson(res, 200, { items: getUserJobs(user.id) });
  }

  if (pathname === '/api/jobs/stream') {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    openSse(res);
    const cleanup = subscribeUserJobs(user.id, res);
    replayUserJobEvents(user.id, res, { afterId: replayAfterId(req, url) });
    writeSse(res, 'snapshot', { items: getUserJobs(user.id) }, { id: queueEventWatermark() || null });
    createSseSession(res, { heartbeatMs: 25_000, onClose: cleanup });
    return;
  }

  const streamMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/stream\/?$/);
  if (streamMatch) {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    const id = decodeURIComponent(streamMatch[1]);
    try {
      const job = getJobForUser(id, user);
      openSse(res);
      const cleanup = subscribeJob(id, res);
      replaySingleJobEvents(id, res, { afterId: replayAfterId(req, url) });
      writeSse(res, 'snapshot', { job: getJobForUser(id, user) }, { id: queueEventWatermark() || null });
      createSseSession(res, { heartbeatMs: 25_000, onClose: cleanup });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err) });
    }
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel\/?$/);
  if (cancelMatch) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      const job = cancelJob(decodeURIComponent(cancelMatch[1]), user);
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err), code: err.code });
    }
  }

  const retryMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/retry\/?$/);
  if (retryMatch) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      const job = await retryJob(decodeURIComponent(retryMatch[1]), user);
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err), code: err.code });
    }
  }

  const detailMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/?$/);
  if (detailMatch) {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    try {
      const job = getJobForUser(decodeURIComponent(detailMatch[1]), user);
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err) });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

async function handleAdminJobs(req, res, pathname, url) {
  if (!requireAdmin(req, res)) return;

  if (pathname === '/api/admin/jobs') {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    const status = url?.searchParams?.get('status') || '';
    const userId = url?.searchParams?.get('userId') || '';
    const limit = Number(url?.searchParams?.get('limit') || 200) || 200;
    return sendJson(res, 200, {
      items: getAdminJobs({ limit, status, userId }),
      settings: getQueueSettings(),
      stats: queueStats()
    });
  }

  if (pathname === '/api/admin/jobs/stream') {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    openSse(res);
    const cleanup = subscribeAdminJobs(res);
    replayAdminJobEvents(res, { afterId: replayAfterId(req, url) });
    writeSse(res, 'snapshot', {
      items: getAdminJobs({ limit: 200 }),
      settings: getQueueSettings(),
      stats: queueStats()
    }, { id: queueEventWatermark() || null });
    createSseSession(res, { heartbeatMs: 25_000, onClose: cleanup });
    return;
  }

  if (pathname === '/api/admin/jobs/settings') {
    if (req.method === 'GET') return sendJson(res, 200, { settings: getQueueSettings() });
    if (req.method === 'PUT') {
      let body;
      try { body = await readBodyOrEmpty(req); }
      catch (err) { return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' }); }
      try {
        const settings = setQueueSettings(body || {}, req.session.user.id);
        auditRecord(req, 'queue.settings_update', { type: 'system', id: 'queue.settings' }, {
          patch: body || {},
          settings
        });
        return sendJson(res, 200, { settings });
      } catch (err) {
        return sendJson(res, routeErrorStatus(err), { error: err.message || String(err) });
      }
    }
    return sendMethodNotAllowed(res, ['GET', 'PUT']);
  }

  const cancelMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/cancel\/?$/);
  if (cancelMatch) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      const job = cancelJob(decodeURIComponent(cancelMatch[1]), req.session.user, { admin: true });
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err), code: err.code });
    }
  }

  const priorityMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/priority\/?$/);
  if (priorityMatch) {
    if (req.method !== 'PATCH' && req.method !== 'POST') return sendMethodNotAllowed(res, ['PATCH', 'POST']);
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' }); }
    try {
      const job = updateJobPriority(decodeURIComponent(priorityMatch[1]), body?.priority, req.session.user);
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err), code: err.code });
    }
  }

  const detailMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/?$/);
  if (detailMatch) {
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
    try {
      const job = getAdminJob(decodeURIComponent(detailMatch[1]));
      if (!job) return sendJson(res, 404, { error: 'job not found' });
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err) });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

export async function handleJobsRoute(req, res, pathname, url) {
  if (pathname.startsWith('/api/admin/jobs')) return handleAdminJobs(req, res, pathname, url);
  if (pathname.startsWith('/api/jobs')) return handleUserJobs(req, res, pathname, url);
  return sendJson(res, 404, { error: 'not found' });
}

export default handleJobsRoute;
