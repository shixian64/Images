// 审计日志服务：路由层只需 record(req, action, target, meta)。
// TAG: hmt---

import { auditLogs } from './db.js';
import { logger } from '../utils/logger.js';

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req?.socket?.remoteAddress || 'unknown';
}

export function record(req, action, target = {}, meta = null) {
  try {
    const actor = req?.session?.user || null;
    auditLogs.insert({
      actorId: actor?.id || null,
      actorName: actor?.username || actor?.email || null,
      action,
      targetType: target.type || null,
      targetId: target.id || null,
      ip: clientIp(req),
      userAgent: req?.headers?.['user-agent'] || '',
      meta
    });
  } catch (err) {
    // 审计失败不应该影响业务，仅记录到 logger
    logger.warn('audit.record_failed', {
      action,
      error: err?.message || String(err)
    });
  }
}

export function listForTarget(targetType, targetId, limit = 50) {
  const rows = auditLogs.listByTarget(targetType, targetId, limit);
  return rows.map(rowToItem);
}

export function listRecent(limit = 200) {
  return auditLogs.listRecent(limit).map(rowToItem);
}

function rowToItem(row) {
  let meta = null;
  if (row.meta) {
    try { meta = JSON.parse(row.meta); } catch { meta = row.meta; }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    ip: row.ip,
    userAgent: row.user_agent,
    meta
  };
}
