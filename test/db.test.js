// 验证 db.migrate 幂等 + legacy gallery.json 迁移逻辑。
// 每个测试文件在独立进程（--test-isolation=process），允许 chdir 到 tmp 目录。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROMPT_SQUARE_SEED_KEY } from '../services/prompt-square-seeds.js';

let workDir;
let prevCwd;
let db;
let auth;
let prevBootstrapToken;

const SESSION_ID_HASH_PREFIX = 'sid:v1:';

function hashSessionIdForTest(id) {
  return `${SESSION_ID_HASH_PREFIX}${createHash('sha256').update(String(id || '').trim()).digest('hex')}`;
}

before(async () => {
  prevCwd = process.cwd();
  prevBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-db-'));
  mkdirSync(join(workDir, 'generated'), { recursive: true });
  process.chdir(workDir);

  // 在 chdir 之后再 import，确保 db 单例绑定到 tmp 目录
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
});

after(() => {
  process.chdir(prevCwd);
  if (prevBootstrapToken === undefined) delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  else process.env.ADMIN_BOOTSTRAP_TOKEN = prevBootstrapToken;
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('migrate creates schema and is idempotent', () => {
  db.migrate();
  // 二次调用不抛错
  db.migrate();
  // 表都建出来了
  assert.equal(db.users.count(), 0);
  assert.equal(db.sessions.destroyExpired(), 0);
  assert.deepEqual(db.images.listAll(10), []);
  const migrations = db.schemaMigrations.list();
  assert.ok(migrations.length >= 6);
  assert.deepEqual(
    migrations.slice(0, 6).map((item) => item.version),
    [1, 2, 3, 4, 5, 6]
  );
});

test('prompt square seed sync refreshes stale rows even when seed marker exists', () => {
  db.migrate();
  const staleTitle = 'stale seed title';
  const stalePrompt = 'stale seed prompt';
  const now = new Date().toISOString();
  let seedRow;

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    seedRow = sqlite.prepare(`
      SELECT id, source_prompt_id, title, prompt
      FROM prompt_square
      WHERE source = 'seed'
      ORDER BY published_at DESC
      LIMIT 1
    `).get();
    assert.ok(seedRow, 'expected an existing prompt square seed row');
    sqlite.prepare(`
      UPDATE prompt_square
      SET title = ?, prompt = ?, tags = ?, meta = ?, updated_at = ?
      WHERE id = ?
    `).run(staleTitle, stalePrompt, '["stale"]', '{}', now, seedRow.id);
    sqlite.prepare(`
      UPDATE system_settings
      SET value = ?, updated_at = ?
      WHERE key = ?
    `).run(JSON.stringify({
      sourceUrl: 'legacy',
      total: 999,
      inserted: 0,
      updated: 0
    }), now, PROMPT_SQUARE_SEED_KEY);
  } finally {
    sqlite.close();
  }

  db.migrate();

  const refreshedDb = new DatabaseSync(db.dbPaths.file);
  try {
    const refreshed = refreshedDb.prepare(`
      SELECT title, prompt, tags, source, meta
      FROM prompt_square
      WHERE id = ?
    `).get(seedRow.id);
    assert.notEqual(refreshed.title, staleTitle);
    assert.notEqual(refreshed.prompt, stalePrompt);
    assert.equal(refreshed.source, 'seed');
    assert.notEqual(refreshed.tags, '["stale"]');
    const meta = JSON.parse(refreshed.meta);
    assert.equal(meta.seed, true);
    assert.equal(meta.sourceName, 'Promptsref');

    const state = JSON.parse(
      refreshedDb.prepare('SELECT value FROM system_settings WHERE key = ?').get(PROMPT_SQUARE_SEED_KEY).value
    );
    assert.match(state.digest, /^[a-f0-9]{64}$/);
    assert.equal(state.previousDigest, null);
    assert.ok(state.total > 0);
  } finally {
    refreshedDb.close();
  }
});

test('destructive prompt square migration creates a database backup first', () => {
  db.migrate();
  const owner = db.users.create({
    username: 'migration_owner',
    email: 'migration-owner@example.com',
    passwordHash: 'hash',
    passwordSalt: 'salt'
  });
  const now = new Date().toISOString();

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS prompt_square_legacy;
      CREATE TABLE prompt_square_legacy (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    `);
    sqlite.prepare(`
      INSERT INTO prompt_square_legacy
      (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-prompt-square-1',
      owner.id,
      'legacy-source-1',
      'Legacy prompt',
      'legacy prompt body',
      '[]',
      'manual',
      '{}',
      7,
      now,
      now,
      now
    );
    sqlite.exec(`
      DROP TABLE prompt_square;
      ALTER TABLE prompt_square_legacy RENAME TO prompt_square;
      DELETE FROM schema_migrations WHERE version = 6;
      PRAGMA foreign_keys = ON;
    `);
  } finally {
    sqlite.close();
  }

  const backupRoot = db.dbPaths.migrationBackups;
  const beforeBackups = new Set(existsSync(backupRoot) ? readdirSync(backupRoot) : []);

  db.migrate();

  const migrated = new DatabaseSync(db.dbPaths.file);
  try {
    const cols = migrated.prepare('PRAGMA table_info(prompt_square)').all();
    const userIdCol = cols.find((col) => col.name === 'user_id');
    assert.equal(userIdCol.notnull, 0);
    assert.equal(
      migrated.prepare('SELECT COUNT(*) AS n FROM prompt_square WHERE id = ? AND user_id = ?').get(
        'legacy-prompt-square-1',
        owner.id
      ).n,
      1
    );
    assert.equal(
      migrated.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 6').get().n,
      1
    );
  } finally {
    migrated.close();
  }

  const newBackupNames = readdirSync(backupRoot).filter((name) => !beforeBackups.has(name));
  assert.equal(newBackupNames.length, 1);
  const backupDir = join(backupRoot, newBackupNames[0]);
  const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.kind, 'sqlite-migration-backup');
  assert.equal(manifest.migration.version, 6);
  assert.equal(manifest.migration.name, 'prompt_square_nullable_owner');
  assert.ok(manifest.files.some((file) => file.path === 'app.db' && file.size > 0 && file.sha256.length === 64));

  const backupDb = new DatabaseSync(join(backupDir, 'app.db'), { readOnly: true });
  try {
    const backupCols = backupDb.prepare('PRAGMA table_info(prompt_square)').all();
    const backupUserIdCol = backupCols.find((col) => col.name === 'user_id');
    assert.equal(backupUserIdCol.notnull, 1);
  } finally {
    backupDb.close();
  }
});

test('migrate creates lifecycle and hot-query indexes idempotently', () => {
  db.migrate();
  db.migrate();

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    const names = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'idx_images_public_published',
          'idx_images_user_model_created',
          'idx_images_profile_created',
          'idx_images_bytes_created',
          'idx_audit_action_created',
          'idx_client_logs_user_level_received',
          'idx_usage_day'
        )
    `).all().map((row) => row.name).sort();
    assert.deepEqual(names, [
      'idx_audit_action_created',
      'idx_client_logs_user_level_received',
      'idx_images_bytes_created',
      'idx_images_profile_created',
      'idx_images_public_published',
      'idx_images_user_model_created',
      'idx_usage_day'
    ]);
  } finally {
    sqlite.close();
  }
});

test('session id migration hashes legacy bearer tokens', () => {
  db.migrate();
  const user = db.users.create({
    username: 'session_migration_user',
    email: 'session-migration@example.com',
    passwordHash: 'hash',
    passwordSalt: 'salt'
  });
  const legacyId = 'legacy-session-token';
  const legacyHash = hashSessionIdForTest(legacyId);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + db.sessions.TTL_MS).toISOString();

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('DELETE FROM schema_migrations WHERE version = 9').run();
    sqlite.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(legacyId, user.id, now, expires, 'legacy-test', '127.0.0.1');
  } finally {
    sqlite.close();
  }

  db.migrate();

  const migrated = new DatabaseSync(db.dbPaths.file);
  try {
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').get(legacyId).n, 0);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').get(legacyHash).n, 1);
  } finally {
    migrated.close();
  }
  assert.ok(auth.getSessionUser(legacyId), 'plain cookie value should still resolve after migration');
  assert.equal(auth.getSessionUser(legacyHash), null, 'stored hash must not be reusable as a cookie');
});

test('admin stats counts today with an index-friendly day range', () => {
  const user = auth.register({
    username: 'stats_user',
    email: 'stats_user@example.com',
    password: 'longenough1'
  });
  // 本文件后续需要验证“无 admin 时 legacy gallery 迁移会延后”；
  // 首个注册现在会自动成为 admin，因此这里显式降回普通用户。
  if (user.role === 'admin') db.users.updateRole(user.id, 'user');
  db.images.insert({
    id: 'stats-today-1',
    userId: user.id,
    createdAt: '2026-05-29T00:00:00.000Z',
    filename: 'today-1.png',
    path: 'users/stats/images/today-1.png',
    mimeType: 'image/png',
    bytes: 100
  });
  db.images.insert({
    id: 'stats-today-2',
    userId: user.id,
    createdAt: '2026-05-29T23:59:59.999Z',
    filename: 'today-2.png',
    path: 'users/stats/images/today-2.png',
    mimeType: 'image/png',
    bytes: 200
  });
  db.images.insert({
    id: 'stats-yesterday',
    userId: user.id,
    createdAt: '2026-05-28T23:59:59.999Z',
    filename: 'yesterday.png',
    path: 'users/stats/images/yesterday.png',
    mimeType: 'image/png',
    bytes: 300
  });

  const stats = db.images.adminStats('2026-05-29');
  assert.equal(stats.savedToday, 2);
});

test('generation job claim atomically moves only queued uncancelled jobs to running', () => {
  db.migrate();
  const user = auth.register({
    username: 'job_claim_user',
    email: 'job-claim@example.com',
    password: 'longenough1'
  });
  if (user.role === 'admin') db.users.updateRole(user.id, 'user');

  const job = db.generationJobs.create({
    userId: user.id,
    status: 'queued',
    priority: 3,
    payload: { prompt: 'claim me', n: 1 },
    promptPreview: 'claim me',
    profileName: 'Claim Test',
    model: 'test-image-model',
    n: 1
  });

  const claimed = db.generationJobs.claimQueued(job.id, {
    startedAt: 12345,
    attempts: 1,
    progress: { stage: 'started', message: 'claimed' }
  });

  assert.equal(claimed.status, 'running');
  assert.equal(claimed.started_at, 12345);
  assert.equal(claimed.attempts, 1);
  assert.deepEqual(claimed.progress, { stage: 'started', message: 'claimed' });
  assert.equal(db.generationJobs.claimQueued(job.id, { attempts: 2 }), null);

  const cancelled = db.generationJobs.create({
    userId: user.id,
    status: 'queued',
    payload: { prompt: 'cancelled', n: 1 },
    promptPreview: 'cancelled',
    profileName: 'Claim Test',
    model: 'test-image-model',
    n: 1
  });
  db.generationJobs.requestCancel(cancelled.id);

  assert.equal(db.generationJobs.claimQueued(cancelled.id, { attempts: 1 }), null);
  assert.equal(db.generationJobs.findById(cancelled.id).status, 'queued');
});

test('legacy gallery.json migration: deferred until admin exists, then idempotent', () => {
  const galleryPath = join(workDir, 'generated', 'gallery.json');
  const migratedPath = join(workDir, 'generated', 'gallery.json.migrated');
  const baselineImageCount = db.images.listAll(1000).length;

  const legacyItems = [
    {
      id: 'legacy-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      filename: 'a.png',
      path: 'images/2026-01-01/a.png',
      mimeType: 'image/png',
      bytes: 100,
      prompt: 'p1',
      model: 'gpt-image-2'
    },
    {
      id: 'legacy-2',
      createdAt: '2026-01-02T00:00:00.000Z',
      filename: 'b.png',
      path: 'images/2026-01-02/b.png',
      mimeType: 'image/png',
      bytes: 200,
      prompt: 'p2',
      model: 'gpt-image-2'
    }
  ];
  writeFileSync(galleryPath, JSON.stringify({ version: 1, items: legacyItems }));

  // 没有 admin → 迁移延后；gallery.json 仍在
  db.migrate();
  assert.ok(existsSync(galleryPath), 'gallery.json should remain when no admin');
  assert.equal(db.images.listAll(1000).length, baselineImageCount);

  // 注册首位用户 → 自动 admin
  const adminUser = auth.register({
    username: 'admin1',
    email: 'a@b.com',
    password: 'longenough1',
    adminBootstrapToken: 'bootstrap-secret'
  });
  assert.equal(adminUser.role, 'admin');

  // 再次 migrate → 触发 legacy 搬迁
  db.migrate();
  assert.equal(existsSync(galleryPath), false, 'gallery.json should be renamed');
  assert.ok(existsSync(migratedPath), 'gallery.json.migrated should exist');
  const all = db.images.listAll(10);
  assert.equal(all.length, baselineImageCount + 2);
  // 都归属 admin
  for (const id of ['legacy-1', 'legacy-2']) {
    assert.equal(db.images.findById(id).user_id, adminUser.id);
  }

  // 第三次 migrate → 幂等（gallery.json 已被改名，不会重复插入）
  db.migrate();
  assert.equal(db.images.listAll(1000).length, baselineImageCount + 2);
});
