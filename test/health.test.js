import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let health;
let db;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-health-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  health = await import('../services/health.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('runtime health reports database, disk, and queue status', async () => {
  const snapshot = await health.runtimeHealthSnapshot({ uptimeSec: 12 });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.uptimeSec, 12);
  assert.equal(snapshot.db.ok, true);
  assert.match(snapshot.db.path, /app\.db$/);
  assert.equal(snapshot.db.runtime.driver, 'node:sqlite DatabaseSync');
  assert.equal(snapshot.db.runtime.blocking, true);
  assert.equal(snapshot.db.runtime.workerOffloaded, false);
  assert.equal(Number.isInteger(snapshot.db.runtime.busyTimeoutMs), true);
  assert.equal(Number.isInteger(snapshot.db.runtime.walAutocheckpointPages), true);
  assert.equal(snapshot.disk.ok, true);
  assert.equal(snapshot.disk.writable, true);
  assert.equal(snapshot.queue.ok, true);
  assert.equal(snapshot.queue.runtime.backend, 'sqlite-single-process');
  assert.equal(snapshot.eventLoop.ok, true);
  assert.equal(typeof snapshot.eventLoop.lagMs, 'number');
});

test('runtime health becomes unhealthy when a required dependency fails', async () => {
  const snapshot = await health.runtimeHealthSnapshot({
    uptimeSec: 1,
    dbCheck: () => ({ ok: false, error: 'db unavailable' }),
    diskCheck: async () => ({ ok: true }),
    queueCheck: () => ({ ok: true }),
    eventLoopCheck: async () => ({ ok: true })
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.db.error, 'db unavailable');
  assert.equal(snapshot.db.runtime.driver, 'node:sqlite DatabaseSync');
});

test('runtime health reports event-loop lag as unhealthy', async () => {
  const snapshot = await health.runtimeHealthSnapshot({
    uptimeSec: 1,
    dbCheck: () => ({ ok: true }),
    diskCheck: async () => ({ ok: true }),
    queueCheck: () => ({ ok: true }),
    eventLoopCheck: async () => ({ ok: false, lagMs: 999, thresholdMs: 250 })
  });

  assert.equal(snapshot.ok, false);
  assert.deepEqual(snapshot.eventLoop, { ok: false, lagMs: 999, thresholdMs: 250 });
});
