// 验证普通用户默认额度与并发槽位控制。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let quota;
let seq = 0;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-quota-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  quota = await import('../services/quota.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function createNormalUser() {
  seq += 1;
  return auth.register({
    username: `quota_user_${seq}`,
    email: `quota_user_${seq}@example.com`,
    password: 'longenough1'
  });
}

test('fallback defaults are daily 10 and concurrent 3', () => {
  const user = createNormalUser();
  const defaults = quota.getDefaults();
  assert.equal(defaults.daily_limit, 10);
  assert.equal(defaults.monthly_limit, null);
  assert.equal(defaults.storage_limit_mb, null);
  assert.equal(defaults.concurrent_limit, 3);

  const effective = quota.effectiveQuota(user.id);
  assert.equal(effective.daily_limit, 10);
  assert.equal(effective.monthly_limit, null);
  assert.equal(effective.storage_limit_mb, null);
  assert.equal(effective.concurrent_limit, 3);
});

test('daily default blocks the eleventh generation call', () => {
  const user = createNormalUser();

  quota.recordSuccess(user.id, { calls: 9, images: 9 });
  assert.equal(quota.assertCanGenerate(user.id, { n: 1 }).ok, true);

  quota.recordSuccess(user.id, { calls: 1, images: 1 });
  const check = quota.assertCanGenerate(user.id, { n: 1 });
  assert.equal(check.ok, false);
  assert.equal(check.code, 'daily_limit_exceeded');
});

test('concurrent default allows 3 active generations per user', () => {
  const user = createNormalUser();

  const first = quota.tryAcquireConcurrentSlot(user.id);
  const second = quota.tryAcquireConcurrentSlot(user.id);
  const third = quota.tryAcquireConcurrentSlot(user.id);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, true);

  const fourth = quota.tryAcquireConcurrentSlot(user.id);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.code, 'concurrent_limit_exceeded');

  second.release();
  const afterRelease = quota.tryAcquireConcurrentSlot(user.id);
  assert.equal(afterRelease.ok, true);

  first.release();
  third.release();
  afterRelease.release();
});
