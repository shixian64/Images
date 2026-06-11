import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let workDir;
let prevCwd;
let db;
let auth;
let clientLogService;
let clientLogRoute;
let rateLimit;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-client-logs-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  clientLogService = await import('../services/client-logs.js');
  clientLogRoute = await import('../routes/client-logs.js');
  rateLimit = await import('../services/rate-limit.js');
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

function routeReqFor(user, body, { ip = '127.0.0.1' } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  req.method = 'POST';
  req.session = { user };
  req.headers = { 'user-agent': 'node-test-agent' };
  req.socket = { remoteAddress: ip };
  return req;
}

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [key, value] of Object.entries(headers || {})) {
        this.headers[String(key).toLowerCase()] = String(value);
      }
    },
    end(chunk = '') {
      if (chunk) this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
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

test('client logs redact secrets embedded in ordinary strings', () => {
  const user = auth.register({
    username: 'log_secret_user',
    email: 'log_secret_user@example.com',
    password: 'longenough1'
  });

  const leakedBearer = 'sk-client-log-secret-123456';
  const leakedMeta = 'sk-meta-secret-123456';
  const leakedUrl = 'sk-url-secret-123456';
  const result = clientLogService.recordClientLogs(reqFor(user), {
    items: [
      {
        id: 'local-log-secret',
        level: 'error',
        message: `upstream echoed Authorization: Bearer ${leakedBearer}`,
        meta: {
          detail: `nested authorization: Bearer ${leakedMeta}`,
          url: `https://example.com/callback?api_key=${leakedUrl}`
        },
        context: {
          pageUrl: `http://localhost:8787/#studio?api_key=${leakedUrl}`,
          userAgent: `agent token ${leakedBearer}`
        }
      }
    ]
  });
  assert.equal(result.inserted, 1);

  const [row] = clientLogService.listClientLogsForUser(user.id, { limit: 10 });
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes(leakedBearer), false);
  assert.equal(serialized.includes(leakedMeta), false);
  assert.equal(serialized.includes(leakedUrl), false);
  assert.match(row.message, /Bearer sk-c\*\*\*\*3456/);
  assert.match(row.meta.detail, /Bearer sk-m\*\*\*\*3456/);
  assert.match(row.pageUrl, /api_key=sk-u\*\*\*\*3456/);
});

test('client logs preserve request trace id in sanitized metadata', () => {
  const user = auth.register({
    username: 'log_trace_user',
    email: 'log_trace_user@example.com',
    password: 'longenough1'
  });

  const result = clientLogService.recordClientLogs(reqFor(user), {
    items: [
      {
        id: 'local-log-trace',
        level: 'error',
        message: 'client failed after api request',
        meta: { component: 'studio' },
        traceId: 'trace-client-123'
      }
    ]
  });
  assert.equal(result.inserted, 1);

  const [row] = clientLogService.listClientLogsForUser(user.id, { limit: 1 });
  assert.equal(row.meta.component, 'studio');
  assert.equal(row.meta.traceId, 'trace-client-123');
});

test('client logs treat prototype-looking metadata keys as data', () => {
  const user = auth.register({
    username: 'log_proto_user',
    email: 'log_proto_user@example.com',
    password: 'longenough1'
  });

  const meta = JSON.parse('{"__proto__":{"polluted":true},"constructor":"plain"}');
  const result = clientLogService.recordClientLogs(reqFor(user), {
    items: [
      {
        id: 'local-log-proto',
        level: 'info',
        message: 'prototype keys',
        meta
      }
    ]
  });
  assert.equal(result.inserted, 1);

  const [row] = clientLogService.listClientLogsForUser(user.id, { limit: 1 });
  assert.equal(Object.hasOwn(row.meta, '__proto__'), true);
  assert.deepEqual(row.meta.__proto__, { polluted: true });
  assert.equal(row.meta.constructor, 'plain');
  assert.equal({}.polluted, undefined);
});

test('client log list responses cap oversized metadata previews', () => {
  const user = auth.register({
    username: 'log_large_meta_user',
    email: 'log_large_meta_user@example.com',
    password: 'longenough1'
  });

  const largeMeta = {
    marker: 'client-log-list-budget-start',
    blob: 'x'.repeat(clientLogService.CLIENT_LOG_LIST_META_MAX_JSON_CHARS + 1200),
    tail: 'client-log-list-budget-end'
  };
  const result = clientLogService.recordClientLogs(reqFor(user), {
    items: [{
      id: 'local-log-large-meta',
      level: 'warn',
      message: 'large metadata for list budget',
      meta: largeMeta
    }]
  });
  assert.equal(result.inserted, 1);

  const [row] = clientLogService.listClientLogsForAdmin({
    userId: user.id,
    search: 'large metadata for list budget',
    limit: 5
  });
  assert.equal(row.metaTruncated, true);
  assert.ok(row.metaLength > clientLogService.CLIENT_LOG_LIST_META_MAX_JSON_CHARS);
  assert.equal(row.meta.originalJsonChars, row.metaLength);
  assert.ok(JSON.stringify(row.meta).length <= clientLogService.CLIENT_LOG_LIST_META_MAX_JSON_CHARS);
  assert.match(row.meta.preview, /client-log-list-budget-start/);
  assert.doesNotMatch(row.meta.preview, /client-log-list-budget-end/);
});

test('client log route rate limits ingestion before accepting another batch', async (t) => {
  const prevMax = process.env.CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE;
  const prevWindow = process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS;
  process.env.CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE = '1';
  process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS = '60000';
  rateLimit.clear();
  t.after(() => {
    if (prevMax === undefined) delete process.env.CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE;
    else process.env.CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE = prevMax;
    if (prevWindow === undefined) delete process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS;
    else process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS = prevWindow;
    rateLimit.clear();
  });

  const user = auth.register({
    username: 'log_rate_user',
    email: 'log_rate_user@example.com',
    password: 'longenough1'
  });

  const firstRes = mockRes();
  await clientLogRoute.handleClientLogsRoute(
    routeReqFor(user, {
      items: [{ id: 'rate-log-1', level: 'info', message: 'first batch' }]
    }, { ip: '192.0.2.64' }),
    firstRes,
    '/api/client-logs',
    new URL('http://localhost/api/client-logs')
  );
  assert.equal(firstRes.statusCode, 200);

  const secondRes = mockRes();
  await clientLogRoute.handleClientLogsRoute(
    routeReqFor(user, {
      items: [{ id: 'rate-log-2', level: 'info', message: 'second batch' }]
    }, { ip: '192.0.2.64' }),
    secondRes,
    '/api/client-logs',
    new URL('http://localhost/api/client-logs')
  );
  assert.equal(secondRes.statusCode, 429);
  assert.equal(secondRes.headers['retry-after'], '60');
  assert.equal(JSON.parse(secondRes.body).code, 'client_log_rate_limited');

  const rows = clientLogService.listClientLogsForUser(user.id, { limit: 10 });
  assert.equal(rows.some((row) => row.clientId === 'rate-log-2'), false);
});
