// SQLite-backed rate-limit store binding.
//
// Kept separate from services/db.js so the main database module can focus on
// schema wiring and exported repositories rather than per-feature store logic.

function parseRateLimitRow(row) {
  if (!row) return null;
  let hits = [];
  try {
    const parsed = JSON.parse(row.hits_json || '[]');
    if (Array.isArray(parsed)) {
      hits = parsed
        .map((ts) => Number(ts))
        .filter((ts) => Number.isFinite(ts));
    }
  } catch {
    hits = [];
  }
  return {
    key: row.key,
    hits,
    windowMs: Number(row.window_ms) || 0,
    lastSeen: Number(row.last_seen) || 0
  };
}

function bindRateLimitStore(db, { nowIso }) {
  return {
    get(key) {
      return parseRateLimitRow(
        db.prepare('SELECT key, hits_json, window_ms, last_seen FROM rate_limits WHERE key = ?').get(key)
      );
    },
    has(key) {
      return Boolean(db.prepare('SELECT 1 AS ok FROM rate_limits WHERE key = ?').get(key));
    },
    list() {
      return db.prepare('SELECT key, hits_json, window_ms, last_seen FROM rate_limits').all()
        .map(parseRateLimitRow)
        .filter(Boolean);
    },
    count() {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n) || 0;
    },
    upsert(key, entry) {
      db.prepare(`
        INSERT INTO rate_limits (key, hits_json, window_ms, last_seen, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          hits_json = excluded.hits_json,
          window_ms = excluded.window_ms,
          last_seen = excluded.last_seen,
          updated_at = excluded.updated_at
      `).run(
        key,
        JSON.stringify(Array.isArray(entry?.hits) ? entry.hits : []),
        Math.max(0, Math.floor(Number(entry?.windowMs) || 0)),
        Math.max(0, Math.floor(Number(entry?.lastSeen) || 0)),
        nowIso()
      );
    },
    delete(key) {
      db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
    },
    clear() {
      db.prepare('DELETE FROM rate_limits').run();
    },
    stats() {
      const rows = this.list();
      return {
        keys: rows.length,
        hits: rows.reduce((sum, row) => sum + row.hits.length, 0)
      };
    }
  };
}

export function createRateLimitRepository({ open, nowIso }) {
  return {
    withWriteLock(fn) {
      const db = open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(bindRateLimitStore(db, { nowIso }));
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* noop */ }
        throw err;
      }
    },
    get(key) {
      return bindRateLimitStore(open(), { nowIso }).get(key);
    },
    list() {
      return bindRateLimitStore(open(), { nowIso }).list();
    },
    clear() {
      return bindRateLimitStore(open(), { nowIso }).clear();
    },
    stats() {
      return bindRateLimitStore(open(), { nowIso }).stats();
    }
  };
}
