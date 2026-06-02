import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let workDir;
let prevCwd;
let prevEnv;
let authRoutes;
let db;
let rateLimit;

const ENV_KEYS = [
  'ADMIN_BOOTSTRAP_TOKEN',
  'REGISTRATION_MODE',
  'REGISTRATION_INVITE_CODE',
  'REGISTRATION_INVITE_CODES',
  'REGISTRATION_EMAIL_DOMAIN_ALLOWLIST',
  'REGISTRATION_EMAIL_DOMAIN_BLOCKLIST'
];

before(async () => {
  prevCwd = process.cwd();
  prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.ADMIN_BOOTSTRAP_TOKEN = '';
  process.env.REGISTRATION_MODE = 'closed';
  process.env.REGISTRATION_INVITE_CODE = '';
  process.env.REGISTRATION_INVITE_CODES = '';
  process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
  process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-first-admin-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  authRoutes = await import('../routes/auth.js');
  rateLimit = await import('../services/rate-limit.js');
  db.migrate();
});

after(() => {
  rateLimit?.clear?.();
  process.chdir(prevCwd);
  for (const [key, value] of Object.entries(prevEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function jsonReq(body, { ip = '198.51.100.91' } = {}) {
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

async function postRegister(body, opts) {
  const req = jsonReq(body, opts);
  const res = captureRes();
  await authRoutes.handleAuthRoute(req, res, '/api/auth/register');
  return res;
}

test('closed registration allows first account to become admin without bootstrap token', async () => {
  const first = await postRegister({
    username: 'first_admin',
    email: 'first-admin@example.com',
    password: 'longenough1'
  });
  assert.equal(first.statusCode, 200);
  const firstUser = JSON.parse(first.body).user;
  assert.equal(firstUser.role, 'admin');

  const blocked = await postRegister({
    username: 'closed_user',
    email: 'closed-user@example.com',
    password: 'longenough1'
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal(JSON.parse(blocked.body).code, 'registration_closed');

  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
  db.users.updateRole(firstUser.id, 'user');

  const legacyBootstrap = await postRegister({
    username: 'legacy_admin',
    email: 'legacy-admin@example.com',
    password: 'longenough1',
    adminBootstrapToken: 'bootstrap-secret'
  });
  assert.equal(legacyBootstrap.statusCode, 200);
  assert.equal(JSON.parse(legacyBootstrap.body).user.role, 'admin');
});
