// 验证 /gallery-files/* 的用户归属校验（用户 A 不能访问用户 B 的图片）。
// 不起 http server，直接 mock req/res 调用 createStaticHandler。

import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let createStaticHandler;
let auth;
let db;
let serveStatic;
let userA, userB;

function mockReq(url, session) {
  return {
    url,
    method: 'GET',
    headers: { host: 'localhost:8787' },
    session
  };
}

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    finished: false
  };
  res.writeHead = (code, headers) => {
    res.statusCode = code;
    if (headers) Object.assign(res.headers, headers);
  };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.end = (content) => {
    res.body = content;
    res.finished = true;
  };
  return res;
}

async function call(url, session) {
  const req = mockReq(url, session);
  const res = mockRes();
  await serveStatic(req, res);
  return res;
}

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-static-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  ({ createStaticHandler } = await import('../routes/static.js'));

  // 起码要有 public/、generated/users/<uid>/images/<date>/* 的目录结构
  mkdirSync(join(workDir, 'public'), { recursive: true });
  writeFileSync(join(workDir, 'public', 'index.html'), '<!doctype html>hi');

  db.migrate();
  userA = auth.register({ username: 'aaa', email: 'a@x.com', password: 'longenough1' });
  userB = auth.register({ username: 'bbb', email: 'b@x.com', password: 'longenough1' });

  // 给 A 写一张物理图 + db 元数据
  const imgDir = join(workDir, 'generated', 'users', userA.id, 'images', '2026-04-25');
  mkdirSync(imgDir, { recursive: true });
  writeFileSync(join(imgDir, 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  db.images.insert({
    id: 'img-A-1',
    userId: userA.id,
    createdAt: '2026-04-25T00:00:00.000Z',
    filename: 'a.png',
    path: `users/${userA.id}/images/2026-04-25/a.png`,
    mimeType: 'image/png',
    bytes: 4,
    sourceType: 'b64_json',
    index: 1
  });

  // 给 legacy 旧路径写一张图（在 generated/images/ 下，归属 userA）
  const legacyDir = join(workDir, 'generated', 'images', '2026-01-01');
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, 'old.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  db.images.insert({
    id: 'img-legacy-1',
    userId: userA.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    filename: 'old.png',
    path: 'images/2026-01-01/old.png',
    mimeType: 'image/png',
    bytes: 4,
    sourceType: 'b64_json',
    index: 1
  });

  serveStatic = createStaticHandler(join(workDir, 'public'), workDir);
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('owner can access own user-scoped image', async () => {
  const res = await call(
    `/gallery-files/users/${userA.id}/images/2026-04-25/a.png`,
    { user: userA, sessionId: 's' }
  );
  assert.equal(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body) && res.body.length === 4);
});

test('other user gets 403 on cross-user image', async () => {
  const res = await call(
    `/gallery-files/users/${userA.id}/images/2026-04-25/a.png`,
    { user: userB, sessionId: 's' }
  );
  assert.equal(res.statusCode, 403);
});

test('unauthenticated request gets 403', async () => {
  const res = await call(
    `/gallery-files/users/${userA.id}/images/2026-04-25/a.png`,
    null
  );
  assert.equal(res.statusCode, 403);
});

test('admin can access any user image', async () => {
  // 把 B 升 admin，再访问 A 的图
  db.users.updateRole(userB.id, 'admin');
  const adminB = db.users.findById(userB.id);
  const res = await call(
    `/gallery-files/users/${userA.id}/images/2026-04-25/a.png`,
    { user: { ...adminB, password_hash: undefined, password_salt: undefined }, sessionId: 's' }
  );
  assert.equal(res.statusCode, 200);
  // 还原
  db.users.updateRole(userB.id, 'user');
});

test('legacy /gallery-files/images/* is checked against db.images.user_id', async () => {
  // A 是图片归属者 → 200
  const okRes = await call('/gallery-files/images/2026-01-01/old.png', { user: userA, sessionId: 's' });
  assert.equal(okRes.statusCode, 200);

  // B 不是归属者 → 403
  const banRes = await call('/gallery-files/images/2026-01-01/old.png', { user: userB, sessionId: 's' });
  assert.equal(banRes.statusCode, 403);
});

test('path traversal attempt is rejected', async () => {
  // 试图用 .. 越出用户目录
  const res = await call(
    `/gallery-files/users/${userA.id}/images/../../other/file.png`,
    { user: userA, sessionId: 's' }
  );
  // resolve 后会跳出 generated/users/<uid>/images，应被 403
  assert.ok(res.statusCode === 403 || res.statusCode === 404);
});

test('malformed percent-encoding returns 400 instead of throwing', async () => {
  const res = await call('/%E0%A4%A', null);
  assert.equal(res.statusCode, 400);
});
