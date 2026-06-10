// SQLite 单例 + 迁移 + CRUD 包装。
// 使用 node:sqlite（Node 22.5+ 内置，零编译）。

import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { positiveIntFromEnv } from '../utils/config.js';
import { escapeSqlLike } from './db-sql.js';
import { createUserRepository } from './db-users.js';
import { createRateLimitRepository } from './db-rate-limits.js';
import { createSessionRepository, hashSessionId, isSessionIdHash } from './db-sessions.js';
import { createPromptSquareRepository } from './db-prompt-square.js';
import { createSchemaMigrationRepository, createSystemSettingsRepository } from './db-system.js';
import { createAuditLogRepository, createClientLogRepository, createImageLikeRepository } from './db-logs.js';
import { createSqliteMigrationBackup } from './sqlite-migration-backup.js';
import {
  getPromptSquareSeeds,
  PROMPT_SQUARE_SEED_DIGEST,
  PROMPT_SQUARE_SEED_KEY,
  PROMPT_SQUARE_SEED_TOTAL,
  PROMPTSREF_SREF_SOURCE_URL
} from './prompt-square-seeds.js';

const DB_DIR = join(process.cwd(), 'generated');
const DB_PATH = join(DB_DIR, 'app.db');
const MIGRATION_BACKUP_DIR = join(DB_DIR, 'migration-backups');
const LEGACY_GALLERY = join(DB_DIR, 'gallery.json');
const LEGACY_GALLERY_DONE = join(DB_DIR, 'gallery.json.migrated');

let _db = null;

function open() {
  if (_db) return _db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  applyConnectionPragmas(_db);
  return _db;
}

function applyConnectionPragmas(db) {
  const busyTimeoutMs = positiveIntFromEnv('SQLITE_BUSY_TIMEOUT_MS', 5_000, { allowZero: true });
  const walAutocheckpointPages = positiveIntFromEnv('SQLITE_WAL_AUTOCHECKPOINT_PAGES', 1_000, { allowZero: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
  db.exec(`PRAGMA wal_autocheckpoint = ${walAutocheckpointPages};`);
  db.exec('PRAGMA foreign_keys = ON;');
}

function nowIso() {
  return new Date().toISOString();
}

function nextUtcDayStart(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return nowIso();
  const [, year, month, date] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(date) + 1)).toISOString();
}

const PROMPT_SQUARE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_prompt_square_published ON prompt_square(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_square_user      ON prompt_square(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_square_source    ON prompt_square(user_id, source_prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_square_source_id ON prompt_square(source_prompt_id);
`;

const PROMPT_SQUARE_FTS_DROP = `
DROP TRIGGER IF EXISTS prompt_square_fts_ai;
DROP TRIGGER IF EXISTS prompt_square_fts_au;
DROP TRIGGER IF EXISTS prompt_square_fts_ad;
DROP TABLE IF EXISTS prompt_square_fts;
`;

const PROMPT_SQUARE_FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS prompt_square_fts
USING fts5(
  id UNINDEXED,
  title,
  prompt,
  tags,
  source,
  tokenize = 'trigram'
);
CREATE TRIGGER IF NOT EXISTS prompt_square_fts_ai
AFTER INSERT ON prompt_square
BEGIN
  INSERT INTO prompt_square_fts(id, title, prompt, tags, source)
  VALUES (new.id, new.title, new.prompt, new.tags, new.source);
END;
CREATE TRIGGER IF NOT EXISTS prompt_square_fts_au
AFTER UPDATE OF id, title, prompt, tags, source ON prompt_square
BEGIN
  DELETE FROM prompt_square_fts WHERE id = old.id;
  INSERT INTO prompt_square_fts(id, title, prompt, tags, source)
  VALUES (new.id, new.title, new.prompt, new.tags, new.source);
END;
CREATE TRIGGER IF NOT EXISTS prompt_square_fts_ad
AFTER DELETE ON prompt_square
BEGIN
  DELETE FROM prompt_square_fts WHERE id = old.id;
END;
`;

const DATA_LIFECYCLE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_images_public_published
  ON images(is_public, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_user_model_created
  ON images(user_id, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_profile_created
  ON images(profile_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_bytes_created
  ON images(bytes DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_created
  ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_logs_user_level_received
  ON client_logs(user_id, level, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_day
  ON usage_daily(day);
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
  password_reset_required INTEGER NOT NULL DEFAULT 0,
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
  csrf_token  TEXT,
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
  thumbnail_path  TEXT,
  preview_path    TEXT,
  image_index     INTEGER,
  comic_project_id TEXT,
  comic_panel_index INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_user_created ON images(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_created      ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_model        ON images(model);

CREATE TABLE IF NOT EXISTS comic_projects (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  story           TEXT NOT NULL,
  style_id        TEXT,
  style_label     TEXT,
  panel_count     INTEGER NOT NULL DEFAULT 0,
  chat_model      TEXT,
  image_model     TEXT,
  size            TEXT,
  quality         TEXT,
  output_format   TEXT,
  use_context     INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft',
  storyboard_json TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comic_projects_user_updated ON comic_projects(user_id, updated_at DESC);

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
  prompt_optimize_count INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS registration_invites (
  code        TEXT PRIMARY KEY,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  used_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  created_by  TEXT,
  updated_at  TEXT NOT NULL,
  expires_at  TEXT,
  disabled_at TEXT,
  disabled_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_registration_invites_created
  ON registration_invites(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_invites_active
  ON registration_invites(disabled_at, used_count, max_uses);
CREATE INDEX IF NOT EXISTS idx_registration_invites_expires
  ON registration_invites(expires_at);

CREATE TABLE IF NOT EXISTS registration_invite_redemptions (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL,
  user_id       TEXT,
  user_username TEXT,
  user_email    TEXT,
  used_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_code
  ON registration_invite_redemptions(code, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_user
  ON registration_invite_redemptions(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_used
  ON registration_invite_redemptions(used_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  hits_json  TEXT NOT NULL,
  window_ms  INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_seen
  ON rate_limits(last_seen);

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
${PROMPT_SQUARE_FTS_SCHEMA}
`;

export function migrate() {
  const db = open();
  db.exec(SCHEMA);
  runSchemaMigration(db, 1, 'user_abuse_columns', () => migrateUserAbuseColumns(db));
  runSchemaMigration(db, 2, 'image_public_columns', () => migrateImagePublicColumns(db));
  runSchemaMigration(db, 3, 'usage_daily_prompt_optimize_count', () => migrateUsageDailyColumns(db));
  runSchemaMigration(db, 4, 'comic_project_tables', () => migrateComicProjectTables(db));
  runSchemaMigration(db, 5, 'registration_invite_redemptions', () => migrateRegistrationInviteTables(db));
  db.exec(DATA_LIFECYCLE_INDEXES);
  runSchemaMigration(db, 6, 'prompt_square_nullable_owner', () => migratePromptSquareNullableOwner(db), { transaction: false });
  runSchemaMigration(db, 7, 'registration_invite_code_hashes', () => migrateRegistrationInviteCodeHashes(db));
  runSchemaMigration(db, 8, 'registration_invite_expiry', () => migrateRegistrationInviteExpiry(db));
  runSchemaMigration(db, 9, 'session_id_hashes', () => migrateSessionIdHashes(db));
  runSchemaMigration(db, 10, 'user_password_reset_required', () => migrateUserPasswordResetRequired(db));
  runSchemaMigration(db, 11, 'session_csrf_tokens', () => migrateSessionCsrfTokens(db));
  runSchemaMigration(db, 12, 'prompt_square_fts_index', () => migratePromptSquareFtsIndex(db));
  runSchemaMigration(db, 13, 'image_variant_paths', () => migrateImageVariantPaths(db));
  seedPromptSquareDefaults(db);
  migrateLegacyGallery(db);
}

function runSchemaMigration(db, version, name, fn, { transaction = true } = {}) {
  const current = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
  if (current) return false;

  if (transaction) db.exec('BEGIN');
  try {
    fn();
    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(version, name, nowIso());
    if (transaction) db.exec('COMMIT');
    logger.info('migration.schema.applied', { version, name });
    return true;
  } catch (err) {
    if (transaction) db.exec('ROLLBACK');
    logger.error('migration.schema.failed', { version, name, error: err?.message || String(err) });
    throw err;
  }
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

function migrateUsageDailyColumns(db) {
  addColumnIfMissing(
    db,
    'usage_daily',
    'prompt_optimize_count',
    'prompt_optimize_count INTEGER NOT NULL DEFAULT 0'
  );
}

function migrateRegistrationInviteTables(db) {
  addColumnIfMissing(db, 'registration_invites', 'disabled_by', 'disabled_by TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS registration_invite_redemptions (
      id            TEXT PRIMARY KEY,
      code          TEXT NOT NULL,
      user_id       TEXT,
      user_username TEXT,
      user_email    TEXT,
      used_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_code
      ON registration_invite_redemptions(code, used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_user
      ON registration_invite_redemptions(user_id, used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_registration_invite_redemptions_used
      ON registration_invite_redemptions(used_at DESC);
  `);
}

function migrateRegistrationInviteCodeHashes(db) {
  const rows = db.prepare('SELECT code FROM registration_invites').all();
  const updateInvite = db.prepare('UPDATE registration_invites SET code = ?, updated_at = ? WHERE code = ?');
  const updateRedemptions = db.prepare('UPDATE registration_invite_redemptions SET code = ? WHERE code = ?');
  const updatedAt = nowIso();
  for (const row of rows) {
    const code = String(row?.code || '');
    if (!code || isInviteCodeHash(code)) continue;
    const hashed = hashInviteCode(code);
    updateRedemptions.run(hashed, code);
    updateInvite.run(hashed, updatedAt, code);
  }
  const orphanRedemptions = db.prepare('SELECT DISTINCT code FROM registration_invite_redemptions').all();
  for (const row of orphanRedemptions) {
    const code = String(row?.code || '');
    if (!code || isInviteCodeHash(code)) continue;
    updateRedemptions.run(hashInviteCode(code), code);
  }
}

function migrateRegistrationInviteExpiry(db) {
  addColumnIfMissing(db, 'registration_invites', 'expires_at', 'expires_at TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_registration_invites_expires
      ON registration_invites(expires_at);
  `);
}

function migrateSessionIdHashes(db) {
  const rows = db.prepare('SELECT id FROM sessions').all();
  const updateSession = db.prepare('UPDATE sessions SET id = ? WHERE id = ?');
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id || isSessionIdHash(id)) continue;
    updateSession.run(hashSessionId(id), id);
  }
}

function migrateUserPasswordResetRequired(db) {
  addColumnIfMissing(db, 'users', 'password_reset_required', 'password_reset_required INTEGER NOT NULL DEFAULT 0');
}

function migrateSessionCsrfTokens(db) {
  addColumnIfMissing(db, 'sessions', 'csrf_token', 'csrf_token TEXT');
}

function rebuildPromptSquareFts(db) {
  db.prepare('DELETE FROM prompt_square_fts').run();
  db.prepare(`
    INSERT INTO prompt_square_fts(id, title, prompt, tags, source)
    SELECT id, title, prompt, tags, source
    FROM prompt_square
  `).run();
}

function migratePromptSquareFtsIndex(db) {
  db.exec(PROMPT_SQUARE_FTS_DROP);
  db.exec(PROMPT_SQUARE_FTS_SCHEMA);
  rebuildPromptSquareFts(db);
}

function migrateImageVariantPaths(db) {
  addColumnIfMissing(db, 'images', 'thumbnail_path', 'thumbnail_path TEXT');
  addColumnIfMissing(db, 'images', 'preview_path', 'preview_path TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_images_path ON images(path);
    CREATE INDEX IF NOT EXISTS idx_images_thumbnail_path ON images(thumbnail_path);
    CREATE INDEX IF NOT EXISTS idx_images_preview_path ON images(preview_path);
  `);
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

function migrateComicProjectTables(db) {
  addColumnIfMissing(db, 'images', 'comic_project_id', 'comic_project_id TEXT');
  addColumnIfMissing(db, 'images', 'comic_panel_index', 'comic_panel_index INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS comic_projects (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      story           TEXT NOT NULL,
      style_id        TEXT,
      style_label     TEXT,
      panel_count     INTEGER NOT NULL DEFAULT 0,
      chat_model      TEXT,
      image_model     TEXT,
      size            TEXT,
      quality         TEXT,
      output_format   TEXT,
      use_context     INTEGER NOT NULL DEFAULT 1,
      status          TEXT NOT NULL DEFAULT 'draft',
      storyboard_json TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comic_projects_user_updated ON comic_projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_comic_project ON images(comic_project_id, comic_panel_index, created_at);
    CREATE INDEX IF NOT EXISTS idx_images_user_comic_created ON images(user_id, comic_project_id, created_at DESC);
  `);
}

function migratePromptSquareNullableOwner(db) {
  const cols = db.prepare('PRAGMA table_info(prompt_square)').all();
  const userIdCol = cols.find((col) => col.name === 'user_id');
  if (!userIdCol?.notnull) return;

  const backup = createSqliteMigrationBackup(db, {
    dbPath: DB_PATH,
    backupRoot: MIGRATION_BACKUP_DIR,
    version: 6,
    name: 'prompt_square_nullable_owner',
    reason: 'rebuild prompt_square with nullable user_id',
    logger
  });
  logger.info('migration.prompt_square.nullable_owner.start', { backupPath: backup.path });
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

function promptSquareSeedSourceId(seed) {
  return `promptsref:sref:${seed.sref}`;
}

function promptSquareSeedDigest() {
  return PROMPT_SQUARE_SEED_DIGEST;
}

function parsePromptSquareSeedState(value) {
  try {
    const parsed = JSON.parse(String(value || 'null'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function countExistingPromptSquareSeeds(db) {
  if (!PROMPT_SQUARE_SEED_TOTAL) return 0;
  const row = db.prepare(`
    SELECT COUNT(DISTINCT source_prompt_id) AS count
    FROM prompt_square
    WHERE source_prompt_id LIKE 'promptsref:sref:%'
  `).get();
  return Number(row?.count) || 0;
}

function seedPromptSquareDefaults(db) {
  const seedKey = PROMPT_SQUARE_SEED_KEY;
  const seedState = parsePromptSquareSeedState(
    db.prepare('SELECT value FROM system_settings WHERE key = ?').get(seedKey)?.value
  );
  const seedDigest = promptSquareSeedDigest();
  const existingSeedCount = countExistingPromptSquareSeeds(db);
  if (
    seedState?.digest === seedDigest
    && Number(seedState?.total) === PROMPT_SQUARE_SEED_TOTAL
    && existingSeedCount >= PROMPT_SQUARE_SEED_TOTAL
  ) {
    return;
  }

  const seeds = getPromptSquareSeeds();
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
  for (const seed of seeds) {
    const sourcePromptId = promptSquareSeedSourceId(seed);
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
    digest: seedDigest,
    total: seeds.length,
    inserted,
    updated,
    previousDigest: seedState?.digest || null,
    existingBefore: existingSeedCount
  }), nowIso());
  logger.info('prompt_square.seed.done', {
    source: PROMPT_SQUARE_SEED_KEY,
    inserted,
    updated,
    existingBefore: existingSeedCount
  });
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
     profile_name, source_type, image_index, comic_project_id, comic_panel_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      Number.isFinite(it.index) ? it.index : null,
      null,
      null
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

export const users = createUserRepository({ open, nowIso });

// ---- persistent rate limits ----

export const rateLimits = createRateLimitRepository({ open, nowIso });

// ---- sessions ----

export const sessions = createSessionRepository({ open, nowIso });

// ---- images ----

function normalizeImageAdminListOptions(input = {}) {
  const options = input || {};
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize ?? options.size) || 50)));
  const sort = options.sort === 'bytes' ? 'bytes' : 'createdAt';
  const order = options.order === 'asc' ? 'asc' : 'desc';
  return {
    userId: String(options.userId || '').trim(),
    model: String(options.model || '').trim(),
    profileName: String(options.profileName || '').trim(),
    search: String(options.search || '').trim().toLowerCase().slice(0, 200),
    from: String(options.from || '').trim(),
    to: String(options.to || '').trim(),
    minBytes: Math.max(0, Number(options.minBytes) || 0),
    maxBytes: Math.max(0, Number(options.maxBytes) || 0),
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sort,
    order
  };
}

function imageAdminFilterSql(options = {}) {
  const filters = normalizeImageAdminListOptions(options);
  const clauses = [];
  const params = [];

  if (filters.userId) {
    clauses.push('user_id = ?');
    params.push(filters.userId);
  }
  if (filters.model) {
    clauses.push('COALESCE(model, \'\') = ?');
    params.push(filters.model);
  }
  if (filters.profileName) {
    clauses.push('COALESCE(profile_name, \'\') = ?');
    params.push(filters.profileName);
  }
  if (filters.from) {
    clauses.push('created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('created_at <= ?');
    params.push(filters.to);
  }
  if (filters.minBytes) {
    clauses.push('COALESCE(bytes, 0) >= ?');
    params.push(filters.minBytes);
  }
  if (filters.maxBytes) {
    clauses.push('COALESCE(bytes, 0) <= ?');
    params.push(filters.maxBytes);
  }
  if (filters.search) {
    const like = `%${escapeSqlLike(filters.search)}%`;
    clauses.push(`(
      lower(COALESCE(prompt, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(revised_prompt, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(filename, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(model, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(profile_name, '')) LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like, like, like);
  }

  return {
    filters,
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export const images = {
  insert(meta) {
    const db = open();
    db.prepare(`
      INSERT INTO images
      (id, user_id, created_at, filename, path, mime_type, bytes,
       is_public, published_at,
       prompt, revised_prompt, model, size, quality, output_format,
       profile_name, source_type, thumbnail_path, preview_path,
       image_index, comic_project_id, comic_panel_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      meta.thumbnailPath || null,
      meta.previewPath || null,
      Number.isFinite(meta.index) ? meta.index : null,
      meta.comicProjectId || null,
      Number.isFinite(meta.comicPageIndex)
        ? meta.comicPageIndex
        : (Number.isFinite(meta.comicPanelIndex) ? meta.comicPanelIndex : null)
    );
    return this.findById(meta.id);
  },
  findById(id) {
    return open().prepare('SELECT * FROM images WHERE id = ?').get(id) || null;
  },
  findByPath(path) {
    return open().prepare('SELECT * FROM images WHERE path = ?').get(path) || null;
  },
  findByServedPath(path) {
    return open().prepare(`
      SELECT * FROM images
      WHERE path = ? OR thumbnail_path = ? OR preview_path = ?
      LIMIT 1
    `).get(path, path, path) || null;
  },
  listByUser(userId, limit = 500) {
    return open().prepare(`
      SELECT * FROM images
      WHERE user_id = ? AND (comic_project_id IS NULL OR comic_project_id = '')
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
  listAllForMaintenance({ limit = 500, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 500));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    return open().prepare(`
      SELECT * FROM images
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(safeLimit, safeOffset);
  },
  listByComicProject(projectId, { limit = 500 } = {}) {
    return open().prepare(`
      SELECT * FROM images
      WHERE comic_project_id = ?
      ORDER BY COALESCE(comic_panel_index, image_index, 999999) ASC, created_at ASC
      LIMIT ?
    `).all(projectId, Math.max(1, Math.floor(Number(limit) || 500)));
  },
  adminStats(today) {
    const db = open();
    const start = `${today}T00:00:00.000Z`;
    const end = nextUtcDayStart(today);
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(bytes), 0) AS totalBytes
      FROM images
    `).get();
    const todaySummary = db.prepare(`
      SELECT COUNT(*) AS savedToday
      FROM images
      WHERE created_at >= ? AND created_at < ?
    `).get(start, end);
    const topUsers = db.prepare(`
      SELECT
        COALESCE(user_id, 'unknown') AS userId,
        COUNT(*) AS count,
        COALESCE(SUM(bytes), 0) AS bytes
      FROM images
      GROUP BY COALESCE(user_id, 'unknown')
      ORDER BY bytes DESC
      LIMIT 10
    `).all();
    const topModels = db.prepare(`
      SELECT
        COALESCE(NULLIF(model, ''), 'unknown') AS model,
        COUNT(*) AS count
      FROM images
      GROUP BY COALESCE(NULLIF(model, ''), 'unknown')
      ORDER BY count DESC
      LIMIT 10
    `).all();
    return {
      total: Number(summary?.total) || 0,
      totalBytes: Number(summary?.totalBytes) || 0,
      savedToday: Number(todaySummary?.savedToday) || 0,
      topUsers: topUsers.map((row) => ({
        userId: row.userId,
        count: Number(row.count) || 0,
        bytes: Number(row.bytes) || 0
      })),
      topModels: topModels.map((row) => ({
        model: row.model,
        count: Number(row.count) || 0
      }))
    };
  },
  countAdmin(options = {}) {
    const { where, params } = imageAdminFilterSql(options);
    const row = open().prepare(`
      SELECT COUNT(*) AS n
      FROM images
      ${where}
    `).get(...params);
    return Number(row?.n) || 0;
  },
  listAdmin(options = {}) {
    const { filters, where, params } = imageAdminFilterSql(options);
    const sortColumn = filters.sort === 'bytes' ? 'bytes' : 'created_at';
    const sortDirection = filters.order === 'asc' ? 'ASC' : 'DESC';
    return open().prepare(`
      SELECT * FROM images
      ${where}
      ORDER BY ${sortColumn} ${sortDirection}, created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, filters.pageSize, filters.offset);
  },
  countByUser(userId) {
    return open().prepare(`
      SELECT COUNT(*) AS n FROM images
      WHERE user_id = ? AND (comic_project_id IS NULL OR comic_project_id = '')
    `).get(userId)?.n || 0;
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

function parseJsonObject(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseComicProject(row) {
  if (!row) return null;
  return {
    ...row,
    panel_count: Number(row.panel_count) || 0,
    use_context: Number(row.use_context) ? 1 : 0,
    storyboard: parseJsonObject(row.storyboard_json, {}),
    image_count: Number(row.image_count) || 0,
    thumbnail_path: row.thumbnail_path || null
  };
}

export const comicProjects = {
  upsert(meta = {}) {
    const db = open();
    const now = nowIso();
    const id = meta.id || randomUUID();
    const existing = this.findById(id);
    const storyboardJson = JSON.stringify(
      meta.storyboard && typeof meta.storyboard === 'object' ? meta.storyboard : {}
    );
    const values = {
      userId: meta.userId,
      title: String(meta.title || '').trim() || '未命名漫画',
      story: String(meta.story || ''),
      styleId: meta.styleId || null,
      styleLabel: meta.styleLabel || null,
      panelCount: Math.max(0, Math.floor(Number(meta.panelCount) || 0)),
      chatModel: meta.chatModel || null,
      imageModel: meta.imageModel || null,
      size: meta.size || null,
      quality: meta.quality || null,
      outputFormat: meta.outputFormat || null,
      useContext: meta.useContext === false ? 0 : 1,
      status: meta.status || 'draft',
      storyboardJson
    };
    if (!values.userId) throw new Error('comic project requires userId');

    if (existing) {
      db.prepare(`
        UPDATE comic_projects
        SET title = ?, story = ?, style_id = ?, style_label = ?, panel_count = ?,
            chat_model = ?, image_model = ?, size = ?, quality = ?, output_format = ?,
            use_context = ?, status = ?, storyboard_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        values.title,
        values.story,
        values.styleId,
        values.styleLabel,
        values.panelCount,
        values.chatModel,
        values.imageModel,
        values.size,
        values.quality,
        values.outputFormat,
        values.useContext,
        values.status,
        values.storyboardJson,
        now,
        id,
        values.userId
      );
      return this.findById(id);
    }

    db.prepare(`
      INSERT INTO comic_projects
      (id, user_id, title, story, style_id, style_label, panel_count,
       chat_model, image_model, size, quality, output_format, use_context,
       status, storyboard_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      values.userId,
      values.title,
      values.story,
      values.styleId,
      values.styleLabel,
      values.panelCount,
      values.chatModel,
      values.imageModel,
      values.size,
      values.quality,
      values.outputFormat,
      values.useContext,
      values.status,
      values.storyboardJson,
      now,
      now
    );
    return this.findById(id);
  },
  findById(id) {
    return parseComicProject(open().prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM images i WHERE i.comic_project_id = p.id) AS image_count,
        (SELECT i.path FROM images i WHERE i.comic_project_id = p.id
          ORDER BY COALESCE(i.comic_panel_index, i.image_index, 999999) ASC, i.created_at ASC LIMIT 1) AS thumbnail_path
      FROM comic_projects p
      WHERE p.id = ?
    `).get(id));
  },
  listByUser(userId, limit = 200) {
    return open().prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM images i WHERE i.comic_project_id = p.id) AS image_count,
        (SELECT i.path FROM images i WHERE i.comic_project_id = p.id
          ORDER BY COALESCE(i.comic_panel_index, i.image_index, 999999) ASC, i.created_at ASC LIMIT 1) AS thumbnail_path
      FROM comic_projects p
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC
      LIMIT ?
    `).all(userId, Math.max(1, Math.floor(Number(limit) || 200))).map(parseComicProject);
  },
  countByUser(userId) {
    return open().prepare('SELECT COUNT(*) AS n FROM comic_projects WHERE user_id = ?').get(userId)?.n || 0;
  },
  deleteById(id) {
    return open().prepare('DELETE FROM comic_projects WHERE id = ?').run(id).changes || 0;
  },
  touch(id, { status = null } = {}) {
    if (!id) return null;
    if (status) {
      open().prepare('UPDATE comic_projects SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    } else {
      open().prepare('UPDATE comic_projects SET updated_at = ? WHERE id = ?').run(nowIso(), id);
    }
    return this.findById(id);
  }
};

// ---- image_likes ----

export const imageLikes = createImageLikeRepository({ open, nowIso });

// ---- audit_logs ----

export const auditLogs = createAuditLogRepository({ open, nowIso });

// ---- client_logs ----

export const clientLogs = createClientLogRepository({ open, nowIso });

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
  bump(userId, day, { calls = 0, images = 0, bytes = 0, fails = 0, promptOptimizations = 0 } = {}) {
    const db = open();
    const cur = this.get(userId, day);
    if (cur) {
      db.prepare(`
        UPDATE usage_daily SET
          call_count  = call_count  + ?,
          image_count = image_count + ?,
          bytes       = bytes       + ?,
          prompt_optimize_count = prompt_optimize_count + ?,
          fail_count  = fail_count  + ?
        WHERE user_id = ? AND day = ?
      `).run(calls, images, bytes, promptOptimizations, fails, userId, day);
    } else {
      db.prepare(`
        INSERT INTO usage_daily
          (user_id, day, call_count, image_count, bytes, prompt_optimize_count, fail_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, day, calls, images, bytes, promptOptimizations, fails);
    }
  },
  // 区间聚合：[fromDay, toDay] 含端点，YYYY-MM-DD。
  sum(userId, fromDay, toDay) {
    const row = open().prepare(`
      SELECT
        COALESCE(SUM(call_count), 0)  AS calls,
        COALESCE(SUM(image_count), 0) AS images,
        COALESCE(SUM(bytes), 0)       AS bytes,
        COALESCE(SUM(prompt_optimize_count), 0) AS promptOptimizations,
        COALESCE(SUM(fail_count), 0)  AS fails
      FROM usage_daily
      WHERE user_id = ? AND day >= ? AND day <= ?
    `).get(userId, fromDay, toDay);
    return {
      calls: Number(row?.calls) || 0,
      images: Number(row?.images) || 0,
      bytes: Number(row?.bytes) || 0,
      promptOptimizations: Number(row?.promptOptimizations) || 0,
      fails: Number(row?.fails) || 0
    };
  },
  sumBySignupIp(signupIp, fromDay, toDay) {
    const row = open().prepare(`
      SELECT
        COALESCE(SUM(d.call_count), 0)  AS calls,
        COALESCE(SUM(d.image_count), 0) AS images,
        COALESCE(SUM(d.bytes), 0)       AS bytes,
        COALESCE(SUM(d.prompt_optimize_count), 0) AS promptOptimizations,
        COALESCE(SUM(d.fail_count), 0)  AS fails
      FROM usage_daily d
      JOIN users u ON u.id = d.user_id
      WHERE u.signup_ip = ? AND u.role != 'admin' AND d.day >= ? AND d.day <= ?
    `).get(signupIp, fromDay, toDay);
    return {
      calls: Number(row?.calls) || 0,
      images: Number(row?.images) || 0,
      bytes: Number(row?.bytes) || 0,
      promptOptimizations: Number(row?.promptOptimizations) || 0,
      fails: Number(row?.fails) || 0
    };
  },
  // 清空某用户的某段时间 (admin 应急)
  reset(userId, fromDay, toDay) {
    open().prepare(
      'DELETE FROM usage_daily WHERE user_id = ? AND day >= ? AND day <= ?'
    ).run(userId, fromDay, toDay);
  },
  deleteOlderThan(cutoffDay) {
    if (!cutoffDay) return 0;
    const res = open().prepare('DELETE FROM usage_daily WHERE day < ?').run(cutoffDay);
    return res.changes;
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

function parseJobPayloadJson(value) {
  if (value === null || value === undefined || value === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isQuotaManagedJobPayload(payload = {}) {
  return payload?.useSystemDefault === true || payload?.interfaceMode === 'system';
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
  listByComicProject(userId, projectId, { limit = 1000, scanLimit = 5000 } = {}) {
    const rows = open().prepare(`
      SELECT * FROM generation_jobs
      WHERE user_id = ?
      ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
        CASE WHEN status IN ('queued', 'running') THEN priority ELSE 0 END DESC,
        CASE WHEN status IN ('queued', 'running') THEN created_at ELSE -COALESCE(finished_at, updated_at, created_at) END ASC
      LIMIT ?
    `).all(userId, Math.max(1, Math.floor(Number(scanLimit) || 5000))).map(parseJob);
    const id = String(projectId || '');
    return rows
      .filter((job) => String(job?.payload?.comicProjectId || '') === id)
      .slice(0, Math.max(1, Math.floor(Number(limit) || 1000)));
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
  stats() {
    const db = open();
    const byStatus = {};
    for (const row of db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM generation_jobs
      GROUP BY status
    `).all()) {
      if (!row?.status) continue;
      byStatus[row.status] = Number(row.count) || 0;
    }
    const duration = db.prepare(`
      SELECT COUNT(*) AS count, AVG(finished_at - started_at) AS avg_ms
      FROM generation_jobs
      WHERE status = 'succeeded'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
    `).get();
    const completedDurations = Number(duration?.count) || 0;
    return {
      byStatus,
      completedDurations,
      avgSuccessDurationMs: completedDurations ? Math.round(Number(duration?.avg_ms) || 0) : null
    };
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
  claimQueued(id, { startedAt = Date.now(), attempts = 0, progress = null } = {}) {
    const db = open();
    const now = Date.now();
    const result = db.prepare(`
      UPDATE generation_jobs
      SET status = 'running',
          started_at = ?,
          finished_at = NULL,
          result_json = NULL,
          error_message = NULL,
          progress_json = ?,
          attempts = ?,
          cancel_requested = 0,
          updated_at = ?
      WHERE id = ?
        AND status = 'queued'
        AND cancel_requested = 0
    `).run(
      startedAt,
      progress === null || progress === undefined ? null : JSON.stringify(progress || {}),
      Math.max(0, Math.floor(Number(attempts) || 0)),
      now,
      id
    );
    if ((result.changes || 0) !== 1) return null;
    return this.findById(id);
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
  updatePayload(id, payload) {
    open().prepare(`
      UPDATE generation_jobs
      SET payload_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(payload || {}), Date.now(), id);
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
  queuedOlderThan(cutoffMs, limit = 1000) {
    return open().prepare(`
      SELECT * FROM generation_jobs
      WHERE status = 'queued' AND created_at < ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(cutoffMs, Math.max(1, Math.floor(Number(limit) || 1000))).map(parseJob);
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
  pendingCallCount(userId, { quotaManagedOnly = false } = {}) {
    if (!userId) return 0;
    const rows = open().prepare(`
      SELECT n, payload_json
      FROM generation_jobs
      WHERE user_id = ? AND status IN ('queued', 'running')
    `).all(userId);
    return rows.reduce((sum, row) => {
      if (quotaManagedOnly && !isQuotaManagedJobPayload(parseJobPayloadJson(row.payload_json))) return sum;
      return sum + (Number(row.n) || 0);
    }, 0);
  },
  pendingCallCountBySignupIp(signupIp, { quotaManagedOnly = false } = {}) {
    if (!signupIp) return 0;
    const rows = open().prepare(`
      SELECT j.n, j.payload_json
      FROM generation_jobs j
      JOIN users u ON u.id = j.user_id
      WHERE u.signup_ip = ? AND u.role != 'admin' AND j.status IN ('queued', 'running')
    `).all(signupIp);
    return rows.reduce((sum, row) => {
      if (quotaManagedOnly && !isQuotaManagedJobPayload(parseJobPayloadJson(row.payload_json))) return sum;
      return sum + (Number(row.n) || 0);
    }, 0);
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

// ---- registration_invites ----

const INVITE_CODE_HASH_PREFIX = 'inv:v1:';

function isInviteCodeHash(value) {
  return String(value || '').startsWith(INVITE_CODE_HASH_PREFIX);
}

function hashInviteCode(code) {
  const text = String(code || '').trim();
  return `${INVITE_CODE_HASH_PREFIX}${createHash('sha256').update(text).digest('hex')}`;
}

function inviteLookupKeys(code, { allowStoredIdentifier = false } = {}) {
  const text = String(code || '').trim();
  if (!text) return [];
  const keys = [hashInviteCode(text)];
  if (allowStoredIdentifier || !isInviteCodeHash(text)) keys.push(text);
  return [...new Set(keys)];
}

function inviteDisplayCode(code) {
  const text = String(code || '').trim();
  if (!isInviteCodeHash(text)) return text;
  const hash = text.slice(INVITE_CODE_HASH_PREFIX.length);
  return `${INVITE_CODE_HASH_PREFIX}${hash.slice(0, 10)}...`;
}

function isPastIso(value, nowMs = Date.now()) {
  const text = String(value || '').trim();
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time) && time <= nowMs;
}

function parseInvite(row) {
  if (!row) return null;
  const maxUses = Math.max(1, Math.floor(Number(row.max_uses) || 1));
  const usedCount = Math.max(0, Math.floor(Number(row.used_count) || 0));
  const remainingUses = Math.max(0, maxUses - usedCount);
  const expiresAt = row.expires_at || null;
  const expired = isPastIso(expiresAt);
  return {
    code: row.code,
    displayCode: inviteDisplayCode(row.code),
    codeHash: isInviteCodeHash(row.code) ? row.code : hashInviteCode(row.code),
    maxUses,
    usedCount,
    remainingUses,
    createdAt: row.created_at,
    createdBy: row.created_by || null,
    updatedAt: row.updated_at,
    expiresAt,
    expired,
    disabledAt: row.disabled_at || null,
    disabledBy: row.disabled_by || null,
    active: !row.disabled_at && !expired && remainingUses > 0
  };
}

function parseInviteRedemption(row) {
  if (!row) return null;
  const currentUsername = row.current_username || null;
  const currentEmail = row.current_email || null;
  return {
    id: row.id,
    code: row.code,
    displayCode: inviteDisplayCode(row.code),
    userId: row.user_id || null,
    username: currentUsername || row.user_username || null,
    email: currentEmail || row.user_email || null,
    userDeleted: Boolean(row.user_id && !currentUsername && !currentEmail),
    usedAt: row.used_at
  };
}

export const registrationInvites = {
  list({ includeDisabled = false } = {}) {
    const where = includeDisabled ? '' : 'WHERE disabled_at IS NULL';
    return open().prepare(`
      SELECT * FROM registration_invites
      ${where}
      ORDER BY created_at DESC
    `).all().map(parseInvite);
  },
  activeCount() {
    const now = nowIso();
    const row = open().prepare(`
      SELECT COUNT(*) AS n
      FROM registration_invites
      WHERE disabled_at IS NULL
        AND used_count < max_uses
        AND (expires_at IS NULL OR expires_at > ?)
    `).get(now);
    return Number(row?.n) || 0;
  },
  findUsable(code) {
    const keys = inviteLookupKeys(code);
    if (!keys.length) return null;
    const now = nowIso();
    const row = open().prepare(`
      SELECT * FROM registration_invites
      WHERE code IN (${keys.map(() => '?').join(',')})
        AND disabled_at IS NULL
        AND used_count < max_uses
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(...keys, now);
    return parseInvite(row);
  },
  exists(code) {
    const keys = inviteLookupKeys(code, { allowStoredIdentifier: true });
    if (!keys.length) return false;
    const row = open().prepare(`
      SELECT 1 AS found
      FROM registration_invites
      WHERE code IN (${keys.map(() => '?').join(',')})
      LIMIT 1
    `).get(...keys);
    return Boolean(row?.found);
  },
  createMany(items = [], { createdBy = null } = {}) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return [];
    const db = open();
    const createdAt = nowIso();
    const stmt = db.prepare(`
      INSERT INTO registration_invites
      (code, max_uses, used_count, created_at, created_by, updated_at, expires_at, disabled_at, disabled_by)
      VALUES (?, ?, 0, ?, ?, ?, ?, NULL, NULL)
    `);
    const created = [];
    db.exec('BEGIN;');
    try {
      for (const item of rows) {
        const code = String(item?.code || '').trim();
        if (!code) continue;
        const storedCode = hashInviteCode(code);
        const maxUses = Math.max(1, Math.floor(Number(item?.maxUses) || 1));
        const expiresAt = String(item?.expiresAt || '').trim() || null;
        stmt.run(storedCode, maxUses, createdAt, createdBy || null, createdAt, expiresAt);
        created.push({
          ...parseInvite({
            code: storedCode,
            max_uses: maxUses,
            used_count: 0,
            created_at: createdAt,
            created_by: createdBy || null,
            updated_at: createdAt,
            expires_at: expiresAt,
            disabled_at: null,
            disabled_by: null
          }),
          code,
          codeHash: storedCode,
          displayCode: code,
          oneTimePlaintext: true
        });
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
    return created;
  },
  consume(code, { userId = null } = {}) {
    const keys = inviteLookupKeys(code);
    if (!keys.length) return null;
    const db = open();
    const usedAt = nowIso();
    db.exec('BEGIN;');
    try {
      const res = db.prepare(`
        UPDATE registration_invites
        SET used_count = used_count + 1,
            updated_at = ?
        WHERE code IN (${keys.map(() => '?').join(',')})
          AND disabled_at IS NULL
          AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > ?)
      `).run(usedAt, ...keys, usedAt);
      if (!res.changes) {
        db.exec('ROLLBACK;');
        return null;
      }
      const stored = db.prepare(`
        SELECT * FROM registration_invites
        WHERE code IN (${keys.map(() => '?').join(',')})
        LIMIT 1
      `).get(...keys);
      const storedCode = stored?.code || keys[0];
      const safeUserId = String(userId || '').trim();
      const user = safeUserId
        ? db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(safeUserId)
        : null;
      db.prepare(`
        INSERT INTO registration_invite_redemptions
        (id, code, user_id, user_username, user_email, used_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        storedCode,
        user?.id || safeUserId || null,
        user?.username || null,
        user?.email || null,
        usedAt
      );
      const invite = parseInvite(stored);
      db.exec('COMMIT;');
      return invite;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  },
  disable(code, { disabledBy = null } = {}) {
    const keys = inviteLookupKeys(code, { allowStoredIdentifier: true });
    if (!keys.length) return null;
    const db = open();
    const existing = db.prepare(`
      SELECT * FROM registration_invites
      WHERE code IN (${keys.map(() => '?').join(',')})
      LIMIT 1
    `).get(...keys);
    if (!existing) return null;
    if (existing.disabled_at) return parseInvite(existing);
    const disabledAt = nowIso();
    db.prepare(`
      UPDATE registration_invites
      SET disabled_at = ?,
          disabled_by = ?,
          updated_at = ?
      WHERE code = ? AND disabled_at IS NULL
    `).run(disabledAt, disabledBy || null, disabledAt, existing.code);
    return parseInvite(db.prepare('SELECT * FROM registration_invites WHERE code = ?').get(existing.code));
  },
  disableUnusedBefore(cutoffIso, { disabledBy = null } = {}) {
    const cutoff = String(cutoffIso || '').trim();
    if (!cutoff) return 0;
    const disabledAt = nowIso();
    const res = open().prepare(`
      UPDATE registration_invites
      SET disabled_at = ?,
          disabled_by = ?,
          updated_at = ?
      WHERE disabled_at IS NULL
        AND used_count = 0
        AND created_at < ?
    `).run(disabledAt, disabledBy || null, disabledAt, cutoff);
    return res.changes || 0;
  },
  reset() {
    const res = open().prepare('DELETE FROM registration_invites').run();
    return res.changes || 0;
  }
};

export const registrationInviteRedemptions = {
  list({ limit = 1000 } = {}) {
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 1000)));
    return open().prepare(`
      SELECT
        r.*,
        u.username AS current_username,
        u.email AS current_email
      FROM registration_invite_redemptions r
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.used_at DESC, r.id DESC
      LIMIT ?
    `).all(safeLimit).map(parseInviteRedemption);
  },
  cleanupBefore(cutoffIso) {
    const cutoff = String(cutoffIso || '').trim();
    if (!cutoff) return 0;
    const res = open().prepare(
      'DELETE FROM registration_invite_redemptions WHERE used_at < ?'
    ).run(cutoff);
    return res.changes || 0;
  }
};

// ---- system_settings ----

export const systemSettings = createSystemSettingsRepository({ open, nowIso });

// ---- schema_migrations ----

export const schemaMigrations = createSchemaMigrationRepository({ open });

// ---- prompt_square ----

export const promptSquare = createPromptSquareRepository({ open, nowIso });

export function healthCheck() {
  try {
    const row = open().prepare('SELECT 1 AS ok').get();
    return { ok: row?.ok === 1, path: DB_PATH };
  } catch (err) {
    return { ok: false, path: DB_PATH, error: err?.message || String(err) };
  }
}

export const dbPaths = Object.freeze({
  dir: DB_DIR,
  file: DB_PATH,
  migrationBackups: MIGRATION_BACKUP_DIR,
  legacyGallery: LEGACY_GALLERY,
  legacyGalleryDone: LEGACY_GALLERY_DONE
});
