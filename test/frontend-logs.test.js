import test from 'node:test';
import assert from 'node:assert/strict';

import { setCurrentUser } from '../public/modules/auth.js';
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
