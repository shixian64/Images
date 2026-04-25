// SQLite 单例 + 迁移 + CRUD 包装。
// 使用 node:sqlite（Node 22.5+ 内置，零编译）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

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
`;

export function migrate() {
  const db = open();
  db.exec(SCHEMA);
  migrateLegacyGallery(db);
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
  }
};

export const dbPaths = Object.freeze({
  dir: DB_DIR,
  file: DB_PATH,
  legacyGallery: LEGACY_GALLERY,
  legacyGalleryDone: LEGACY_GALLERY_DONE
});
