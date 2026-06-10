import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('quota progress components do not inject inline width styles', () => {
  const profile = readFileSync('public/modules/profile.js', 'utf8');
  const users = readFileSync('public/modules/users.js', 'utf8');
  const quota = readFileSync('public/modules/admin-quota.js', 'utf8');
  const source = `${profile}\n${users}\n${quota}`;

  assert.equal(/style=["']width\s*:/.test(source), false);
  assert.match(source, /<progress class="quota-progress/);
  assert.match(source, /<progress class="quota-mini/);
});
