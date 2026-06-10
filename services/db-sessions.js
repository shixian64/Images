// SQLite-backed session repository.
//
// Session identifiers are stored hashed at rest; callers still receive/use the
// opaque bearer token value. Legacy plaintext IDs remain readable during
// migration via dual-key lookup.

import { createHash } from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ID_HASH_PREFIX = 'sid:v1:';

export function isSessionIdHash(value) {
  return String(value || '').startsWith(SESSION_ID_HASH_PREFIX);
}

export function hashSessionId(id) {
  const text = String(id || '').trim();
  return `${SESSION_ID_HASH_PREFIX}${createHash('sha256').update(text).digest('hex')}`;
}

function sessionLookupKeys(id) {
  const text = String(id || '').trim();
  if (!text) return [];
  const keys = [hashSessionId(text)];
  if (!isSessionIdHash(text)) keys.push(text);
  return [...new Set(keys)];
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

export function createSessionRepository({ open, nowIso }) {
  return {
    TTL_MS: SESSION_TTL_MS,
    create({ id, userId, userAgent, ip, csrfToken }) {
      const text = String(id || '').trim();
      if (!text) throw new Error('session id is required');
      const storedId = hashSessionId(text);
      const db = open();
      const now = new Date();
      const expires = new Date(now.getTime() + SESSION_TTL_MS);
      db.prepare(`
        INSERT INTO sessions (id, user_id, created_at, expires_at, csrf_token, user_agent, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storedId, userId, now.toISOString(), expires.toISOString(), csrfToken || null, userAgent || null, ip || null);
      return {
        id: text,
        sessionIdHash: storedId,
        userId,
        csrfToken: csrfToken || '',
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString()
      };
    },
    get(id) {
      const keys = sessionLookupKeys(id);
      if (!keys.length) return null;
      return open().prepare(`
        SELECT * FROM sessions
        WHERE id IN (${placeholders(keys)})
        LIMIT 1
      `).get(...keys) || null;
    },
    extend(id) {
      const keys = sessionLookupKeys(id);
      if (!keys.length) return null;
      const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      open().prepare(`
        UPDATE sessions
        SET expires_at = ?
        WHERE id IN (${placeholders(keys)})
      `).run(expires, ...keys);
      return expires;
    },
    setCsrfToken(id, csrfToken) {
      const keys = sessionLookupKeys(id);
      if (!keys.length) return 0;
      return open().prepare(`
        UPDATE sessions
        SET csrf_token = ?
        WHERE id IN (${placeholders(keys)})
      `).run(csrfToken || null, ...keys).changes || 0;
    },
    destroy(id) {
      const keys = sessionLookupKeys(id);
      if (!keys.length) return;
      open().prepare(`
        DELETE FROM sessions
        WHERE id IN (${placeholders(keys)})
      `).run(...keys);
    },
    destroyByUser(userId) {
      open().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },
    destroyExpired(cutoffIso = nowIso()) {
      const res = open().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(cutoffIso);
      return res.changes;
    },
    listByUser(userId) {
      return open().prepare(`
        SELECT id, user_id, created_at, expires_at, user_agent, ip
        FROM sessions WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId);
    }
  };
}
