import test from 'node:test';
import assert from 'node:assert/strict';

import { apiFetch, getCsrfToken, getMe, setCsrfToken, setCurrentUser } from '../public/modules/auth.js';

test.afterEach(() => {
  setCurrentUser(null);
  setCsrfToken('');
  delete globalThis.fetch;
});

test('getMe stores csrf token and apiFetch sends it on unsafe methods', async () => {
  const requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url, opts });
    if (url === '/api/auth/me') {
      return new Response(JSON.stringify({
        user: { id: 'u1', username: 'alice' },
        csrfToken: 'csrf-token-from-session'
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const me = await getMe();
  assert.equal(me.username, 'alice');
  assert.equal(getCsrfToken(), 'csrf-token-from-session');

  await apiFetch('/api/profile', {
    method: 'PATCH',
    body: { username: 'alice' }
  });

  const unsafeHeaders = requests[1].opts.headers;
  assert.equal(unsafeHeaders.get('X-Requested-With'), 'fetch');
  assert.equal(unsafeHeaders.get('X-CSRF-Token'), 'csrf-token-from-session');
});

test('apiFetch does not send csrf token on safe GET requests', async () => {
  setCsrfToken('csrf-token-from-session');
  let capturedHeaders = null;
  globalThis.fetch = async (_url, opts = {}) => {
    capturedHeaders = opts.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await apiFetch('/api/profile');

  assert.equal(capturedHeaders.has('X-CSRF-Token'), false);
  assert.equal(capturedHeaders.has('X-Requested-With'), false);
});
