import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchesRoutePrefix } from '../utils/route-match.js';

test('matchesRoutePrefix accepts exact paths and nested route paths', () => {
  assert.equal(matchesRoutePrefix('/api/users', '/api/users'), true);
  assert.equal(matchesRoutePrefix('/api/users/', '/api/users'), true);
  assert.equal(matchesRoutePrefix('/api/users/123', '/api/users'), true);
});

test('matchesRoutePrefix rejects similarly named sibling paths', () => {
  assert.equal(matchesRoutePrefix('/api/usersXYZ', '/api/users'), false);
  assert.equal(matchesRoutePrefix('/api/users-old', '/api/users'), false);
  assert.equal(matchesRoutePrefix('/api/user', '/api/users'), false);
});

test('matchesRoutePrefix normalizes trailing slash in configured prefix', () => {
  assert.equal(matchesRoutePrefix('/api/admin/jobs/stream', '/api/admin/jobs/'), true);
  assert.equal(matchesRoutePrefix('/api/admin/jobsXYZ', '/api/admin/jobs/'), false);
});
