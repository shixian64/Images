import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let auth;
let maintenance;

const CLEANUP_ENV_KEYS = [
  'AUDIT_LOG_RETENTION_DAYS',
  'CLIENT_LOG_RETENTION_DAYS',
  'USAGE_DAILY_RETENTION_DAYS',
  'DATA_CLEANUP_INTERVAL_MS'
];

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-maintenance-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  maintenance = await import('../services/maintenance.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

async function withCleanupEnv(patch, fn) {
  const prev = Object.fromEntries(CLEANUP_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CLEANUP_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) process.env[key] = String(value);
  }
  try {
    return await fn();
  } finally {
    for (const key of CLEANUP_ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function seedRows(userId, suffix = '') {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`expired-session${suffix}`, userId, '2026-05-01T00:00:00.000Z', '2026-05-20T00:00:00.000Z', null, null);
    sqlite.prepare(`
      INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`fresh-session${suffix}`, userId, '2026-05-29T00:00:00.000Z', '2026-06-01T00:00:00.000Z', null, null);

    sqlite.prepare(`
      INSERT INTO audit_logs (id, created_at, actor_id, actor_name, action, target_type, target_id, ip, user_agent, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`old-audit${suffix}`, '2026-05-01T00:00:00.000Z', userId, 'user', 'old', 'test', 'old', null, null, null);
    sqlite.prepare(`
      INSERT INTO audit_logs (id, created_at, actor_id, actor_name, action, target_type, target_id, ip, user_agent, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`fresh-audit${suffix}`, '2026-05-29T00:00:00.000Z', userId, 'user', 'fresh', 'test', 'fresh', null, null, null);

    sqlite.prepare(`
      INSERT INTO client_logs (id, user_id, client_id, client_ts, received_at, level, message, meta, page_url, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`old-client-log${suffix}`, userId, `old-client${suffix}`, null, '2026-05-01T00:00:00.000Z', 'error', 'old', null, null, null, null);
    sqlite.prepare(`
      INSERT INTO client_logs (id, user_id, client_id, client_ts, received_at, level, message, meta, page_url, user_agent, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`fresh-client-log${suffix}`, userId, `fresh-client${suffix}`, null, '2026-05-29T00:00:00.000Z', 'info', 'fresh', null, null, null, null);

    sqlite.prepare(`
      INSERT INTO usage_daily (user_id, day, call_count, image_count, bytes, fail_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, '2026-05-01', 1, 1, 10, 0);
    sqlite.prepare(`
      INSERT INTO usage_daily (user_id, day, call_count, image_count, bytes, fail_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, '2026-05-29', 1, 1, 10, 0);
  } finally {
    sqlite.close();
  }
}

function idsFrom(table, userId = '') {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    if (table === 'sessions') {
      return sqlite.prepare('SELECT id FROM sessions WHERE user_id = ? ORDER BY id').all(userId).map((row) => row.id);
    }
    if (table === 'audit_logs') {
      return sqlite.prepare('SELECT id FROM audit_logs WHERE actor_id = ? ORDER BY id').all(userId).map((row) => row.id);
    }
    if (table === 'client_logs') {
      return sqlite.prepare('SELECT id FROM client_logs WHERE user_id = ? ORDER BY id').all(userId).map((row) => row.id);
    }
    return sqlite.prepare('SELECT day FROM usage_daily WHERE user_id = ? ORDER BY day').all(userId).map((row) => row.day);
  } finally {
    sqlite.close();
  }
}

test('runtime cleanup deletes expired/old rows and keeps fresh rows', () => {
  return withCleanupEnv({
    AUDIT_LOG_RETENTION_DAYS: '7',
    CLIENT_LOG_RETENTION_DAYS: '7',
    USAGE_DAILY_RETENTION_DAYS: '7'
  }, () => {
    const user = auth.register({
      username: 'maintenance_user',
      email: 'maintenance_user@example.com',
      password: 'longenough1'
    });
    seedRows(user.id, '-a');

    const result = maintenance.cleanupRuntimeData({
      now: new Date('2026-05-29T12:00:00.000Z'),
      logger: null
    });

    assert.deepEqual(result, {
      sessions: 1,
      auditLogs: 1,
      clientLogs: 1,
      usageDaily: 1
    });
    assert.deepEqual(idsFrom('sessions', user.id), ['fresh-session-a']);
    assert.deepEqual(idsFrom('audit_logs', user.id), ['fresh-audit-a']);
    assert.deepEqual(idsFrom('client_logs', user.id), ['fresh-client-log-a']);
    assert.deepEqual(idsFrom('usage_daily', user.id), ['2026-05-29']);
  });
});

test('runtime retention can be disabled while session expiry still runs', () => {
  return withCleanupEnv({
    AUDIT_LOG_RETENTION_DAYS: '0',
    CLIENT_LOG_RETENTION_DAYS: '0',
    USAGE_DAILY_RETENTION_DAYS: '0'
  }, () => {
    const user = auth.register({
      username: 'maintenance_disabled_user',
      email: 'maintenance_disabled_user@example.com',
      password: 'longenough1'
    });
    seedRows(user.id, '-b');

    const result = maintenance.cleanupRuntimeData({
      now: new Date('2026-05-29T12:00:00.000Z'),
      logger: null
    });

    assert.equal(result.sessions, 1);
    assert.equal(result.auditLogs, 0);
    assert.equal(result.clientLogs, 0);
    assert.equal(result.usageDaily, 0);
    assert.deepEqual(idsFrom('sessions', user.id), ['fresh-session-b']);
    assert.deepEqual(idsFrom('audit_logs', user.id).sort(), ['fresh-audit-b', 'old-audit-b']);
    assert.deepEqual(idsFrom('client_logs', user.id).sort(), ['fresh-client-log-b', 'old-client-log-b']);
    assert.deepEqual(idsFrom('usage_daily', user.id).sort(), ['2026-05-01', '2026-05-29']);
  });
});

test('data cleanup interval can be disabled', () => {
  return withCleanupEnv({ DATA_CLEANUP_INTERVAL_MS: '0' }, () => {
    assert.equal(maintenance.dataCleanupIntervalMs(), 0);
    const timer = maintenance.startDataMaintenance({
      logger: null,
      runImmediately: false,
      intervalMs: maintenance.dataCleanupIntervalMs()
    });
    assert.equal(timer, null);
  });
});
