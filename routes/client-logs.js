// Browser/client log ingestion and admin querying.

import { sendJson, sendMethodNotAllowed, readJsonBody, bodyErrorStatus, routeErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import { positiveIntFromEnv } from '../utils/config.js';
import { clientIp } from '../utils/request.js';
import { hit as rateLimitHit } from '../services/rate-limit.js';
import {
  listClientLogsForAdmin,
  recordClientLogs
} from '../services/client-logs.js';

const DEFAULT_CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE = 60;
const DEFAULT_CLIENT_LOG_RATE_LIMIT_WINDOW_MS = 60_000;

function clientLogLimitSnapshot() {
  return {
    rateMax: positiveIntFromEnv(
      'CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE',
      DEFAULT_CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE,
      { allowZero: true }
    ),
    rateWindowMs: positiveIntFromEnv(
      'CLIENT_LOG_RATE_LIMIT_WINDOW_MS',
      DEFAULT_CLIENT_LOG_RATE_LIMIT_WINDOW_MS,
      { allowZero: true }
    )
  };
}

function checkClientLogRateLimit(req, res) {
  const { rateMax, rateWindowMs } = clientLogLimitSnapshot();
  if (!rateMax || !rateWindowMs) return true;

  const ip = clientIp(req);
  const userId = req.session?.user?.id || 'anonymous';
  const checks = [
    `client-logs:user:${userId}`,
    `client-logs:ip:${ip}`
  ];

  for (const key of checks) {
    const result = rateLimitHit(key, rateMax, rateWindowMs);
    if (!result.allowed) {
      res.setHeader('retry-after', Math.ceil(result.retryAfterMs / 1000));
      sendJson(res, 429, { error: 'client log rate limited', code: 'client_log_rate_limited' });
      return false;
    }
  }
  return true;
}

export async function handleClientLogsRoute(req, res, pathname, urlObj) {
  if (pathname === '/api/client-logs' || pathname === '/api/client-logs/') {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    if (!checkClientLogRateLimit(req, res)) return;
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' }); }
    try {
      const result = recordClientLogs(req, body || {});
      return sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      return sendJson(res, routeErrorStatus(err), { error: err.message || String(err) });
    }
  }

  if (pathname === '/api/admin/client-logs' || pathname === '/api/admin/client-logs/') {
    if (!requireAdmin(req, res)) return;
    if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
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
