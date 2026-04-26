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

const QUOTA_ENV_KEYS = [
  'DEFAULT_DAILY_LIMIT',
  'DEFAULT_MONTHLY_LIMIT',
  'DEFAULT_STORAGE_LIMIT_MB',
  'DEFAULT_CONCURRENT_LIMIT',
  'GLOBAL_CONCURRENT_GENERATIONS'
];

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

async function withQuotaEnv(patch, fn) {
  const prev = Object.fromEntries(QUOTA_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of QUOTA_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) process.env[key] = String(value);
  }
  try {
    return await fn();
  } finally {
    for (const key of QUOTA_ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test('fallback defaults are daily 10 and concurrent 3', () => {
  return withQuotaEnv({}, () => {
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
});

test('fallback defaults can be tuned by environment', () => {
  return withQuotaEnv({
    DEFAULT_DAILY_LIMIT: '8',
    DEFAULT_MONTHLY_LIMIT: '160',
    DEFAULT_STORAGE_LIMIT_MB: '500',
    DEFAULT_CONCURRENT_LIMIT: '1'
  }, () => {
    const user = createNormalUser();
    const defaults = quota.getDefaults();
    assert.equal(defaults.daily_limit, 8);
    assert.equal(defaults.monthly_limit, 160);
    assert.equal(defaults.storage_limit_mb, 500);
    assert.equal(defaults.concurrent_limit, 1);

    const effective = quota.effectiveQuota(user.id);
    assert.equal(effective.daily_limit, 8);
    assert.equal(effective.monthly_limit, 160);
    assert.equal(effective.storage_limit_mb, 500);
    assert.equal(effective.concurrent_limit, 1);
  });
});

test('daily default blocks the eleventh generation call', () => {
  return withQuotaEnv({}, () => {
    const user = createNormalUser();

    quota.recordSuccess(user.id, { calls: 9, images: 9 });
    assert.equal(quota.assertCanGenerate(user.id, { n: 1 }).ok, true);

    quota.recordSuccess(user.id, { calls: 1, images: 1 });
    const check = quota.assertCanGenerate(user.id, { n: 1 });
    assert.equal(check.ok, false);
    assert.equal(check.code, 'daily_limit_exceeded');
  });
});

test('concurrent default allows 3 active generations per user', () => {
  return withQuotaEnv({}, () => {
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
});

test('global concurrent slot respects environment limit', () => {
  return withQuotaEnv({ GLOBAL_CONCURRENT_GENERATIONS: '2' }, () => {
    const first = quota.tryAcquireGlobalGenerationSlot();
    const second = quota.tryAcquireGlobalGenerationSlot();
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);

    const third = quota.tryAcquireGlobalGenerationSlot();
    assert.equal(third.ok, false);
    assert.equal(third.code, 'global_concurrent_limit_exceeded');

    first.release();
    const afterRelease = quota.tryAcquireGlobalGenerationSlot();
    assert.equal(afterRelease.ok, true);

    second.release();
    afterRelease.release();
  });
});
