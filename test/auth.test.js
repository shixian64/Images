// 验证 register / login / getSessionUser / destroySession + 用户管理边界条件。
// 每个测试文件在独立进程，绑定独立 tmp 目录。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let auth;
let authRoutes;
let rateLimit;
let users;
let db;
let sessionMiddleware;
let prevBootstrapToken;
let registrationGuard;

before(async () => {
  prevCwd = process.cwd();
  prevBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  authRoutes = await import('../routes/auth.js');
  rateLimit = await import('../services/rate-limit.js');
  users = await import('../services/users.js');
  sessionMiddleware = await import('../middleware/session.js');
  registrationGuard = await import('../services/registration-guard.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  if (prevBootstrapToken === undefined) delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  else process.env.ADMIN_BOOTSTRAP_TOKEN = prevBootstrapToken;
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('first registration becomes admin without bootstrap token', () => {
  const root = auth.register({ username: 'root', email: 'root@x.com', password: 'longenough1' });
  assert.equal(root.role, 'admin');
  assert.equal(root.status, 'active');
  // password fields must not be returned
  assert.equal(root.password_hash, undefined);
  assert.equal(root.password_salt, undefined);

  const u1 = auth.register({ username: 'alice', email: 'alice@x.com', password: 'longenough1' });
  assert.equal(u1.role, 'user');

  assert.throws(
    () => auth.register({ username: 'mallory', email: 'mallory@x.com', password: 'longenough1', adminBootstrapToken: 'wrong' }),
    /invalid admin bootstrap token/
  );

  const u2 = auth.register({ username: 'bob', email: 'bob@x.com', password: 'longenough1' });
  assert.equal(u2.role, 'user');

  assert.throws(
    () => auth.register({
      username: 'lateadmin',
      email: 'lateadmin@x.com',
      password: 'longenough1',
      adminBootstrapToken: 'bootstrap-secret'
    }),
    /no longer accepted/
  );
});

function jsonReq(body, { ip = '198.51.100.10' } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'user-agent': 'node-test' };
  req.socket = { remoteAddress: ip };
  return req;
}

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    getHeader(key) {
      return this.headers[String(key).toLowerCase()];
    },
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

async function postAuth(pathname, body, opts) {
  const req = jsonReq(body, opts);
  const res = captureRes();
  await authRoutes.handleAuthRoute(req, res, pathname);
  return res;
}

test('login rate limit caps source IP even when login changes', async () => {
  rateLimit.clear();
  const prev = {
    LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE: process.env.LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE,
    LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE: process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE,
    LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE: process.env.LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE
  };
  process.env.LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE = '3';
  process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE = '100';
  process.env.LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE = '100';
  try {
    for (let i = 0; i < 3; i += 1) {
      const res = await postAuth('/api/auth/login', {
        login: `rotating-${i}`,
        password: 'wrong-password'
      });
      assert.equal(res.statusCode, 401);
    }
    const blocked = await postAuth('/api/auth/login', {
      login: 'rotating-4',
      password: 'wrong-password'
    });
    assert.equal(blocked.statusCode, 429);
    assert.equal(JSON.parse(blocked.body).code, 'login_ip_rate_limited');
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('closed registration failures do not consume IP registration limit', async () => {
  rateLimit.clear();
  const prev = {
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    REGISTRATION_INVITE_CODE: process.env.REGISTRATION_INVITE_CODE,
    REGISTRATION_INVITE_CODES: process.env.REGISTRATION_INVITE_CODES,
    REGISTRATION_IP_MAX_PER_10MIN: process.env.REGISTRATION_IP_MAX_PER_10MIN,
    REGISTRATION_IP_MAX_PER_DAY: process.env.REGISTRATION_IP_MAX_PER_DAY,
    REGISTRATION_EMAIL_DOMAIN_ALLOWLIST: process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST,
    REGISTRATION_EMAIL_DOMAIN_BLOCKLIST: process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST
  };
  const ip = '198.51.100.44';
  try {
    process.env.REGISTRATION_MODE = 'closed';
    process.env.REGISTRATION_INVITE_CODE = '';
    process.env.REGISTRATION_INVITE_CODES = '';
    process.env.REGISTRATION_IP_MAX_PER_10MIN = '2';
    process.env.REGISTRATION_IP_MAX_PER_DAY = '100';
    process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
    process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

    for (let i = 0; i < 2; i += 1) {
      const closed = await postAuth('/api/auth/register', {
        username: `closed${i}`,
        email: `closed${i}@example.com`,
        password: 'longenough1'
      }, { ip });
      assert.equal(closed.statusCode, 403);
      assert.equal(JSON.parse(closed.body).code, 'registration_closed');
    }

    process.env.REGISTRATION_MODE = 'open';
    const allowed = await postAuth('/api/auth/register', {
      username: 'rateok',
      email: 'rateok@example.com',
      password: 'longenough1'
    }, { ip });
    assert.equal(allowed.statusCode, 200);
    assert.equal(JSON.parse(allowed.body).user.username, 'rateok');
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('invalid admin bootstrap token attempts are rate limited separately from normal registration', async () => {
  rateLimit.clear();
  const prev = {
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    REGISTRATION_INVITE_CODE: process.env.REGISTRATION_INVITE_CODE,
    REGISTRATION_INVITE_CODES: process.env.REGISTRATION_INVITE_CODES,
    REGISTRATION_IP_MAX_PER_10MIN: process.env.REGISTRATION_IP_MAX_PER_10MIN,
    REGISTRATION_IP_MAX_PER_DAY: process.env.REGISTRATION_IP_MAX_PER_DAY,
    ADMIN_BOOTSTRAP_IP_MAX_PER_10MIN: process.env.ADMIN_BOOTSTRAP_IP_MAX_PER_10MIN,
    ADMIN_BOOTSTRAP_IP_WINDOW_MS: process.env.ADMIN_BOOTSTRAP_IP_WINDOW_MS,
    REGISTRATION_EMAIL_DOMAIN_ALLOWLIST: process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST,
    REGISTRATION_EMAIL_DOMAIN_BLOCKLIST: process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST
  };
  const ip = '198.51.100.45';
  try {
    process.env.REGISTRATION_MODE = 'open';
    process.env.REGISTRATION_INVITE_CODE = '';
    process.env.REGISTRATION_INVITE_CODES = '';
    process.env.REGISTRATION_IP_MAX_PER_10MIN = '2';
    process.env.REGISTRATION_IP_MAX_PER_DAY = '100';
    process.env.ADMIN_BOOTSTRAP_IP_MAX_PER_10MIN = '';
    process.env.ADMIN_BOOTSTRAP_IP_WINDOW_MS = '600000';
    process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
    process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

    for (let i = 0; i < 2; i += 1) {
      const wrong = await postAuth('/api/auth/register', {
        username: `wrongbootstrap${i}`,
        email: `wrongbootstrap${i}@example.com`,
        password: 'longenough1',
        adminBootstrapToken: 'wrong-token'
      }, { ip });
      assert.equal(wrong.statusCode, 400);
      assert.equal(JSON.parse(wrong.body).error, 'invalid admin bootstrap token');
    }

    const blocked = await postAuth('/api/auth/register', {
      username: 'wrongbootstrap2',
      email: 'wrongbootstrap2@example.com',
      password: 'longenough1',
      adminBootstrapToken: 'wrong-token'
    }, { ip });
    assert.equal(blocked.statusCode, 429);
    assert.equal(JSON.parse(blocked.body).code, 'admin_bootstrap_rate_limited');

    const allowed = await postAuth('/api/auth/register', {
      username: 'normalafterbootstraplimit',
      email: 'normalafterbootstraplimit@example.com',
      password: 'longenough1'
    }, { ip });
    assert.equal(allowed.statusCode, 200);
    assert.equal(JSON.parse(allowed.body).user.username, 'normalafterbootstraplimit');
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('invalid invite code attempts are rate limited', async () => {
  rateLimit.clear();
  const prev = {
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    REGISTRATION_INVITE_CODE: process.env.REGISTRATION_INVITE_CODE,
    REGISTRATION_INVITE_CODES: process.env.REGISTRATION_INVITE_CODES,
    REGISTRATION_IP_MAX_PER_10MIN: process.env.REGISTRATION_IP_MAX_PER_10MIN,
    REGISTRATION_IP_MAX_PER_DAY: process.env.REGISTRATION_IP_MAX_PER_DAY,
    REGISTRATION_EMAIL_DOMAIN_ALLOWLIST: process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST,
    REGISTRATION_EMAIL_DOMAIN_BLOCKLIST: process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST
  };
  const ip = '198.51.100.46';
  try {
    process.env.REGISTRATION_MODE = 'invite';
    process.env.REGISTRATION_INVITE_CODE = 'correct-code';
    process.env.REGISTRATION_INVITE_CODES = '';
    process.env.REGISTRATION_IP_MAX_PER_10MIN = '2';
    process.env.REGISTRATION_IP_MAX_PER_DAY = '100';
    process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
    process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

    for (let i = 0; i < 2; i += 1) {
      const wrong = await postAuth('/api/auth/register', {
        username: `wronginvite${i}`,
        email: `wronginvite${i}@example.com`,
        password: 'longenough1',
        registrationCode: 'wrong-code'
      }, { ip });
      assert.equal(wrong.statusCode, 403);
      assert.equal(JSON.parse(wrong.body).code, 'invalid_registration_invite_code');
    }

    const blocked = await postAuth('/api/auth/register', {
      username: 'wronginvite2',
      email: 'wronginvite2@example.com',
      password: 'longenough1',
      registrationCode: 'wrong-code'
    }, { ip });
    assert.equal(blocked.statusCode, 429);
    assert.equal(JSON.parse(blocked.body).code, 'registration_rate_limited');
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('missing required invite code attempts are rate limited', async () => {
  rateLimit.clear();
  const prev = {
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    REGISTRATION_INVITE_CODE: process.env.REGISTRATION_INVITE_CODE,
    REGISTRATION_INVITE_CODES: process.env.REGISTRATION_INVITE_CODES,
    REGISTRATION_IP_MAX_PER_10MIN: process.env.REGISTRATION_IP_MAX_PER_10MIN,
    REGISTRATION_IP_MAX_PER_DAY: process.env.REGISTRATION_IP_MAX_PER_DAY,
    REGISTRATION_EMAIL_DOMAIN_ALLOWLIST: process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST,
    REGISTRATION_EMAIL_DOMAIN_BLOCKLIST: process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST
  };
  const ip = '198.51.100.47';
  try {
    process.env.REGISTRATION_MODE = 'invite';
    process.env.REGISTRATION_INVITE_CODE = 'correct-code';
    process.env.REGISTRATION_INVITE_CODES = '';
    process.env.REGISTRATION_IP_MAX_PER_10MIN = '2';
    process.env.REGISTRATION_IP_MAX_PER_DAY = '100';
    process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
    process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

    for (let i = 0; i < 2; i += 1) {
      const missing = await postAuth('/api/auth/register', {
        username: `missinginvite${i}`,
        email: `missinginvite${i}@example.com`,
        password: 'longenough1'
      }, { ip });
      assert.equal(missing.statusCode, 403);
      assert.equal(JSON.parse(missing.body).code, 'invalid_registration_invite_code');
    }

    const blocked = await postAuth('/api/auth/register', {
      username: 'missinginvite2',
      email: 'missinginvite2@example.com',
      password: 'longenough1'
    }, { ip });
    assert.equal(blocked.statusCode, 429);
    assert.equal(JSON.parse(blocked.body).code, 'registration_rate_limited');
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('db invite registration removes created user if final invite consume fails', async () => {
  registrationGuard.setRegistrationSettings({
    allowPublicRegistration: false,
    allowInviteRegistration: true,
    defaultInviteUses: 1
  }, 'admin-test');
  const [invite] = registrationGuard.generateRegistrationInviteCodes({ count: 1, createdBy: 'admin-test' });
  const originalConsume = db.registrationInvites.consume;
  db.registrationInvites.consume = () => null;

  try {
    const res = await postAuth('/api/auth/register', {
      username: 'invitefail',
      email: 'invitefail@example.com',
      password: 'longenough1',
      registrationCode: invite.code
    }, { ip: '198.51.100.77' });

    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).code, 'invalid_registration_invite_code');
    assert.equal(db.users.findByLogin('invitefail'), null);
    assert.equal(db.users.findByLogin('invitefail@example.com'), null);
  } finally {
    db.registrationInvites.consume = originalConsume;
    db.registrationInvites.reset();
    db.registrationInviteRedemptions.cleanupBefore('9999-12-31T23:59:59.999Z');
    db.systemSettings.delete('registration.settings');
  }
});

test('registration route does not reveal whether username or email collided', async () => {
  rateLimit.clear();
  const prev = {
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    REGISTRATION_INVITE_CODE: process.env.REGISTRATION_INVITE_CODE,
    REGISTRATION_INVITE_CODES: process.env.REGISTRATION_INVITE_CODES,
    REGISTRATION_IP_MAX_PER_10MIN: process.env.REGISTRATION_IP_MAX_PER_10MIN,
    REGISTRATION_IP_MAX_PER_DAY: process.env.REGISTRATION_IP_MAX_PER_DAY,
    REGISTRATION_EMAIL_DOMAIN_ALLOWLIST: process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST,
    REGISTRATION_EMAIL_DOMAIN_BLOCKLIST: process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST
  };
  try {
    process.env.REGISTRATION_MODE = 'open';
    process.env.REGISTRATION_INVITE_CODE = '';
    process.env.REGISTRATION_INVITE_CODES = '';
    process.env.REGISTRATION_IP_MAX_PER_10MIN = '100';
    process.env.REGISTRATION_IP_MAX_PER_DAY = '100';
    process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
    process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';
    const existing = auth.register({
      username: 'routeconflict',
      email: 'routeconflict@example.com',
      password: 'longenough1'
    });

    const usernameConflict = await postAuth('/api/auth/register', {
      username: existing.username,
      email: 'routeconflict-new@example.com',
      password: 'longenough1'
    });
    const emailConflict = await postAuth('/api/auth/register', {
      username: 'routeconflictnew',
      email: existing.email,
      password: 'longenough1'
    });

    assert.equal(usernameConflict.statusCode, 400);
    assert.equal(emailConflict.statusCode, 400);
    assert.deepEqual(JSON.parse(usernameConflict.body), JSON.parse(emailConflict.body));
    assert.deepEqual(JSON.parse(usernameConflict.body), {
      error: 'username or email already in use',
      code: 'registration_conflict'
    });
  } finally {
    rateLimit.clear();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('register validates username/email/password', () => {
  assert.throws(() => auth.register({ username: 'a', email: 'x@y.com', password: 'longenough1' }), /invalid username/);
  assert.throws(() => auth.register({ username: 'okok', email: 'no-at-sign', password: 'longenough1' }), /invalid email/);
  assert.throws(() => auth.register({ username: 'okok', email: 'ok@x.com', password: 'short' }), /at least 8/);
  assert.throws(() => auth.register({ username: 'alice', email: 'aa@x.com', password: 'longenough1' }), /username already taken/);
});

test('updateProfile rejects unsafe avatar URL schemes and credentials', () => {
  const u = auth.register({ username: 'avataruser', email: 'avatar@x.com', password: 'longenough1' });

  assert.throws(
    () => users.updateProfile(u.id, { avatarUrl: 'javascript:alert(1)' }),
    /invalid avatar URL/
  );
  assert.throws(
    () => users.updateProfile(u.id, { avatarUrl: 'https://user:pass@example.com/avatar.png' }),
    /credentials/
  );

  const updated = users.updateProfile(u.id, { avatarUrl: 'https://example.com/avatar.png' });
  assert.equal(updated.avatar_url, 'https://example.com/avatar.png');

  const cleared = users.updateProfile(u.id, { avatarUrl: '' });
  assert.equal(cleared.avatar_url, '');
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

test('attachSession refreshes browser cookie when sliding session is extended', () => {
  const { user, sessionId } = auth.login({
    login: 'alice',
    password: 'longenough1',
    ua: 'sliding-session',
    ip: '127.0.0.1'
  });
  const nearExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(nearExpiry, sessionId);
  } finally {
    sqlite.close();
  }

  const req = {
    headers: { cookie: `sid=${encodeURIComponent(sessionId)}` },
    socket: { remoteAddress: '127.0.0.1' }
  };
  const res = captureRes();
  sessionMiddleware.default(req, res);

  assert.equal(req.session?.user?.id, user.id);
  const setCookie = res.headers['set-cookie'];
  const cookieText = Array.isArray(setCookie) ? setCookie.join('\n') : String(setCookie || '');
  assert.match(cookieText, /sid=/);
  assert.match(cookieText, /Max-Age=604800/);
  assert.match(cookieText, /HttpOnly/);
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
