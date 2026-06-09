import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { requireCsrf } from '../middleware/guard.js';

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

function req({ method = 'POST', headers = {}, encrypted = false } = {}) {
  return {
    method,
    headers: {
      host: 'studio.example.test',
      'x-requested-with': 'fetch',
      ...headers
    },
    socket: { encrypted }
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
  const res = captureRes();

  assert.equal(requireCsrf(req({
    headers: {
      origin: 'https://studio.example.test',
      'x-forwarded-proto': 'https'
    }
  }), res), true);
  assert.equal(res.statusCode, null);
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
