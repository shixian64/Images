import { test } from 'node:test';
import assert from 'node:assert/strict';

import { userIdFromUserPath, userImageDir, userImageRel } from '../services/path-guard.js';

test('user image path helpers reject dot-segment user ids', () => {
  for (const userId of ['.', '..']) {
    assert.throws(() => userImageDir(userId), /invalid userId/);
    assert.throws(() => userImageRel(userId), /invalid userId/);
  }
});

test('user image path helpers accept ordinary generated user ids', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  assert.match(userImageDir(userId), /123e4567-e89b-12d3-a456-426614174000[\\/]images$/);
  assert.equal(userImageRel(userId), `users/${userId}/images`);
  assert.equal(userIdFromUserPath(`users/${userId}/images/2026-01-01/a.png`), userId);
  assert.equal(userIdFromUserPath('users/../images/2026-01-01/a.png'), null);
});
