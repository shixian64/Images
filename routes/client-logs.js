// Browser/client log ingestion and admin querying.

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import {
  listClientLogsForAdmin,
  recordClientLogs
} from '../services/client-logs.js';

function statusFromError(err) {
  return err?.statusCode || bodyErrorStatus(err);
}

export async function handleClientLogsRoute(req, res, pathname, urlObj) {
  if (pathname === '/api/client-logs' || pathname === '/api/client-logs/') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' }); }
    try {
      const result = recordClientLogs(req, body || {});
      return sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      return sendJson(res, statusFromError(err), { error: err.message || String(err) });
    }
  }

  if (pathname === '/api/admin/client-logs' || pathname === '/api/admin/client-logs/') {
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    const params = urlObj?.searchParams;
    return sendJson(res, 200, {
      items: listClientLogsForAdmin({
        userId: params?.get('userId') || '',
        level: params?.get('level') || '',
        search: params?.get('search') || '',
        limit: params?.get('limit') || 300
      })
    });
  }

  return sendJson(res, 404, { error: 'not found' });
}

export default handleClientLogsRoute;
