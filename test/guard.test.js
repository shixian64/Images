import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { requireCsrf, requireFreshPassword } from '../middleware/guard.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function captureRes() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

function req({ method = 'POST', headers = {}, encrypted = false, remoteAddress = '203.0.113.10' } = {}) {
  return {
    method,
    headers: {
      host: 'studio.example.test',
      'x-requested-with': 'fetch',
      ...headers
    },
    socket: { encrypted, remoteAddress }
  };
}

function authedReq({ csrfToken = 'csrf-session-token', headers = {}, ...rest } = {}) {
  return {
    ...req({
      ...rest,
      headers: {
        origin: 'http://studio.example.test',
        ...headers
      }
    }),
    session: {
      user: { id: 'u1' },
      csrfToken
    }
  };
}

test('requireCsrf allows safe methods without fetch headers', () => {
  const res = captureRes();

  assert.equal(requireCsrf(req({ method: 'GET', headers: {} }), res), true);
  assert.equal(res.statusCode, null);
});

test('requireCsrf allows same scheme and host origins', () => {
  const res = captureRes();

  assert.equal(requireCsrf(req({ headers: { origin: 'http://studio.example.test' } }), res), true);
  assert.equal(res.statusCode, null);
});

test('requireCsrf rejects same host with a different scheme', () => {
  const res = captureRes();

  assert.equal(requireCsrf(req({ headers: { origin: 'https://studio.example.test' } }), res), false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { error: 'csrf' });
});

test('requireCsrf trusts forwarded HTTPS scheme only when TRUST_PROXY is enabled', () => {
  process.env.TRUST_PROXY = '1';
  process.env.TRUST_PROXY_ALLOWED_IPS = '203.0.113.10';
  const res = captureRes();

  assert.equal(requireCsrf(req({
    headers: {
      origin: 'https://studio.example.test',
      'x-forwarded-proto': 'https'
    }
  }), res), true);
  assert.equal(res.statusCode, null);
});

test('requireCsrf ignores forwarded scheme from non-allowlisted proxies', () => {
  process.env.TRUST_PROXY = '1';
  process.env.TRUST_PROXY_ALLOWED_IPS = '127.0.0.1';
  const res = captureRes();

  assert.equal(requireCsrf(req({
    headers: {
      origin: 'https://studio.example.test',
      'x-forwarded-proto': 'https'
    }
  }), res), false);
  assert.equal(res.statusCode, 403);
});

test('requireCsrf falls back to Referer origin with scheme comparison', () => {
  const res = captureRes();

  assert.equal(requireCsrf(req({
    headers: {
      referer: 'http://studio.example.test/app?page=1'
    }
  }), res), true);
  assert.equal(res.statusCode, null);
});

test('requireCsrf requires matching per-session token for authenticated unsafe requests', () => {
  const missing = captureRes();
  assert.equal(requireCsrf(authedReq(), missing, '/api/profile'), false);
  assert.equal(missing.statusCode, 403);
  assert.deepEqual(JSON.parse(missing.body), { error: 'csrf', code: 'csrf_token_invalid' });

  const wrong = captureRes();
  assert.equal(requireCsrf(authedReq({
    headers: { 'x-csrf-token': 'wrong-token' }
  }), wrong, '/api/profile'), false);
  assert.equal(wrong.statusCode, 403);

  const ok = captureRes();
  assert.equal(requireCsrf(authedReq({
    headers: { 'x-csrf-token': 'csrf-session-token' }
  }), ok, '/api/profile'), true);
  assert.equal(ok.statusCode, null);
});

test('requireFreshPassword blocks business APIs while reset is required', () => {
  const res = captureRes();
  const request = {
    method: 'POST',
    session: { user: { id: 'u1', passwordResetRequired: true } }
  };

  assert.equal(requireFreshPassword(request, res, '/api/generate'), false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), {
    error: 'password reset required',
    code: 'password_reset_required'
  });
});

test('requireFreshPassword allows profile password change during reset flow', () => {
  const res = captureRes();
  const request = {
    method: 'POST',
    session: { user: { id: 'u1', password_reset_required: true } }
  };

  assert.equal(requireFreshPassword(request, res, '/api/profile/password'), true);
  assert.equal(res.statusCode, null);
});
