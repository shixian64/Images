import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertPasswordAllowed } from '../services/password-policy.js';

test('password policy rejects common and identity-derived passwords', () => {
  assert.throws(() => assertPasswordAllowed('password123'), /too common/);
  assert.throws(
    () => assertPasswordAllowed('studioalice2026', { username: 'alice' }),
    /must not contain username or email/
  );
  assert.throws(
    () => assertPasswordAllowed('hello-owner-2026', { email: 'owner@example.com' }),
    /must not contain username or email/
  );
});

test('password policy accepts non-common passwords with sufficient length', () => {
  assert.doesNotThrow(() => assertPasswordAllowed('longenough1', {
    username: 'alice',
    email: 'alice@example.com'
  }));
});

test('password policy rejects unchanged password during password change', () => {
  assert.throws(
    () => assertPasswordAllowed('newpass1234', { oldPassword: 'newpass1234' }),
    /different from old password/
  );
});
