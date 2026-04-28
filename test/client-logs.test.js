import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let clientLogService;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-client-logs-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  clientLogService = await import('../services/client-logs.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function reqFor(user) {
  return {
    session: { user },
    headers: { 'user-agent': 'node-test-agent' },
    socket: { remoteAddress: '127.0.0.1' }
  };
}

test('client logs are stored, deduplicated, and redacted for admin debugging', () => {
  const user = auth.register({
    username: 'log_user',
    email: 'log_user@example.com',
    password: 'longenough1'
  });

  const first = clientLogService.recordClientLogs(reqFor(user), {
    items: [
      {
        id: 'local-log-1',
        ts: '2026-04-28T00:00:00.000Z',
        level: 'error',
        message: 'client exploded',
        meta: {
          apiKey: 'sk-should-not-persist',
          nested: { password: 'secret', keep: 'stack context' }
        },
        context: { pageUrl: 'http://localhost:8787/#studio' }
      }
    ]
  });
  assert.equal(first.inserted, 1);

  const duplicate = clientLogService.recordClientLogs(reqFor(user), {
    items: [{ id: 'local-log-1', level: 'error', message: 'client exploded again' }]
  });
  assert.equal(duplicate.inserted, 0);
  assert.equal(duplicate.ignored, 1);

  const rows = clientLogService.listClientLogsForUser(user.id, { limit: 10 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].level, 'error');
  assert.equal(rows[0].message, 'client exploded');
  assert.equal(rows[0].meta.apiKey, '[redacted]');
  assert.equal(rows[0].meta.nested.password, '[redacted]');
  assert.equal(rows[0].meta.nested.keep, 'stack context');
  assert.equal(rows[0].pageUrl, 'http://localhost:8787/#studio');
});
