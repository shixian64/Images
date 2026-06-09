import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { clearSessionCookie, setSessionCookie } from '../utils/cookies.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SESSION_COOKIE_SECURE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function captureRes() {
  return {
    headers: {},
    getHeader(key) {
      return this.headers[String(key).toLowerCase()];
    },
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    }
  };
}

function setCookieText(res) {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

test('session cookies are not Secure by default in development', () => {
  process.env.NODE_ENV = 'development';
  const res = captureRes();

  setSessionCookie(res, 'sid-value');

  assert.doesNotMatch(setCookieText(res), /;\s*Secure\b/);
});

test('session cookies are Secure in production', () => {
  process.env.NODE_ENV = 'production';
  const res = captureRes();

  setSessionCookie(res, 'sid-value');

  assert.match(setCookieText(res), /;\s*Secure\b/);
});

test('SESSION_COOKIE_SECURE forces Secure cookies outside production', () => {
  process.env.NODE_ENV = 'development';
  process.env.SESSION_COOKIE_SECURE = '1';
  const res = captureRes();

  setSessionCookie(res, 'sid-value');
  clearSessionCookie(res);

  const cookies = res.headers['set-cookie'];
  assert.equal(Array.isArray(cookies), true);
  assert.match(cookies[0], /;\s*Secure\b/);
  assert.match(cookies[1], /;\s*Secure\b/);
});
