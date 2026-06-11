import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeApiPathname } from '../utils/api-version.js';

test('normalizeApiPathname maps /api/v1 aliases to current /api routes', () => {
  assert.equal(normalizeApiPathname('/api/v1'), '/api');
  assert.equal(normalizeApiPathname('/api/v1/auth/me'), '/api/auth/me');
  assert.equal(
    normalizeApiPathname('/api/v1/prompt-square/item%2F1/use'),
    '/api/prompt-square/item%2F1/use'
  );
});

test('normalizeApiPathname leaves non-versioned paths unchanged', () => {
  assert.equal(normalizeApiPathname('/api/auth/me'), '/api/auth/me');
  assert.equal(normalizeApiPathname('/api/v10/auth/me'), '/api/v10/auth/me');
  assert.equal(normalizeApiPathname('/healthz'), '/healthz');
});
