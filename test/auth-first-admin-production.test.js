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
  'ALLOW_FIRST_ADMIN_WITHOUT_TOKEN',
  'NODE_ENV',
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
  process.env.ALLOW_FIRST_ADMIN_WITHOUT_TOKEN = '';
  process.env.NODE_ENV = 'production';
  process.env.REGISTRATION_MODE = 'closed';
  process.env.REGISTRATION_INVITE_CODE = '';
  process.env.REGISTRATION_INVITE_CODES = '';
  process.env.REGISTRATION_EMAIL_DOMAIN_ALLOWLIST = '';
  process.env.REGISTRATION_EMAIL_DOMAIN_BLOCKLIST = '';

  workDir = mkdtempSync(join(tmpdir(), 'image-studio-auth-first-admin-prod-'));
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

function jsonReq(body, { ip = '198.51.100.92' } = {}) {
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

test('production first admin requires bootstrap token unless explicitly opted out', async () => {
  const missing = await postRegister({
    username: 'first_admin_prod',
    email: 'first-admin-prod@example.com',
    password: 'longenough1'
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(JSON.parse(missing.body).error, 'admin bootstrap token required');
  assert.equal(db.users.count(), 0);

  process.env.ALLOW_FIRST_ADMIN_WITHOUT_TOKEN = '1';
  const optedOut = await postRegister({
    username: 'first_admin_prod_optout',
    email: 'first-admin-prod-optout@example.com',
    password: 'longenough1'
  });
  assert.equal(optedOut.statusCode, 200);
  const optedOutUser = JSON.parse(optedOut.body).user;
  assert.equal(optedOutUser.role, 'admin');
  assert.equal(db.users.count(), 1);
  db.users.delete(optedOutUser.id);
  process.env.ALLOW_FIRST_ADMIN_WITHOUT_TOKEN = '';
  assert.equal(db.users.count(), 0);

  process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
  const created = await postRegister({
    username: 'first_admin_prod',
    email: 'first-admin-prod@example.com',
    password: 'longenough1',
    adminBootstrapToken: 'bootstrap-secret'
  });
  assert.equal(created.statusCode, 200);
  assert.equal(JSON.parse(created.body).user.role, 'admin');
});
