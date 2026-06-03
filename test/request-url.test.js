import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRequestUrl } from '../utils/request-url.js';

function req(url, host = 'localhost:8787') {
  return { url, headers: { host } };
}

test('parseRequestUrl accepts ordinary request paths', () => {
  const url = parseRequestUrl(req('/api/gallery?scope=public'));
  assert.equal(url.pathname, '/api/gallery');
  assert.equal(url.searchParams.get('scope'), 'public');
});

test('parseRequestUrl rejects malformed percent-encoded paths', () => {
  assert.equal(parseRequestUrl(req('/api/users/%E0%A4%A')), null);
});

test('parseRequestUrl rejects invalid host bases', () => {
  assert.equal(parseRequestUrl(req('/healthz', 'bad host')), null);
});
