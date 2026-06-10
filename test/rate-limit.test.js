import { before, beforeEach, after, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let rateLimit;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-rate-limit-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  rateLimit = await import('../services/rate-limit.js');
  db.migrate();
});

beforeEach(() => {
  rateLimit.clear();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('rate limiter keeps existing sliding-window response shape', () => {
  assert.deepEqual(rateLimit.hit('login:ip:1', 1, 1_000, { now: 0 }), {
    allowed: true,
    remaining: 0,
    retryAfterMs: 0
  });
  const denied = rateLimit.hit('login:ip:1', 1, 1_000, { now: 100 });
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.equal(denied.retryAfterMs, 900);
});

test('rate limiter persists hit windows in sqlite', () => {
  rateLimit.hit('login:ip:persisted', 3, 1_000, { now: 0 });

  const row = db.rateLimits.get('login:ip:persisted');
  assert.deepEqual(row.hits, [0]);
  assert.equal(row.windowMs, 1_000);
  assert.equal(row.lastSeen, 0);
  assert.equal(rateLimit.stats().backend, 'sqlite');
});

test('rate limiter deletes expired keys during cleanup', () => {
  rateLimit.hit('old', 10, 100, { now: 0, cleanupIntervalMs: 0, maxKeys: 10 });
  assert.equal(rateLimit.stats().keys, 1);

  rateLimit.hit('new', 10, 100, { now: 100, cleanupIntervalMs: 0, maxKeys: 10 });

  assert.equal(rateLimit.stats().keys, 1);
  assert.equal(rateLimit.stats().hits, 1);
});

test('rate limiter evicts least-recent keys when max key count is reached', () => {
  rateLimit.hit('a', 1, 1_000, { now: 0, maxKeys: 2, cleanupIntervalMs: 1_000_000 });
  rateLimit.hit('b', 1, 1_000, { now: 1, maxKeys: 2, cleanupIntervalMs: 1_000_000 });
  rateLimit.hit('c', 1, 1_000, { now: 2, maxKeys: 2, cleanupIntervalMs: 1_000_000 });

  assert.equal(rateLimit.stats().keys, 2);
  assert.equal(rateLimit.hit('a', 1, 1_000, { now: 3, maxKeys: 2, cleanupIntervalMs: 1_000_000 }).allowed, true);
});
