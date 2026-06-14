// SQLite schema bootstrap and versioned migrations.

import { logger } from '../utils/logger.js';
import { hashSessionId, isSessionIdHash } from './db-sessions.js';
import { hashInviteCode, isInviteCodeHash } from './db-registration-invites.js';
import { createSqliteMigrationBackup } from './sqlite-migration-backup.js';
import { seedPromptSquareDefaults } from './db-prompt-square-seed.js';
import { migrateLegacyGallery } from './sqlite-legacy-gallery-migration.js';

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
  comic_panel_index INTEGER,
  video_project_id TEXT,
  video_frame_kind TEXT,
  video_frame_index INTEGER,
  video_from_index INTEGER,
  video_to_index INTEGER
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

CREATE TABLE IF NOT EXISTS video_projects (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  keyframe_count  INTEGER NOT NULL DEFAULT 0,
  chat_model      TEXT,
  image_model     TEXT,
  size            TEXT,
  quality         TEXT,
  output_format   TEXT,
  use_references  INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft',
  config_json     TEXT NOT NULL DEFAULT '{}',
  storyboard_json TEXT NOT NULL DEFAULT '{}',
  reference_json  TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_projects_user_updated ON video_projects(user_id, updated_at DESC);

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

CREATE TABLE IF NOT EXISTS queue_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scope        TEXT NOT NULL DEFAULT 'global',
  event        TEXT NOT NULL,
  user_id      TEXT,
  job_id       TEXT,
  payload_json TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_events_user_id
  ON queue_events(scope, user_id, id);
CREATE INDEX IF NOT EXISTS idx_queue_events_job_id
  ON queue_events(scope, job_id, id);
CREATE INDEX IF NOT EXISTS idx_queue_events_scope_id
  ON queue_events(scope, id);

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

export function migrateSchema(db, { nowIso, dbPath, migrationBackupDir, legacyGallery, legacyGalleryDone }) {
  db.exec(SCHEMA);
  runSchemaMigration(db, 1, 'user_abuse_columns', () => migrateUserAbuseColumns(db));
  runSchemaMigration(db, 2, 'image_public_columns', () => migrateImagePublicColumns(db));
  runSchemaMigration(db, 3, 'usage_daily_prompt_optimize_count', () => migrateUsageDailyColumns(db));
  runSchemaMigration(db, 4, 'comic_project_tables', () => migrateComicProjectTables(db));
  runSchemaMigration(db, 5, 'registration_invite_redemptions', () => migrateRegistrationInviteTables(db));
  db.exec(DATA_LIFECYCLE_INDEXES);
  runSchemaMigration(db, 6, 'prompt_square_nullable_owner', () => migratePromptSquareNullableOwner(db, { dbPath, migrationBackupDir }), { transaction: false });
  runSchemaMigration(db, 7, 'registration_invite_code_hashes', () => migrateRegistrationInviteCodeHashes(db, { nowIso }));
  runSchemaMigration(db, 8, 'registration_invite_expiry', () => migrateRegistrationInviteExpiry(db));
  runSchemaMigration(db, 9, 'session_id_hashes', () => migrateSessionIdHashes(db));
  runSchemaMigration(db, 10, 'user_password_reset_required', () => migrateUserPasswordResetRequired(db));
  runSchemaMigration(db, 11, 'session_csrf_tokens', () => migrateSessionCsrfTokens(db));
  runSchemaMigration(db, 12, 'prompt_square_fts_index', () => migratePromptSquareFtsIndex(db));
  runSchemaMigration(db, 13, 'image_variant_paths', () => migrateImageVariantPaths(db));
  runSchemaMigration(db, 14, 'queue_event_log', () => migrateQueueEventLog(db));
  runSchemaMigration(db, 15, 'video_project_tables', () => migrateVideoProjectTables(db));
  seedPromptSquareDefaults(db, { nowIso });
  migrateLegacyGallery(db, { legacyGallery, legacyGalleryDone, nowIso });
}

function runSchemaMigration(db, version, name, fn, { transaction = true, nowIso = () => new Date().toISOString() } = {}) {
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

function migrateRegistrationInviteCodeHashes(db, { nowIso }) {
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

function migrateQueueEventLog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      scope        TEXT NOT NULL DEFAULT 'global',
      event        TEXT NOT NULL,
      user_id      TEXT,
      job_id       TEXT,
      payload_json TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queue_events_user_id
      ON queue_events(scope, user_id, id);
    CREATE INDEX IF NOT EXISTS idx_queue_events_job_id
      ON queue_events(scope, job_id, id);
    CREATE INDEX IF NOT EXISTS idx_queue_events_scope_id
      ON queue_events(scope, id);
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

function migrateVideoProjectTables(db) {
  addColumnIfMissing(db, 'images', 'video_project_id', 'video_project_id TEXT');
  addColumnIfMissing(db, 'images', 'video_frame_kind', 'video_frame_kind TEXT');
  addColumnIfMissing(db, 'images', 'video_frame_index', 'video_frame_index INTEGER');
  addColumnIfMissing(db, 'images', 'video_from_index', 'video_from_index INTEGER');
  addColumnIfMissing(db, 'images', 'video_to_index', 'video_to_index INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_projects (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      prompt          TEXT NOT NULL,
      keyframe_count  INTEGER NOT NULL DEFAULT 0,
      chat_model      TEXT,
      image_model     TEXT,
      size            TEXT,
      quality         TEXT,
      output_format   TEXT,
      use_references  INTEGER NOT NULL DEFAULT 1,
      status          TEXT NOT NULL DEFAULT 'draft',
      config_json     TEXT NOT NULL DEFAULT '{}',
      storyboard_json TEXT NOT NULL DEFAULT '{}',
      reference_json  TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_video_projects_user_updated ON video_projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_video_project
      ON images(video_project_id, video_frame_kind, video_frame_index, video_from_index, video_to_index, created_at);
    CREATE INDEX IF NOT EXISTS idx_images_user_video_created
      ON images(user_id, video_project_id, created_at DESC);
  `);
}

function migratePromptSquareNullableOwner(db, { dbPath, migrationBackupDir }) {
  const cols = db.prepare('PRAGMA table_info(prompt_square)').all();
  const userIdCol = cols.find((col) => col.name === 'user_id');
  if (!userIdCol?.notnull) return;

  const backup = createSqliteMigrationBackup(db, {
    dbPath,
    backupRoot: migrationBackupDir,
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
