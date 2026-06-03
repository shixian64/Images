import test from 'node:test';
import assert from 'node:assert/strict';

import { apiFetch, getLastRequestTraceId, setCurrentUser } from '../public/modules/auth.js';
import { KEYS, userKey } from '../public/modules/state.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

test.beforeEach(() => {
  installLocalStorage();
  setCurrentUser({ id: 'log-user' });
});

test.afterEach(() => {
  setCurrentUser(null);
  delete globalThis.localStorage;
  delete globalThis.fetch;
  delete globalThis.location;
  delete globalThis.navigator;
  delete globalThis.window;
});

test('apiFetch caches the latest response trace id', async () => {
  globalThis.fetch = async () => new Response('{}', {
    status: 200,
    headers: { 'x-request-id': 'trace-api' }
  });

  const resp = await apiFetch('/api/ping');

  assert.equal(resp.ok, true);
  assert.equal(getLastRequestTraceId(), 'trace-api');
});

test('frontend logs redact embedded secrets before localStorage persistence', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  const { addLog } = await import(`../public/modules/logs.js?case=${Date.now()}`);
  const leakedBearer = 'sk-local-secret-123456';
  const leakedMeta = 'sk-meta-secret-123456';
  const leakedUrl = 'sk-url-secret-123456';

  const entry = addLog('error', `upstream echoed Authorization: Bearer ${leakedBearer}`, {
    detail: `nested authorization: Bearer ${leakedMeta}`,
    error: `callback api_key=${leakedUrl}`,
    apiKey: leakedBearer
  });

  const storedLogs = localStorage.getItem(userKey(KEYS.logs));
  const storedQueue = localStorage.getItem(userKey(KEYS.clientLogSyncQueue));
  for (const raw of [JSON.stringify(entry), storedLogs, storedQueue]) {
    assert.equal(raw.includes(leakedBearer), false);
    assert.equal(raw.includes(leakedMeta), false);
    assert.equal(raw.includes(leakedUrl), false);
  }
  assert.match(entry.message, /Bearer sk-l\*\*\*\*3456/);
  assert.match(entry.meta.detail, /Bearer sk-m\*\*\*\*3456/);
  assert.match(entry.meta.error, /api_key=sk-u\*\*\*\*3456/);
});

test('frontend log sync context redacts URL and user-agent secrets', async () => {
  const { sanitizeMeta } = await import(`../public/modules/logs.js?case=context-${Date.now()}`);
  const leakedUrl = 'sk-url-secret-123456';
  const leakedAgent = 'sk-agent-secret-123456';

  const context = sanitizeMeta({
    pageUrl: `http://localhost:8787/#studio?api_key=${leakedUrl}`,
    userAgent: `agent Authorization: Bearer ${leakedAgent}`
  });

  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes(leakedUrl), false);
  assert.equal(serialized.includes(leakedAgent), false);
  assert.match(context.pageUrl, /api_key=sk-u\*\*\*\*3456/);
  assert.match(context.userAgent, /Bearer sk-a\*\*\*\*3456/);
});

test('frontend logs treat prototype-looking metadata keys as data', async () => {
  const { sanitizeMeta } = await import(`../public/modules/logs.js?case=proto-${Date.now()}`);
  const meta = JSON.parse('{"__proto__":{"polluted":true},"constructor":"plain"}');

  const sanitized = sanitizeMeta(meta);

  assert.equal(Object.getPrototypeOf(sanitized), null);
  assert.equal(Object.hasOwn(sanitized, '__proto__'), true);
  assert.equal(sanitized.__proto__.polluted, true);
  assert.equal(sanitized.constructor, 'plain');
  assert.equal({}.polluted, undefined);
});

test('frontend log sync includes the latest request trace id', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  globalThis.location = { href: 'http://localhost:8787/#logs' };
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-US' };
  globalThis.window = { innerWidth: 1200, innerHeight: 800 };
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  let capturedBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (url === '/api/ping') {
      return new Response('{}', { status: 200, headers: { 'x-request-id': 'trace-before-sync' } });
    }
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await apiFetch('/api/ping');
  const { addLog, syncClientLogs } = await import(`../public/modules/logs.js?case=trace-${Date.now()}`);
  addLog('error', 'client failed');
  await syncClientLogs();

  assert.equal(capturedBody.items.length, 1);
  assert.equal(capturedBody.items[0].traceId, 'trace-before-sync');
  assert.equal(capturedBody.items[0].context.traceId, 'trace-before-sync');
});

test('frontend log sync preserves the trace id from log creation time', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  globalThis.location = { href: 'http://localhost:8787/#logs' };
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-US' };
  globalThis.window = { innerWidth: 1200, innerHeight: 800 };
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  let capturedBody = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (url === '/api/first') {
      return new Response('{}', { status: 200, headers: { 'x-request-id': 'trace-first' } });
    }
    if (url === '/api/second') {
      return new Response('{}', { status: 200, headers: { 'x-request-id': 'trace-second' } });
    }
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await apiFetch('/api/first');
  const { addLog, syncClientLogs } = await import(`../public/modules/logs.js?case=fixed-trace-${Date.now()}`);
  addLog('error', 'client failed after first request');
  await apiFetch('/api/second');
  await syncClientLogs();

  assert.equal(capturedBody.items[0].traceId, 'trace-first');
  assert.equal(capturedBody.items[0].context.traceId, 'trace-first');
});
