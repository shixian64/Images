// SQLite 单例 + 迁移 + CRUD 包装。
// 使用 node:sqlite（Node 22.5+ 内置，零编译）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { PROMPT_SQUARE_SEEDS, PROMPTSREF_SREF_SOURCE_URL } from './prompt-square-seeds.js';

const DB_DIR = join(process.cwd(), 'generated');
const DB_PATH = join(DB_DIR, 'app.db');
const LEGACY_GALLERY = join(DB_DIR, 'gallery.json');
const LEGACY_GALLERY_DONE = join(DB_DIR, 'gallery.json.migrated');

let _db = null;

function open() {
  if (_db) return _db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  return _db;
}

function nowIso() {
  return new Date().toISOString();
}

const PROMPT_SQUARE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_prompt_square_published ON prompt_square(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_square_user      ON prompt_square(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_square_source    ON prompt_square(user_id, source_prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_square_source_id ON prompt_square(source_prompt_id);
`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user',
  status          TEXT NOT NULL DEFAULT 'active',
  avatar_url      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_login_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  filename        TEXT NOT NULL,
  path            TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  bytes           INTEGER NOT NULL,
  prompt          TEXT,
  revised_prompt  TEXT,
  model           TEXT,
  size            TEXT,
  quality         TEXT,
  output_format   TEXT,
  profile_name    TEXT,
  source_type     TEXT,
  image_index     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_user_created ON images(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_created      ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_model        ON images(model);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  ip          TEXT,
  user_agent  TEXT,
  meta        TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_target  ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_limit      INTEGER,
  monthly_limit    INTEGER,
  storage_limit_mb INTEGER,
  concurrent_limit INTEGER,
  updated_at       TEXT NOT NULL,
  updated_by       TEXT
);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id     TEXT NOT NULL,
  day         TEXT NOT NULL,
  call_count  INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0,
  fail_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_daily(user_id, day DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS prompt_square (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  source_prompt_id  TEXT,
  title             TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  tags              TEXT NOT NULL DEFAULT '[]',
  source            TEXT NOT NULL DEFAULT 'manual',
  meta              TEXT NOT NULL DEFAULT '{}',
  use_count         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  published_at      TEXT NOT NULL
);
${PROMPT_SQUARE_INDEXES}
`;

export function migrate() {
  const db = open();
  db.exec(SCHEMA);
  migratePromptSquareNullableOwner(db);
  seedPromptSquareDefaults(db);
  migrateLegacyGallery(db);
}

function migratePromptSquareNullableOwner(db) {
  const cols = db.prepare('PRAGMA table_info(prompt_square)').all();
  const userIdCol = cols.find((col) => col.name === 'user_id');
  if (!userIdCol?.notnull) return;

  logger.info('migration.prompt_square.nullable_owner.start');
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec(`
      DROP TABLE IF EXISTS prompt_square_new;
      CREATE TABLE prompt_square_new (
        id                TEXT PRIMARY KEY,
        user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
        source_prompt_id  TEXT,
        title             TEXT NOT NULL,
        prompt            TEXT NOT NULL,
        tags              TEXT NOT NULL DEFAULT '[]',
        source            TEXT NOT NULL DEFAULT 'manual',
        meta              TEXT NOT NULL DEFAULT '{}',
        use_count         INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        published_at      TEXT NOT NULL
      );
      INSERT INTO prompt_square_new
      (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
      SELECT id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at
      FROM prompt_square;
      DROP TABLE prompt_square;
      ALTER TABLE prompt_square_new RENAME TO prompt_square;
    `);
    db.exec(PROMPT_SQUARE_INDEXES);
    logger.info('migration.prompt_square.nullable_owner.done');
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function seedPromptSquareDefaults(db) {
  const seedKey = 'prompt_square.seed.promptsref_sref_v3';
  const done = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(seedKey);
  if (done) return;

  const exists = db.prepare('SELECT id, published_at FROM prompt_square WHERE source_prompt_id = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO prompt_square
    (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
    VALUES (?, NULL, ?, ?, ?, ?, 'seed', ?, 0, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE prompt_square
    SET title = ?, prompt = ?, tags = ?, source = 'seed', meta = ?, updated_at = ?
    WHERE id = ?
  `);
  const startedAt = Date.now();
  let inserted = 0;
  let updated = 0;
  for (const seed of PROMPT_SQUARE_SEEDS) {
    const sourcePromptId = `promptsref:sref:${seed.sref}`;
    const existing = exists.get(sourcePromptId);
    const publishedAt = new Date(startedAt - (seed.rank - 1) * 1000).toISOString();
    const meta = {
      seed: true,
      sourceName: 'Promptsref',
      sourceUrl: PROMPTSREF_SREF_SOURCE_URL,
      sourceRank: seed.rank,
      sourceHot: seed.sourceHot,
      sref: seed.sref,
      previewImages: Array.isArray(seed.previewImages) ? seed.previewImages : []
    };
    if (existing) {
      const res = update.run(
        seed.title,
        seed.prompt,
        JSON.stringify(seed.tags),
        JSON.stringify(meta),
        nowIso(),
        existing.id
      );
      if (res.changes) updated += 1;
      continue;
    }
    const res = insert.run(
      randomUUID(),
      sourcePromptId,
      seed.title,
      seed.prompt,
      JSON.stringify(seed.tags),
      JSON.stringify(meta),
      publishedAt,
      publishedAt,
      publishedAt
    );
    if (res.changes) inserted += 1;
  }

  db.prepare(`
    INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, NULL)
  `).run(seedKey, JSON.stringify({
    sourceUrl: PROMPTSREF_SREF_SOURCE_URL,
    total: PROMPT_SQUARE_SEEDS.length,
    inserted,
    updated
  }), nowIso());
  logger.info('prompt_square.seed.done', { source: 'promptsref_sref_v3', inserted, updated });
}

function migrateLegacyGallery(db) {
  if (!existsSync(LEGACY_GALLERY)) return;
  const adminRow = db.prepare(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
  ).get();
  if (!adminRow) {
    logger.info('migration.deferred', { reason: 'no admin yet, gallery.json kept' });
    return;
  }
  let parsed;
  try {
    const raw = readFileSync(LEGACY_GALLERY, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn('migration.gallery.read_failed', { error: err.message });
    return;
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO images
    (id, user_id, created_at, filename, path, mime_type, bytes,
     prompt, revised_prompt, model, size, quality, output_format,
     profile_name, source_type, image_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const it of items) {
    if (!it?.id || !it?.path) continue;
    const res = stmt.run(
      it.id,
      adminRow.id,
      it.createdAt || nowIso(),
      it.filename || '',
      it.path,
      it.mimeType || 'application/octet-stream',
      Number(it.bytes) || 0,
      it.prompt || null,
      it.revisedPrompt || null,
      it.model || null,
      it.size || null,
      it.quality || null,
      it.outputFormat || null,
      it.profileName || null,
      it.sourceType || null,
      Number.isFinite(it.index) ? it.index : null
    );
    if (res.changes) inserted += 1;
  }
  try {
    renameSync(LEGACY_GALLERY, LEGACY_GALLERY_DONE);
  } catch (err) {
    logger.warn('migration.gallery.rename_failed', { error: err.message });
  }
  logger.info('migration.gallery.done', { items: items.length, inserted });
}

// ---- users ----

export const users = {
  count() {
    return open().prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },
  create({ username, email, passwordHash, passwordSalt, role = 'user' }) {
    const db = open();
    const id = randomUUID();
    const now = nowIso();
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, password_salt, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, username, email, passwordHash, passwordSalt, role, now, now);
    return this.findById(id);
  },
  findById(id) {
    return open().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  },
  findByLogin(login) {
    return open().prepare(
      'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1'
    ).get(login, login) || null;
  },
  list() {
    return open().prepare(`
      SELECT id, username, email, role, status, avatar_url, created_at, updated_at, last_login_at
      FROM users
      ORDER BY created_at ASC
    `).all();
  },
  countAdmins() {
    return open().prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"
    ).get().n;
  },
  updateRole(id, role) {
    open().prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), id);
    return this.findById(id);
  },
  updateStatus(id, status) {
    open().prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    return this.findById(id);
  },
  updatePassword(id, passwordHash, passwordSalt) {
    open().prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?'
    ).run(passwordHash, passwordSalt, nowIso(), id);
  },
  updateProfile(id, { username, email, avatarUrl }) {
    const cur = this.findById(id);
    if (!cur) return null;
    open().prepare(`
      UPDATE users SET username = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?
    `).run(
      username ?? cur.username,
      email ?? cur.email,
      avatarUrl ?? cur.avatar_url,
      nowIso(),
      id
    );
    return this.findById(id);
  },
  touchLogin(id) {
    open().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), id);
  },
  delete(id) {
    open().prepare('DELETE FROM users WHERE id = ?').run(id);
  }
};

// ---- sessions ----

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const sessions = {
  TTL_MS: SESSION_TTL_MS,
  create({ id, userId, userAgent, ip }) {
    const db = open();
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_TTL_MS);
    db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, now.toISOString(), expires.toISOString(), userAgent || null, ip || null);
    return { id, userId, createdAt: now.toISOString(), expiresAt: expires.toISOString() };
  },
  get(id) {
    return open().prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
  },
  extend(id) {
    const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    open().prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expires, id);
    return expires;
  },
  destroy(id) {
    open().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },
  destroyByUser(userId) {
    open().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },
  destroyExpired() {
    const res = open().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
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

// ---- images ----

export const images = {
  insert(meta) {
    const db = open();
    db.prepare(`
      INSERT INTO images
      (id, user_id, created_at, filename, path, mime_type, bytes,
       prompt, revised_prompt, model, size, quality, output_format,
       profile_name, source_type, image_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.id,
      meta.userId,
      meta.createdAt,
      meta.filename,
      meta.path,
      meta.mimeType,
      meta.bytes,
      meta.prompt || null,
      meta.revisedPrompt || null,
      meta.model || null,
      meta.size || null,
      meta.quality || null,
      meta.outputFormat || null,
      meta.profileName || null,
      meta.sourceType || null,
      Number.isFinite(meta.index) ? meta.index : null
    );
    return this.findById(meta.id);
  },
  findById(id) {
    return open().prepare('SELECT * FROM images WHERE id = ?').get(id) || null;
  },
  findByPath(path) {
    return open().prepare('SELECT * FROM images WHERE path = ?').get(path) || null;
  },
  listByUser(userId, limit = 500) {
    return open().prepare(`
      SELECT * FROM images WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit);
  },
  listAll(limit = 500) {
    return open().prepare(`
      SELECT * FROM images
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  },
  deleteByUser(userId) {
    open().prepare('DELETE FROM images WHERE user_id = ?').run(userId);
  },
  deleteById(id) {
    open().prepare('DELETE FROM images WHERE id = ?').run(id);
  },
  statsByUser(userId) {
    return open().prepare(`
      SELECT
        COUNT(*)        AS count,
        COALESCE(SUM(bytes), 0) AS bytes,
        MAX(created_at) AS last_at
      FROM images WHERE user_id = ?
    `).get(userId) || { count: 0, bytes: 0, last_at: null };
  }
};

// ---- audit_logs ----

export const auditLogs = {
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
      meta ? JSON.stringify(meta) : null
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
  listRecent(limit = 200) {
    return open().prepare(`
      SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }
};

// ---- user_quotas ----

export const userQuotas = {
  get(userId) {
    return open().prepare('SELECT * FROM user_quotas WHERE user_id = ?').get(userId) || null;
  },
  upsert(userId, patch, updatedBy) {
    const db = open();
    const cur = this.get(userId);
    const next = { ...(cur || {}), ...patch };
    if (cur) {
      db.prepare(`
        UPDATE user_quotas SET
          daily_limit = ?, monthly_limit = ?, storage_limit_mb = ?, concurrent_limit = ?,
          updated_at = ?, updated_by = ?
        WHERE user_id = ?
      `).run(
        next.daily_limit ?? null,
        next.monthly_limit ?? null,
        next.storage_limit_mb ?? null,
        next.concurrent_limit ?? null,
        nowIso(),
        updatedBy || null,
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO user_quotas
        (user_id, daily_limit, monthly_limit, storage_limit_mb, concurrent_limit, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        next.daily_limit ?? null,
        next.monthly_limit ?? null,
        next.storage_limit_mb ?? null,
        next.concurrent_limit ?? null,
        nowIso(),
        updatedBy || null
      );
    }
    return this.get(userId);
  },
  delete(userId) {
    open().prepare('DELETE FROM user_quotas WHERE user_id = ?').run(userId);
  }
};

// ---- usage_daily ----

export const usageDaily = {
  get(userId, day) {
    return open().prepare(
      'SELECT * FROM usage_daily WHERE user_id = ? AND day = ?'
    ).get(userId, day) || null;
  },
  // 增量累加。若行不存在则插入。
  bump(userId, day, { calls = 0, images = 0, bytes = 0, fails = 0 } = {}) {
    const db = open();
    const cur = this.get(userId, day);
    if (cur) {
      db.prepare(`
        UPDATE usage_daily SET
          call_count  = call_count  + ?,
          image_count = image_count + ?,
          bytes       = bytes       + ?,
          fail_count  = fail_count  + ?
        WHERE user_id = ? AND day = ?
      `).run(calls, images, bytes, fails, userId, day);
    } else {
      db.prepare(`
        INSERT INTO usage_daily (user_id, day, call_count, image_count, bytes, fail_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, day, calls, images, bytes, fails);
    }
  },
  // 区间聚合：[fromDay, toDay] 含端点，YYYY-MM-DD。
  sum(userId, fromDay, toDay) {
    const row = open().prepare(`
      SELECT
        COALESCE(SUM(call_count), 0)  AS calls,
        COALESCE(SUM(image_count), 0) AS images,
        COALESCE(SUM(bytes), 0)       AS bytes,
        COALESCE(SUM(fail_count), 0)  AS fails
      FROM usage_daily
      WHERE user_id = ? AND day >= ? AND day <= ?
    `).get(userId, fromDay, toDay);
    return {
      calls: Number(row?.calls) || 0,
      images: Number(row?.images) || 0,
      bytes: Number(row?.bytes) || 0,
      fails: Number(row?.fails) || 0
    };
  },
  // 清空某用户的某段时间 (admin 应急)
  reset(userId, fromDay, toDay) {
    open().prepare(
      'DELETE FROM usage_daily WHERE user_id = ? AND day >= ? AND day <= ?'
    ).run(userId, fromDay, toDay);
  }
};

// ---- system_settings ----

export const systemSettings = {
  get(key) {
    const row = open().prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },
  set(key, value, updatedBy) {
    const db = open();
    const json = JSON.stringify(value);
    const cur = db.prepare('SELECT key FROM system_settings WHERE key = ?').get(key);
    if (cur) {
      db.prepare(
        'UPDATE system_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?'
      ).run(json, nowIso(), updatedBy || null, key);
    } else {
      db.prepare(
        'INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
      ).run(key, json, nowIso(), updatedBy || null);
    }
  }
};

// ---- prompt_square ----

export const promptSquare = {
  findById(id) {
    return open().prepare(`
      SELECT
        p.*,
        u.username AS owner_username,
        u.avatar_url AS owner_avatar_url
      FROM prompt_square p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
    `).get(id) || null;
  },
  findByUserSourcePrompt(userId, sourcePromptId) {
    if (!sourcePromptId) return null;
    return open().prepare(`
      SELECT
        p.*,
        u.username AS owner_username,
        u.avatar_url AS owner_avatar_url
      FROM prompt_square p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND p.source_prompt_id = ?
      ORDER BY p.updated_at DESC
      LIMIT 1
    `).get(userId, sourcePromptId) || null;
  },
  findBySourcePrompt(sourcePromptId) {
    if (!sourcePromptId) return null;
    return open().prepare(`
      SELECT
        p.*,
        u.username AS owner_username,
        u.avatar_url AS owner_avatar_url
      FROM prompt_square p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.source_prompt_id = ?
      ORDER BY p.updated_at DESC
      LIMIT 1
    `).get(sourcePromptId) || null;
  },
  list(limit = 200) {
    return open().prepare(`
      SELECT
        p.*,
        u.username AS owner_username,
        u.avatar_url AS owner_avatar_url
      FROM prompt_square p
      LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.published_at DESC
      LIMIT ?
    `).all(limit);
  },
  upsert({ userId, sourcePromptId, title, prompt, tagsJson, source, metaJson }) {
    const db = open();
    const now = nowIso();
    const existing = userId
      ? this.findByUserSourcePrompt(userId, sourcePromptId)
      : this.findBySourcePrompt(sourcePromptId);
    if (existing) {
      db.prepare(`
        UPDATE prompt_square
        SET title = ?, prompt = ?, tags = ?, source = ?, meta = ?, updated_at = ?, published_at = ?
        WHERE id = ?
      `).run(
        title,
        prompt,
        tagsJson || '[]',
        source || 'manual',
        metaJson || '{}',
        now,
        now,
        existing.id
      );
      return this.findById(existing.id);
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO prompt_square
      (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      userId,
      sourcePromptId || null,
      title,
      prompt,
      tagsJson || '[]',
      source || 'manual',
      metaJson || '{}',
      now,
      now,
      now
    );
    return this.findById(id);
  },
  deleteById(id) {
    return open().prepare('DELETE FROM prompt_square WHERE id = ?').run(id).changes;
  },
  bumpUseCount(id) {
    open().prepare('UPDATE prompt_square SET use_count = use_count + 1 WHERE id = ?').run(id);
    return this.findById(id);
  }
};

export const dbPaths = Object.freeze({
  dir: DB_DIR,
  file: DB_PATH,
  legacyGallery: LEGACY_GALLERY,
  legacyGalleryDone: LEGACY_GALLERY_DONE
});
