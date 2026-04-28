// SQLite 单例 + 迁移 + CRUD 包装。
// 使用 node:sqlite（Node 22.5+ 内置，零编译）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import {
  PROMPT_SQUARE_SEED_KEY,
  PROMPT_SQUARE_SEEDS,
  PROMPTSREF_SREF_SOURCE_URL
} from './prompt-square-seeds.js';

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
  signup_ip       TEXT,
  signup_user_agent TEXT,
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
  is_public       INTEGER NOT NULL DEFAULT 0,
  published_at    TEXT,
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

CREATE TABLE IF NOT EXISTS image_likes (
  image_id    TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  day         TEXT NOT NULL,
  PRIMARY KEY (image_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_image_likes_user_day ON image_likes(user_id, day);
CREATE INDEX IF NOT EXISTS idx_image_likes_image    ON image_likes(image_id);

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

CREATE TABLE IF NOT EXISTS client_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT,
  client_ts   TEXT,
  received_at TEXT NOT NULL,
  level       TEXT NOT NULL,
  message     TEXT NOT NULL,
  meta        TEXT,
  page_url    TEXT,
  user_agent  TEXT,
  ip          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_logs_user_client
  ON client_logs(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_client_logs_user_received
  ON client_logs(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_logs_received
  ON client_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_logs_level
  ON client_logs(level, received_at DESC);

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

CREATE TABLE IF NOT EXISTS generation_jobs (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL,
  priority         INTEGER NOT NULL DEFAULT 0,
  payload_json     TEXT NOT NULL,
  prompt_preview   TEXT,
  profile_name     TEXT,
  model            TEXT,
  n                INTEGER,
  result_json      TEXT,
  error_message    TEXT,
  progress_json    TEXT,
  created_at       INTEGER NOT NULL,
  started_at       INTEGER,
  finished_at      INTEGER,
  updated_at       INTEGER NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_priority
  ON generation_jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_status
  ON generation_jobs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_finished
  ON generation_jobs(finished_at DESC);

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
  migrateUserAbuseColumns(db);
  migrateImagePublicColumns(db);
  migratePromptSquareNullableOwner(db);
  seedPromptSquareDefaults(db);
  migrateLegacyGallery(db);
}

function addColumnIfMissing(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition};`);
}

function migrateUserAbuseColumns(db) {
  addColumnIfMissing(db, 'users', 'signup_ip', 'signup_ip TEXT');
  addColumnIfMissing(db, 'users', 'signup_user_agent', 'signup_user_agent TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON users(signup_ip);');
}

function migrateImagePublicColumns(db) {
  addColumnIfMissing(db, 'images', 'is_public', 'is_public INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'images', 'published_at', 'published_at TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_images_public ON images(is_public, published_at DESC, created_at DESC);
    CREATE TABLE IF NOT EXISTS image_likes (
      image_id    TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      day         TEXT NOT NULL,
      PRIMARY KEY (image_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_image_likes_user_day ON image_likes(user_id, day);
    CREATE INDEX IF NOT EXISTS idx_image_likes_image    ON image_likes(image_id);
  `);
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
  const seedKey = PROMPT_SQUARE_SEED_KEY;
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
  logger.info('prompt_square.seed.done', { source: PROMPT_SQUARE_SEED_KEY, inserted, updated });
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
     is_public, published_at,
     prompt, revised_prompt, model, size, quality, output_format,
     profile_name, source_type, image_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      it.isPublic || it.public ? 1 : 0,
      it.isPublic || it.public ? (it.publishedAt || it.createdAt || nowIso()) : null,
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
  create({ username, email, passwordHash, passwordSalt, role = 'user', signupIp = null, signupUserAgent = null }) {
    const db = open();
    const id = randomUUID();
    const now = nowIso();
    db.prepare(`
      INSERT INTO users
      (id, username, email, password_hash, password_salt, role, status, signup_ip, signup_user_agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, username, email, passwordHash, passwordSalt, role, signupIp || null, signupUserAgent || null, now, now);
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
      SELECT id, username, email, role, status, avatar_url, signup_ip, signup_user_agent, created_at, updated_at, last_login_at
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
       is_public, published_at,
       prompt, revised_prompt, model, size, quality, output_format,
       profile_name, source_type, image_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.id,
      meta.userId,
      meta.createdAt,
      meta.filename,
      meta.path,
      meta.mimeType,
      meta.bytes,
      meta.isPublic ? 1 : 0,
      meta.isPublic ? (meta.publishedAt || meta.createdAt || nowIso()) : null,
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
  listPublic(limit = 500) {
    return open().prepare(`
      SELECT i.*, u.username AS owner_username
      FROM images i
      LEFT JOIN users u ON u.id = i.user_id
      WHERE i.is_public = 1
      ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.created_at DESC
      LIMIT ?
    `).all(limit);
  },
  listAll(limit = 500) {
    return open().prepare(`
      SELECT * FROM images
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  },
  countByUser(userId) {
    return open().prepare('SELECT COUNT(*) AS n FROM images WHERE user_id = ?').get(userId)?.n || 0;
  },
  countPublic() {
    return open().prepare('SELECT COUNT(*) AS n FROM images WHERE is_public = 1').get()?.n || 0;
  },
  countPublicByUser(userId) {
    return open().prepare('SELECT COUNT(*) AS n FROM images WHERE user_id = ? AND is_public = 1').get(userId)?.n || 0;
  },
  setPublic(id, isPublic, publishedAt = null) {
    open().prepare(`
      UPDATE images
      SET is_public = ?, published_at = ?
      WHERE id = ?
    `).run(isPublic ? 1 : 0, isPublic ? (publishedAt || nowIso()) : null, id);
    return this.findById(id);
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

// ---- image_likes ----

export const imageLikes = {
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
  }
};

// ---- client_logs ----

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

export const clientLogs = {
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
    return this.listAll({ userId, limit, level, search });
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
  sumBySignupIp(signupIp, fromDay, toDay) {
    const row = open().prepare(`
      SELECT
        COALESCE(SUM(d.call_count), 0)  AS calls,
        COALESCE(SUM(d.image_count), 0) AS images,
        COALESCE(SUM(d.bytes), 0)       AS bytes,
        COALESCE(SUM(d.fail_count), 0)  AS fails
      FROM usage_daily d
      JOIN users u ON u.id = d.user_id
      WHERE u.signup_ip = ? AND u.role != 'admin' AND d.day >= ? AND d.day <= ?
    `).get(signupIp, fromDay, toDay);
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

// ---- generation_jobs ----

const JOB_JSON_FIELDS = new Set(['payload_json', 'result_json', 'progress_json']);

function parseJob(row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of JOB_JSON_FIELDS) {
    const publicKey = key.replace(/_json$/, '');
    const value = row[key];
    if (value === null || value === undefined || value === '') {
      out[publicKey] = key === 'payload_json' ? {} : null;
    } else {
      try { out[publicKey] = JSON.parse(value); } catch { out[publicKey] = null; }
    }
  }
  out.n = Number(out.n) || 1;
  out.priority = Number(out.priority) || 0;
  out.attempts = Number(out.attempts) || 0;
  out.cancel_requested = Number(out.cancel_requested) || 0;
  return out;
}

function jobPayload(value, fallback = null) {
  if (value === undefined) return undefined;
  if (value === null) return fallback;
  return JSON.stringify(value);
}

export const generationJobs = {
  create({ id, userId, status = 'queued', priority = 0, payload, promptPreview, profileName, model, n }) {
    const db = open();
    const now = Date.now();
    const jobId = id || randomUUID();
    db.prepare(`
      INSERT INTO generation_jobs
      (id, user_id, status, priority, payload_json, prompt_preview, profile_name, model, n,
       result_json, error_message, progress_json, created_at, started_at, finished_at, updated_at, attempts, cancel_requested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, 0, 0)
    `).run(
      jobId,
      userId,
      status,
      Math.floor(Number(priority) || 0),
      JSON.stringify(payload || {}),
      promptPreview || null,
      profileName || null,
      model || null,
      Math.max(1, Math.floor(Number(n) || 1)),
      now,
      now
    );
    return this.findById(jobId);
  },
  findById(id) {
    return parseJob(open().prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id));
  },
  listByUser(userId, { activeLimit = 100, recentLimit = 50 } = {}) {
    const db = open();
    const active = db.prepare(`
      SELECT * FROM generation_jobs
      WHERE user_id = ? AND status IN ('queued', 'running')
      ORDER BY
        CASE status WHEN 'running' THEN 0 ELSE 1 END,
        priority DESC,
        created_at ASC
      LIMIT ?
    `).all(userId, Math.max(1, Math.floor(activeLimit)));
    const recent = db.prepare(`
      SELECT * FROM generation_jobs
      WHERE user_id = ? AND status NOT IN ('queued', 'running')
      ORDER BY COALESCE(finished_at, updated_at, created_at) DESC
      LIMIT ?
    `).all(userId, Math.max(1, Math.floor(recentLimit)));
    return [...active, ...recent].map(parseJob);
  },
  listAll({ limit = 200, status = '', userId = '' } = {}) {
    const db = open();
    const clauses = [];
    const args = [];
    if (status) {
      clauses.push('j.status = ?');
      args.push(status);
    }
    if (userId) {
      clauses.push('j.user_id = ?');
      args.push(userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT j.*, u.username AS user_username, u.email AS user_email, u.role AS user_role
      FROM generation_jobs j
      LEFT JOIN users u ON u.id = j.user_id
      ${where}
      ORDER BY
        CASE j.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
        CASE WHEN j.status IN ('queued', 'running') THEN j.priority ELSE 0 END DESC,
        CASE WHEN j.status IN ('queued', 'running') THEN j.created_at ELSE -COALESCE(j.finished_at, j.updated_at, j.created_at) END ASC
      LIMIT ?
    `).all(...args, Math.max(1, Math.floor(limit)));
    return rows.map(parseJob);
  },
  queuedBatch(limit = 50, excludedUserIds = []) {
    const args = [];
    let excludedSql = '';
    const ids = [...new Set((excludedUserIds || []).filter(Boolean))];
    if (ids.length) {
      excludedSql = `AND user_id NOT IN (${ids.map(() => '?').join(',')})`;
      args.push(...ids);
    }
    args.push(Math.max(1, Math.floor(limit)));
    return open().prepare(`
      SELECT * FROM generation_jobs
      WHERE status = 'queued' AND cancel_requested = 0
      ${excludedSql}
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `).all(...args).map(parseJob);
  },
  updateStatus(id, status, patch = {}) {
    const db = open();
    const current = this.findById(id);
    if (!current) return null;
    const next = {
      started_at: patch.startedAt === undefined ? current.started_at : patch.startedAt,
      finished_at: patch.finishedAt === undefined ? current.finished_at : patch.finishedAt,
      result_json: patch.result === undefined ? current.result_json : jobPayload(patch.result),
      error_message: patch.errorMessage === undefined ? current.error_message : (patch.errorMessage || null),
      progress_json: patch.progress === undefined ? current.progress_json : jobPayload(patch.progress),
      attempts: patch.attempts === undefined ? current.attempts : Math.max(0, Math.floor(Number(patch.attempts) || 0)),
      cancel_requested: patch.cancelRequested === undefined
        ? current.cancel_requested
        : (patch.cancelRequested ? 1 : 0)
    };
    db.prepare(`
      UPDATE generation_jobs
      SET status = ?,
          started_at = ?,
          finished_at = ?,
          result_json = ?,
          error_message = ?,
          progress_json = ?,
          attempts = ?,
          cancel_requested = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      status,
      next.started_at ?? null,
      next.finished_at ?? null,
      next.result_json ?? null,
      next.error_message ?? null,
      next.progress_json ?? null,
      next.attempts,
      next.cancel_requested,
      Date.now(),
      id
    );
    return this.findById(id);
  },
  updateProgress(id, progress) {
    open().prepare(`
      UPDATE generation_jobs
      SET progress_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(progress || {}), Date.now(), id);
    return this.findById(id);
  },
  requestCancel(id) {
    open().prepare(`
      UPDATE generation_jobs
      SET cancel_requested = 1, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), id);
    return this.findById(id);
  },
  updatePriority(id, priority) {
    open().prepare(`
      UPDATE generation_jobs
      SET priority = ?, updated_at = ?
      WHERE id = ?
    `).run(Math.floor(Number(priority) || 0), Date.now(), id);
    return this.findById(id);
  },
  resetForRetry(id, { priority = null } = {}) {
    const current = this.findById(id);
    if (!current) return null;
    open().prepare(`
      UPDATE generation_jobs
      SET status = 'queued',
          priority = ?,
          result_json = NULL,
          error_message = NULL,
          progress_json = NULL,
          started_at = NULL,
          finished_at = NULL,
          attempts = 0,
          cancel_requested = 0,
          updated_at = ?
      WHERE id = ?
    `).run(priority === null ? current.priority : Math.floor(Number(priority) || 0), Date.now(), id);
    return this.findById(id);
  },
  recoverRunningAsFailed(reason = 'server_restart') {
    const now = Date.now();
    const res = open().prepare(`
      UPDATE generation_jobs
      SET status = 'failed',
          error_message = ?,
          finished_at = ?,
          updated_at = ?
      WHERE status = 'running'
    `).run(reason, now, now);
    return res.changes || 0;
  },
  cancelQueuedOlderThan(cutoffMs) {
    const now = Date.now();
    const res = open().prepare(`
      UPDATE generation_jobs
      SET status = 'cancelled',
          error_message = 'queue_wait_timeout',
          finished_at = ?,
          updated_at = ?
      WHERE status = 'queued' AND created_at < ?
    `).run(now, now, cutoffMs);
    return res.changes || 0;
  },
  countQueued({ userId = '', statuses = ['queued'] } = {}) {
    const states = Array.isArray(statuses) && statuses.length ? statuses : ['queued'];
    const args = [...states];
    let where = `status IN (${states.map(() => '?').join(',')})`;
    if (userId) {
      where += ' AND user_id = ?';
      args.push(userId);
    }
    return open().prepare(`SELECT COUNT(*) AS n FROM generation_jobs WHERE ${where}`).get(...args)?.n || 0;
  },
  pendingCallCount(userId) {
    if (!userId) return 0;
    return open().prepare(`
      SELECT COALESCE(SUM(n), 0) AS n
      FROM generation_jobs
      WHERE user_id = ? AND status IN ('queued', 'running')
    `).get(userId)?.n || 0;
  },
  pendingCallCountBySignupIp(signupIp) {
    if (!signupIp) return 0;
    return open().prepare(`
      SELECT COALESCE(SUM(j.n), 0) AS n
      FROM generation_jobs j
      JOIN users u ON u.id = j.user_id
      WHERE u.signup_ip = ? AND u.role != 'admin' AND j.status IN ('queued', 'running')
    `).get(signupIp)?.n || 0;
  },
  queuePosition(id) {
    const job = this.findById(id);
    if (!job || job.status !== 'queued') return null;
    const row = open().prepare(`
      SELECT COUNT(*) AS n
      FROM generation_jobs
      WHERE status = 'queued'
        AND (
          priority > ?
          OR (priority = ? AND created_at < ?)
          OR (priority = ? AND created_at = ? AND id <= ?)
        )
    `).get(job.priority, job.priority, job.created_at, job.priority, job.created_at, id);
    return Number(row?.n) || 1;
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
