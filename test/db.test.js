// 验证 db.migrate 幂等 + legacy gallery.json 迁移逻辑。
// 每个测试文件在独立进程（--test-isolation=process），允许 chdir 到 tmp 目录。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let auth;
let prevBootstrapToken;

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
