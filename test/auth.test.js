// 验证 register / login / getSessionUser / destroySession + 用户管理边界条件。
// 每个测试文件在独立进程，绑定独立 tmp 目录。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let auth;
let users;
let db;
let prevBootstrapToken;

before(async () => {
  prevCwd = process.cwd();
  prevBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  users = await import('../services/users.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  if (prevBootstrapToken === undefined) delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  else process.env.ADMIN_BOOTSTRAP_TOKEN = prevBootstrapToken;
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('first registration is not admin unless bootstrap token matches', () => {
  const u1 = auth.register({ username: 'alice', email: 'alice@x.com', password: 'longenough1' });
  assert.equal(u1.role, 'user');
  assert.equal(u1.status, 'active');
  // password fields must not be returned
  assert.equal(u1.password_hash, undefined);
  assert.equal(u1.password_salt, undefined);

  assert.throws(
    () => auth.register({ username: 'mallory', email: 'mallory@x.com', password: 'longenough1', adminBootstrapToken: 'wrong' }),
    /invalid admin bootstrap token/
  );

  const root = auth.register({
    username: 'root',
    email: 'root@x.com',
    password: 'longenough1',
    adminBootstrapToken: 'bootstrap-secret'
  });
  assert.equal(root.role, 'admin');

  const u2 = auth.register({ username: 'bob', email: 'bob@x.com', password: 'longenough1' });
  assert.equal(u2.role, 'user');
});

test('register validates username/email/password', () => {
  assert.throws(() => auth.register({ username: 'a', email: 'x@y.com', password: 'longenough1' }), /invalid username/);
  assert.throws(() => auth.register({ username: 'okok', email: 'no-at-sign', password: 'longenough1' }), /invalid email/);
  assert.throws(() => auth.register({ username: 'okok', email: 'ok@x.com', password: 'short' }), /at least 8/);
  assert.throws(() => auth.register({ username: 'alice', email: 'aa@x.com', password: 'longenough1' }), /username already taken/);
});

test('login + getSessionUser + destroySession round-trip', () => {
  const { user, sessionId } = auth.login({ login: 'alice', password: 'longenough1', ua: 'jest', ip: '127.0.0.1' });
  assert.equal(user.username, 'alice');
  assert.ok(sessionId && sessionId.length === 64);

  const got = auth.getSessionUser(sessionId);
  assert.ok(got, 'session should resolve');
  assert.equal(got.user.id, user.id);

  auth.destroySession(sessionId);
  assert.equal(auth.getSessionUser(sessionId), null);
});

test('login fails uniformly on wrong password / unknown user / disabled', () => {
  assert.throws(() => auth.login({ login: 'alice', password: 'wrong-password' }), /invalid credentials/);
  assert.throws(() => auth.login({ login: 'nobody', password: 'longenough1' }), /invalid credentials/);

  // 找到 bob 并 disable，登录应返 invalid credentials（与"密码错"统一）
  const bob = db.users.findByLogin('bob');
  db.users.updateStatus(bob.id, 'disabled');
  assert.throws(() => auth.login({ login: 'bob', password: 'longenough1' }), /invalid credentials/);
  // 还原
  db.users.updateStatus(bob.id, 'active');
});

test('admin cannot demote/disable last active admin', () => {
  // root is the only admin at this point
  const root = db.users.findByLogin('root');
  const bob = db.users.findByLogin('bob');

  // Promote bob so there are two admins
  db.users.updateRole(bob.id, 'admin');

  // bob can demote root while bob remains admin
  const demoted = users.patchUser(bob.id, root.id, { role: 'user' });
  assert.equal(demoted.role, 'user');

  assert.throws(() => users.patchUser(bob.id, bob.id, { role: 'user' }), /self-modify forbidden/);

  // Restore root; now root and bob are both admins
  db.users.updateRole(root.id, 'admin');
  // root can demote bob because the pre-change admin count is still > 1
  const r = users.patchUser(root.id, bob.id, { role: 'user' });
  assert.equal(r.role, 'user');
  // root is now the only admin, so demoting root must be rejected
  assert.throws(() => users.patchUser(bob.id, root.id, { role: 'user' }), /last active admin/);
});

test('getUserDetail does not expose raw session ids', () => {
  const root = db.users.findByLogin('root');
  const { sessionId } = auth.login({ login: 'root', password: 'longenough1', ua: 'jest-detail', ip: '127.0.0.1' });
  const detail = users.getUserDetail(root.id);
  assert.ok(detail.sessions.length >= 1);
  assert.equal(Object.hasOwn(detail.sessions[0], 'id'), false);
  auth.destroySession(sessionId);
});

test('changePassword fails on wrong old password, invalidates after change', () => {
  const alice = db.users.findByLogin('alice');
  assert.throws(
    () => users.changePassword(alice.id, 'wrong', 'newpass1234'),
    /invalid credentials/
  );
  users.changePassword(alice.id, 'longenough1', 'newpass1234');
  // 旧密码登录失败
  assert.throws(() => auth.login({ login: 'alice', password: 'longenough1' }), /invalid credentials/);
  // 新密码登录成功
  const r = auth.login({ login: 'alice', password: 'newpass1234' });
  assert.ok(r.sessionId);
});
