import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let auth;
let db;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-async-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('async password helpers match sync hashes without blocking route code paths', async () => {
  const { hash, salt } = await auth.hashPasswordAsync('longenough1');

  assert.equal(auth.verifyPassword('longenough1', hash, salt), true);
  assert.equal(await auth.verifyPasswordAsync('longenough1', hash, salt), true);
  assert.equal(await auth.verifyPasswordAsync('wrong-password', hash, salt), false);
});

test('async registration and login preserve the public auth contract', async () => {
  const root = await auth.registerAsync({
    username: 'async_root',
    email: 'async-root@example.com',
    password: 'longenough1'
  });
  const user = await auth.registerAsync({
    username: 'async_user',
    email: 'async-user@example.com',
    password: 'longenough1'
  });

  assert.equal(root.role, 'admin');
  assert.equal(user.role, 'user');

  const loggedIn = await auth.loginAsync({
    login: 'async_user',
    password: 'longenough1',
    ua: 'node-test',
    ip: '127.0.0.1'
  });

  assert.equal(loggedIn.user.id, user.id);
  assert.match(loggedIn.sessionId, /^[a-f0-9]{64}$/);
  assert.match(loggedIn.csrfToken, /^[a-f0-9]{64}$/);
  await assert.rejects(
    auth.loginAsync({ login: 'async_user', password: 'wrong-password' }),
    /invalid credentials/
  );
});
