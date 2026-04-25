// 验证 db.migrate 幂等 + legacy gallery.json 迁移逻辑。
// 每个测试文件在独立进程（--test-isolation=process），允许 chdir 到 tmp 目录。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-db-'));
  mkdirSync(join(workDir, 'generated'), { recursive: true });
  process.chdir(workDir);

  // 在 chdir 之后再 import，确保 db 单例绑定到 tmp 目录
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
});

after(() => {
  process.chdir(prevCwd);
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

test('legacy gallery.json migration: deferred until admin exists, then idempotent', () => {
  const galleryPath = join(workDir, 'generated', 'gallery.json');
  const migratedPath = join(workDir, 'generated', 'gallery.json.migrated');

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
  assert.equal(db.images.listAll(10).length, 0);

  // 注册首位用户 → 自动 admin
  const adminUser = auth.register({ username: 'admin1', email: 'a@b.com', password: 'longenough1' });
  assert.equal(adminUser.role, 'admin');

  // 再次 migrate → 触发 legacy 搬迁
  db.migrate();
  assert.equal(existsSync(galleryPath), false, 'gallery.json should be renamed');
  assert.ok(existsSync(migratedPath), 'gallery.json.migrated should exist');
  const all = db.images.listAll(10);
  assert.equal(all.length, 2);
  // 都归属 admin
  for (const row of all) assert.equal(row.user_id, adminUser.id);

  // 第三次 migrate → 幂等（gallery.json 已被改名，不会重复插入）
  db.migrate();
  assert.equal(db.images.listAll(10).length, 2);
});
