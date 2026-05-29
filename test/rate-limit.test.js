import { beforeEach, test } from 'node:test';
import { strict as assert } from 'node:assert';

import { clear, hit, stats } from '../services/rate-limit.js';

beforeEach(() => {
  clear();
});

test('rate limiter keeps existing sliding-window response shape', () => {
  assert.deepEqual(hit('login:ip:1', 1, 1_000, { now: 0 }), {
    allowed: true,
    remaining: 0,
    retryAfterMs: 0
  });
  const denied = hit('login:ip:1', 1, 1_000, { now: 100 });
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.equal(denied.retryAfterMs, 900);
});

test('rate limiter deletes expired keys during cleanup', () => {
  hit('old', 10, 100, { now: 0, cleanupIntervalMs: 0, maxKeys: 10 });
  assert.equal(stats().keys, 1);

  hit('new', 10, 100, { now: 100, cleanupIntervalMs: 0, maxKeys: 10 });

  assert.equal(stats().keys, 1);
  assert.equal(stats().hits, 1);
});

test('rate limiter evicts least-recent keys when max key count is reached', () => {
  hit('a', 1, 1_000, { now: 0, maxKeys: 2, cleanupIntervalMs: 1_000_000 });
  hit('b', 1, 1_000, { now: 1, maxKeys: 2, cleanupIntervalMs: 1_000_000 });
  hit('c', 1, 1_000, { now: 2, maxKeys: 2, cleanupIntervalMs: 1_000_000 });

  assert.equal(stats().keys, 2);
  assert.equal(hit('a', 1, 1_000, { now: 3, maxKeys: 2, cleanupIntervalMs: 1_000_000 }).allowed, true);
});
