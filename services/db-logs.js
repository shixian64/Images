// SQLite repositories for lightweight event/log tables.

import { randomUUID } from 'node:crypto';
import { normalizeAuditMeta } from './audit-meta.js';

function parseClientLog(row) {
  if (!row) return null;
  let meta = null;
  if (row.meta) {
    try { meta = JSON.parse(row.meta); } catch { meta = row.meta; }
  }
  const out = {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    clientTs: row.client_ts,
    receivedAt: row.received_at,
    level: row.level,
    message: row.message,
    meta,
    pageUrl: row.page_url,
    userAgent: row.user_agent,
    ip: row.ip
  };
  if (row.user_username || row.user_email || row.user_role) {
    out.user = {
      id: row.user_id,
      username: row.user_username || '',
      email: row.user_email || '',
      role: row.user_role || ''
    };
  }
  return out;
}

export function createImageLikeRepository({ open, nowIso }) {
  return {
    hasLiked(imageId, userId) {
      if (!imageId || !userId) return false;
      const row = open().prepare(
        'SELECT 1 AS ok FROM image_likes WHERE image_id = ? AND user_id = ? LIMIT 1'
      ).get(imageId, userId);
      return Boolean(row);
    },
    countForImage(imageId) {
      if (!imageId) return 0;
      return open().prepare(
        'SELECT COUNT(*) AS n FROM image_likes WHERE image_id = ?'
      ).get(imageId)?.n || 0;
    },
    countForImages(imageIds = []) {
      const ids = [...new Set((imageIds || []).filter(Boolean))];
      if (!ids.length) return new Map();
      const out = new Map();
      for (let i = 0; i < ids.length; i += 900) {
        const chunk = ids.slice(i, i + 900);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = open().prepare(`
          SELECT image_id, COUNT(*) AS n
          FROM image_likes
          WHERE image_id IN (${placeholders})
          GROUP BY image_id
        `).all(...chunk);
        for (const row of rows) out.set(row.image_id, Number(row.n) || 0);
      }
      return out;
    },
    likedImageIds(userId, imageIds = []) {
      const ids = [...new Set((imageIds || []).filter(Boolean))];
      if (!userId || !ids.length) return new Set();
      const out = new Set();
      for (let i = 0; i < ids.length; i += 900) {
        const chunk = ids.slice(i, i + 900);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = open().prepare(`
          SELECT image_id
          FROM image_likes
          WHERE user_id = ? AND image_id IN (${placeholders})
        `).all(userId, ...chunk);
        for (const row of rows) out.add(row.image_id);
      }
      return out;
    },
    countByUserDay(userId, day) {
      if (!userId || !day) return 0;
      return open().prepare(
        'SELECT COUNT(*) AS n FROM image_likes WHERE user_id = ? AND day = ?'
      ).get(userId, day)?.n || 0;
    },
    create({ imageId, userId, day, createdAt }) {
      const now = createdAt || nowIso();
      const res = open().prepare(`
        INSERT OR IGNORE INTO image_likes (image_id, user_id, created_at, day)
        VALUES (?, ?, ?, ?)
      `).run(imageId, userId, now, day || now.slice(0, 10));
      return { created: Boolean(res.changes), createdAt: now };
    }
  };
}

export function createAuditLogRepository({ open, nowIso }) {
  return {
    insert({ actorId, actorName, action, targetType, targetId, ip, userAgent, meta }) {
      const db = open();
      const id = randomUUID();
      const now = nowIso();
      db.prepare(`
        INSERT INTO audit_logs
        (id, created_at, actor_id, actor_name, action, target_type, target_id, ip, user_agent, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        now,
        actorId || null,
        actorName || null,
        action,
        targetType || null,
        targetId || null,
        ip || null,
        userAgent || null,
        meta === undefined || meta === null ? null : JSON.stringify(normalizeAuditMeta(meta))
      );
      return { id, createdAt: now };
    },
    listByTarget(targetType, targetId, limit = 50) {
      return open().prepare(`
        SELECT * FROM audit_logs
        WHERE target_type = ? AND target_id = ?
        ORDER BY created_at DESC LIMIT ?
      `).all(targetType, targetId, limit);
    },
    listByActor(actorId, limit = 50) {
      return open().prepare(`
        SELECT * FROM audit_logs
        WHERE actor_id = ?
        ORDER BY created_at DESC LIMIT ?
      `).all(actorId, limit);
    },
    listRecent(limit = 200) {
      return open().prepare(`
        SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?
      `).all(limit);
    },
    deleteOlderThan(cutoffIso) {
      if (!cutoffIso) return 0;
      const res = open().prepare('DELETE FROM audit_logs WHERE created_at < ?').run(cutoffIso);
      return res.changes;
    }
  };
}

export function createClientLogRepository({ open, nowIso }) {
  const repo = {
    insertMany(userId, items = [], { ip = null, userAgent = null } = {}) {
      if (!userId || !Array.isArray(items) || !items.length) return { inserted: 0, ignored: 0 };
      const db = open();
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO client_logs
        (id, user_id, client_id, client_ts, received_at, level, message, meta, page_url, user_agent, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let inserted = 0;
      let ignored = 0;
      for (const item of items) {
        const res = stmt.run(
          item.id || randomUUID(),
          userId,
          item.clientId || null,
          item.clientTs || null,
          item.receivedAt || nowIso(),
          item.level || 'info',
          item.message || '',
          item.meta === undefined || item.meta === null ? null : JSON.stringify(item.meta),
          item.pageUrl || null,
          userAgent || item.userAgent || null,
          ip || item.ip || null
        );
        if (res.changes) inserted += 1;
        else ignored += 1;
      }
      return { inserted, ignored };
    },
    listByUser(userId, { limit = 100, level = '', search = '' } = {}) {
      return repo.listAll({ userId, limit, level, search });
    },
    listAll({ limit = 300, userId = '', level = '', search = '' } = {}) {
      const clauses = [];
      const args = [];
      if (userId) {
        clauses.push('l.user_id = ?');
        args.push(userId);
      }
      if (level) {
        clauses.push('l.level = ?');
        args.push(level);
      }
      if (search) {
        const like = `%${search}%`;
        clauses.push(`(
          l.message LIKE ?
          OR l.meta LIKE ?
          OR l.page_url LIKE ?
          OR u.username LIKE ?
          OR u.email LIKE ?
        )`);
        args.push(like, like, like, like, like);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 300)));
      return open().prepare(`
        SELECT l.*, u.username AS user_username, u.email AS user_email, u.role AS user_role
        FROM client_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ${where}
        ORDER BY l.received_at DESC
        LIMIT ?
      `).all(...args, safeLimit).map(parseClientLog);
    },
    deleteOlderThan(cutoffIso) {
      if (!cutoffIso) return 0;
      const res = open().prepare('DELETE FROM client_logs WHERE received_at < ?').run(cutoffIso);
      return res.changes;
    }
  };
  return repo;
}
