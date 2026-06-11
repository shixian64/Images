import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let audit;
let auditMeta;

function fakeReq() {
  return {
    session: {
      user: {
        id: 'audit-user-1',
        username: 'audit-admin'
      }
    },
    headers: {
      'user-agent': 'audit-meta-test'
    },
    socket: {
      remoteAddress: '127.0.0.1'
    }
  };
}

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-audit-meta-'));
  mkdirSync(join(workDir, 'generated'), { recursive: true });
  process.chdir(workDir);

  db = await import('../services/db.js');
  audit = await import('../services/audit.js');
  auditMeta = await import('../services/audit-meta.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('audit metadata preserves ordinary structured values', () => {
  const meta = {
    changed: ['enabled', 'limit'],
    before: { enabled: false, limit: 10 },
    after: { enabled: true, limit: 20 },
    ok: true
  };

  audit.record(fakeReq(), 'quota.update', { type: 'quota', id: 'ordinary-meta' }, meta);

  const [item] = audit.listForTarget('quota', 'ordinary-meta', 1);
  assert.equal(item.actorName, 'audit-admin');
  assert.equal(item.ip, '127.0.0.1');
  assert.deepEqual(item.meta, meta);
});

test('audit metadata is redacted and capped before persistence', () => {
  const circular = { name: 'loop' };
  circular.self = circular;
  const rawSecret = 'sk-auditmetatestsecret1234567890';
  const rawBearer = 'Bearer auditmetabearersecret123456';

  audit.record(fakeReq(), 'quota.large_meta', { type: 'quota', id: 'large-meta' }, {
    payload: 'x'.repeat(60_000),
    apiKey: rawSecret,
    note: `Authorization: ${rawBearer}`,
    circular,
    items: Array.from({ length: 120 }, (_, i) => ({ i, text: 'y'.repeat(500) }))
  });

  const [item] = audit.listForTarget('quota', 'large-meta', 1);
  const itemJson = JSON.stringify(item.meta);
  assert.equal(item.meta.truncated, true);
  assert.ok(item.meta.originalJsonChars > auditMeta.AUDIT_META_MAX_JSON_CHARS);
  assert.ok(itemJson.length <= auditMeta.AUDIT_META_MAX_JSON_CHARS);
  assert.doesNotMatch(itemJson, new RegExp(rawSecret));
  assert.doesNotMatch(itemJson, new RegExp(rawBearer));

  const sqlite = new DatabaseSync(db.dbPaths.file, { readOnly: true });
  try {
    const row = sqlite.prepare(`
      SELECT meta, length(meta) AS meta_chars
      FROM audit_logs
      WHERE target_type = ? AND target_id = ?
    `).get('quota', 'large-meta');
    assert.ok(row.meta_chars <= auditMeta.AUDIT_META_MAX_JSON_CHARS);
    assert.deepEqual(JSON.parse(row.meta), item.meta);
  } finally {
    sqlite.close();
  }
});
