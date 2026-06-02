import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let registrationRoutes;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-registration-route-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  registrationRoutes = await import('../routes/registration.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
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

function postReq(user, body) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    method: 'POST',
    session: { user },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield raw;
    }
  };
}

async function postCleanup(user, body) {
  const res = captureRes();
  await registrationRoutes.handleRegistrationRoute(
    postReq(user, body),
    res,
    '/api/admin/registration/redemptions/cleanup'
  );
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

test('registration redemption cleanup rejects impossible calendar dates', async () => {
  const admin = auth.register({
    username: 'registration_route_admin',
    email: 'registration-route-admin@example.com',
    password: 'longenough1'
  });

  const invalid = await postCleanup(admin, { before: '2026-02-31' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.error, 'invalid cleanup cutoff');

  const invalidIso = await postCleanup(admin, { before: '2026-02-31T00:00:00.000Z' });
  assert.equal(invalidIso.statusCode, 400);
  assert.equal(invalidIso.body.error, 'invalid cleanup cutoff');

  const valid = await postCleanup(admin, { before: '2026-02-28' });
  assert.equal(valid.statusCode, 200);
});
