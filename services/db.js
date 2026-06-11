// SQLite 单例 + 迁移 + CRUD 包装。
// 使用 node:sqlite（Node 22.5+ 内置，零编译）。

import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { positiveIntFromEnv } from '../utils/config.js';
import { createUserRepository } from './db-users.js';
import { createRateLimitRepository } from './db-rate-limits.js';
import { createSessionRepository } from './db-sessions.js';
import { createPromptSquareRepository } from './db-prompt-square.js';
import { createSchemaMigrationRepository, createSystemSettingsRepository } from './db-system.js';
import { migrateSchema } from './sqlite-schema-migrations.js';
import { createAuditLogRepository, createClientLogRepository, createImageLikeRepository } from './db-logs.js';
import { createUsageDailyRepository, createUserQuotaRepository } from './db-usage.js';
import { createGenerationJobRepository } from './db-generation-jobs.js';
import { createImageRepository } from './db-images.js';
import { createComicProjectRepository } from './db-comic-projects.js';
import { createRegistrationInviteRepositories } from './db-registration-invites.js';

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

export function migrate() {
  const db = open();
  migrateSchema(db, {
    nowIso,
    dbPath: DB_PATH,
    migrationBackupDir: MIGRATION_BACKUP_DIR,
    legacyGallery: LEGACY_GALLERY,
    legacyGalleryDone: LEGACY_GALLERY_DONE
  });
}

// ---- users ----

export const users = createUserRepository({ open, nowIso });

// ---- persistent rate limits ----

export const rateLimits = createRateLimitRepository({ open, nowIso });

// ---- sessions ----

export const sessions = createSessionRepository({ open, nowIso });

// ---- images ----

export const images = createImageRepository({ open, nowIso });

export const comicProjects = createComicProjectRepository({ open, nowIso });

// ---- image_likes ----

export const imageLikes = createImageLikeRepository({ open, nowIso });

// ---- audit_logs ----

export const auditLogs = createAuditLogRepository({ open, nowIso });

// ---- client_logs ----

export const clientLogs = createClientLogRepository({ open, nowIso });

// ---- user_quotas ----

export const userQuotas = createUserQuotaRepository({ open, nowIso });

// ---- usage_daily ----

export const usageDaily = createUsageDailyRepository({ open });

// ---- generation_jobs ----

export const generationJobs = createGenerationJobRepository({ open });

// ---- registration_invites ----

const registrationInviteRepositories = createRegistrationInviteRepositories({ open, nowIso });
export const registrationInvites = registrationInviteRepositories.registrationInvites;
export const registrationInviteRedemptions = registrationInviteRepositories.registrationInviteRedemptions;

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
