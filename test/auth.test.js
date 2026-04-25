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

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  users = await import('../services/users.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('first user is admin, second user is regular', () => {
  const u1 = auth.register({ username: 'alice', email: 'alice@x.com', password: 'longenough1' });
  assert.equal(u1.role, 'admin');
  assert.equal(u1.status, 'active');
  // 不应回传 password 字段
  assert.equal(u1.password_hash, undefined);
  assert.equal(u1.password_salt, undefined);

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
  // 当前只有 alice 是 admin
  const alice = db.users.findByLogin('alice');
  const bob = db.users.findByLogin('bob');

  // 让 bob 也成 admin，使总数为 2
  db.users.updateRole(bob.id, 'admin');

  // bob 把 alice 降级 → 此时还有 bob 这个 admin → 允许
  const demoted = users.patchUser(bob.id, alice.id, { role: 'user' });
  assert.equal(demoted.role, 'user');

  // 现在只有 bob 一个 admin。alice (现在是 user) 不能改自己…用 bob 自己改自己也不允许（self-modify forbidden）
  assert.throws(() => users.patchUser(bob.id, bob.id, { role: 'user' }), /self-modify forbidden/);

  // 给个临时 actor (再造一个 admin 然后让他降 bob 试试就会失败 —— 这里直接构造场景)
  // 把 alice 升回 admin → 现在 alice、bob 都是 admin
  db.users.updateRole(alice.id, 'admin');
  // bob 用 alice 把 bob 降级 → 此时降完只剩 alice 一个 admin → 允许（因为 countAdmins>1 的判断在降级前）
  const r = users.patchUser(alice.id, bob.id, { role: 'user' });
  assert.equal(r.role, 'user');
  // 再来一遍：alice 是唯一 admin，把 alice 降级（用 bob 当 actor）→ countAdmins == 1 → 拒
  assert.throws(() => users.patchUser(bob.id, alice.id, { role: 'user' }), /last active admin/);
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
