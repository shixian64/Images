import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let auth;
let gallery;
let adminGalleryRoutes;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-admin-gallery-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  gallery = await import('../services/gallery-store.js');
  adminGalleryRoutes = await import('../routes/admin-gallery.js');
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

function adminReq(user) {
  return {
    method: 'GET',
    session: { user },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  };
}

function setImageCreatedAt(id, ts) {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('UPDATE images SET created_at = ? WHERE id = ?').run(ts, id);
  } finally {
    sqlite.close();
  }
}

async function getAdminGallery(adminUser, query) {
  const url = new URL(`http://localhost/api/admin/gallery${query}`);
  const res = captureRes();
  await adminGalleryRoutes.handleAdminGalleryRoute(adminReq(adminUser), res, '/api/admin/gallery', url);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function getAdminGalleryStats(adminUser) {
  const res = captureRes();
  await adminGalleryRoutes.handleAdminGalleryRoute(
    adminReq(adminUser),
    res,
    '/api/admin/gallery/stats',
    new URL('http://localhost/api/admin/gallery/stats')
  );
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

test('admin gallery list applies filters and pagination in the data layer', async () => {
  const admin = { ...auth.register({
    username: 'gallery_admin',
    email: 'gallery_admin@example.com',
    password: 'longenough1'
  }), role: 'admin' };
  const owner = auth.register({
    username: 'gallery_owner',
    email: 'gallery_owner@example.com',
    password: 'longenough1'
  });
  const other = auth.register({
    username: 'gallery_other',
    email: 'gallery_other@example.com',
    password: 'longenough1'
  });

  const match = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'needle old prompt', model: 'needle-model', profileName: 'rare-profile', outputFormat: 'png' },
    { userId: owner.id }
  );
  const otherResults = [];
  for (let i = 0; i < 3; i += 1) {
    otherResults.push(await gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: `plain prompt ${i}`, model: 'plain-model', profileName: 'common-profile', outputFormat: 'png' },
      { userId: other.id }
    ));
  }

  const matchId = match.saved[0].id;
  setImageCreatedAt(matchId, '2026-01-01T00:00:00.000Z');
  otherResults.forEach((result, index) => {
    setImageCreatedAt(result.saved[0].id, `2026-01-0${index + 2}T00:00:00.000Z`);
  });

  const searched = await getAdminGallery(admin, '?size=1&search=needle');
  assert.equal(searched.totalAll, 4);
  assert.equal(searched.total, 1);
  assert.equal(searched.pageSize, 1);
  assert.deepEqual(searched.items.map((item) => item.id), [matchId]);

  const mine = await getAdminGallery(admin, `?size=1&userId=${encodeURIComponent(owner.id)}`);
  assert.equal(mine.total, 1);
  assert.deepEqual(mine.items.map((item) => item.id), [matchId]);

  const stats = await getAdminGalleryStats(admin);
  assert.equal(stats.total, 4);
  assert.ok(stats.totalBytes > 0);
  assert.equal(stats.topModels.some((item) => item.model === 'plain-model' && item.count === 3), true);

  const missing = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'needle newer missing file', model: 'needle-model', profileName: 'rare-profile', outputFormat: 'png' },
    { userId: owner.id }
  );
  const missingItem = missing.saved[0];
  setImageCreatedAt(missingItem.id, '2026-01-05T00:00:00.000Z');
  rmSync(join(gallery.galleryPaths.root, ...missingItem.path.split('/')), { force: true });

  const searchedWithMissingFirst = await getAdminGallery(admin, '?size=1&search=needle');
  assert.equal(searchedWithMissingFirst.totalAll, 4);
  assert.equal(searchedWithMissingFirst.total, 1);
  assert.deepEqual(searchedWithMissingFirst.items.map((item) => item.id), [matchId]);
});
