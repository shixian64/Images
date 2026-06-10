import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let usersRoute;
let admin;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-users-route-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  usersRoute = await import('../routes/users.js');
  db.migrate();

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.exec(`
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM prompt_square;
    `);
  } finally {
    sqlite.close();
  }

  admin = db.users.create({
    username: 'route_admin',
    email: 'route-admin@example.com',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    role: 'admin'
  });
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

function getReq(user) {
  return {
    method: 'GET',
    session: { user },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  };
}

function setUserCreatedAt(id, ts) {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('UPDATE users SET created_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  } finally {
    sqlite.close();
  }
}

function createUser(username, { role = 'user', status = 'active', createdAt } = {}) {
  const row = db.users.create({
    username,
    email: `${username}@example.com`,
    passwordHash: 'hash',
    passwordSalt: 'salt',
    role
  });
  if (status !== 'active') db.users.updateStatus(row.id, status);
  if (createdAt) setUserCreatedAt(row.id, createdAt);
  return db.users.findById(row.id);
}

async function listUsers(query) {
  const url = new URL(`http://localhost/api/users${query}`);
  const res = captureRes();
  await usersRoute.handleUsersRoute(getReq(admin), res, '/api/users', url);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function getUserDetail(userId, query = '') {
  const url = new URL(`http://localhost/api/users/${encodeURIComponent(userId)}${query}`);
  const res = captureRes();
  await usersRoute.handleUsersRoute(getReq(admin), res, `/api/users/${encodeURIComponent(userId)}`, url);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

test('admin users list filters in SQL before pagination', async () => {
  setUserCreatedAt(admin.id, '2026-01-01T00:00:00.000Z');
  const match = createUser('needle_oldest', {
    status: 'disabled',
    createdAt: '2026-01-02T00:00:00.000Z'
  });
  createUser('newest_one', { createdAt: '2026-01-03T00:00:00.000Z' });
  createUser('newest_two', { createdAt: '2026-01-04T00:00:00.000Z' });
  createUser('newest_three', {
    role: 'admin',
    createdAt: '2026-01-05T00:00:00.000Z'
  });

  const firstPage = await listUsers('?page=1&size=2');
  assert.equal(firstPage.total, 5);
  assert.equal(firstPage.filtered, 5);
  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.pageSize, 2);
  assert.deepEqual(firstPage.items.map((item) => item.username), ['route_admin', 'needle_oldest']);

  const search = await listUsers('?page=1&size=1&search=needle');
  assert.equal(search.total, 5);
  assert.equal(search.filtered, 1);
  assert.deepEqual(search.items.map((item) => item.id), [match.id]);

  const disabledUsers = await listUsers('?page=1&size=10&role=user&status=disabled');
  assert.equal(disabledUsers.filtered, 1);
  assert.deepEqual(disabledUsers.items.map((item) => item.id), [match.id]);
});

test('admin user detail loads expensive sections only when requested', async () => {
  const target = createUser('detail_lazy_user', {
    createdAt: '2026-02-01T00:00:00.000Z'
  });

  const base = await getUserDetail(target.id);
  assert.ok(base.user);
  assert.equal(Object.hasOwn(base, 'audits'), false);
  assert.equal(Object.hasOwn(base, 'activityLogs'), false);
  assert.equal(Object.hasOwn(base, 'jobs'), false);
  assert.equal(Object.hasOwn(base, 'clientLogs'), false);

  const partial = await getUserDetail(target.id, '?include=jobs,clientLogs');
  assert.ok(Array.isArray(partial.jobs));
  assert.ok(Array.isArray(partial.clientLogs));
  assert.equal(Object.hasOwn(partial, 'audits'), false);
  assert.equal(Object.hasOwn(partial, 'activityLogs'), false);

  const all = await getUserDetail(target.id, '?include=all');
  assert.ok(Array.isArray(all.audits));
  assert.ok(Array.isArray(all.activityLogs));
  assert.ok(Array.isArray(all.jobs));
  assert.ok(Array.isArray(all.clientLogs));
});
