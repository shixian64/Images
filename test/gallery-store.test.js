import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let gallery;
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

function response(bytes, { status = 200, headers = {} } = {}) {
  return new Response(bytes, { status, headers });
}

function chunkedResponse(chunks, { status = 200, headers = {} } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  }), { status, headers });
}

function listFilesRecursive(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(abs));
    else out.push(abs);
  }
  return out;
}

async function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-gallery-store-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  gallery = await import('../services/gallery-store.js');

  db.migrate();
  user = auth.register({ username: 'owner', email: 'owner@x.com', password: 'longenough1' });
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('saveGeneratedImages streams URL images with redirect disabled', async () => {
  let seenOptions = null;
  const result = await gallery.saveGeneratedImages(
    [{ url: 'https://example.com/image.png' }],
    { prompt: 'x', outputFormat: 'png' },
    {
      userId: user.id,
      fetchImpl: async (_url, options) => {
        seenOptions = options;
        return chunkedResponse([PNG_BYTES.slice(0, 2), PNG_BYTES.slice(2)], {
          headers: { 'content-type': 'image/png', 'content-length': String(PNG_BYTES.length) }
        });
      }
    }
  );

  assert.equal(result.saved.length, 1);
  assert.equal(seenOptions.redirect, 'manual');
  assert.equal(seenOptions.method, 'GET');
  assert.equal(result.saved[0].bytes, PNG_BYTES.length);
  assert.equal(result.items[0].bytes, PNG_BYTES.length);
  assert.deepEqual(listFilesRecursive(join(workDir, 'generated', 'tmp', 'downloads')), []);
});

test('saveGeneratedImages creates gallery thumbnail variants for PNG images', async () => {
  const result = await gallery.saveGeneratedImages(
    [{ b64_json: VALID_PNG_BYTES.toString('base64') }],
    { prompt: 'thumbnail variant', outputFormat: 'png' },
    { userId: user.id }
  );

  assert.equal(result.saved.length, 1);
  const saved = result.saved[0];
  assert.match(saved.thumbnailPath, /\/\.variants\/[^/]+\/thumb\.png$/);
  assert.match(saved.thumbnailUrl, /^\/gallery-files\//);
  assert.equal(result.items[0].thumbnailUrl, saved.thumbnailUrl);

  const thumbAbs = join(workDir, 'generated', ...saved.thumbnailPath.split('/'));
  assert.equal(existsSync(thumbAbs), true);
  assert.equal(db.images.findById(saved.id).thumbnail_path, saved.thumbnailPath);

  const listed = await gallery.listGallery({ userId: user.id, limit: 1000 });
  const item = listed.items.find((it) => it.id === saved.id);
  assert.equal(item.thumbnailUrl, saved.thumbnailUrl);
  assert.equal(item.downloadUrl, saved.url);

  const orphans = await gallery.scanOrphans();
  assert.equal(orphans.danglingFiles.some((file) => file.path === saved.thumbnailPath), false);

  await gallery.removeImage(saved.id, { userId: user.id });
  assert.equal(existsSync(thumbAbs), false);
});

test('admin gallery list caps prompt previews without changing stored prompts', async () => {
  const longPrompt = [
    'admin gallery prompt start',
    'p'.repeat(gallery.ADMIN_GALLERY_LIST_PROMPT_MAX_CHARS + 200),
    'admin gallery prompt end'
  ].join('\n');
  const longRevised = [
    'admin gallery revised start',
    'r'.repeat(gallery.ADMIN_GALLERY_LIST_PROMPT_MAX_CHARS + 200),
    'admin gallery revised end'
  ].join('\n');
  const result = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64'), revised_prompt: longRevised }],
    { prompt: longPrompt, outputFormat: 'png' },
    { userId: user.id }
  );
  const saved = result.saved[0];

  const admin = await gallery.listAdminGallery({ pageSize: 200 });
  const item = admin.items.find((entry) => entry.id === saved.id);
  assert.ok(item, 'saved image should appear in admin gallery list');
  assert.equal(item.promptTruncated, true);
  assert.equal(item.promptLength, longPrompt.length);
  assert.ok(item.prompt.length <= gallery.ADMIN_GALLERY_LIST_PROMPT_MAX_CHARS);
  assert.doesNotMatch(item.prompt, /admin gallery prompt end/);
  assert.equal(item.revisedPromptTruncated, true);
  assert.equal(item.revisedPromptLength, longRevised.length);
  assert.ok(item.revisedPrompt.length <= gallery.ADMIN_GALLERY_LIST_PROMPT_MAX_CHARS);
  assert.doesNotMatch(item.revisedPrompt, /admin gallery revised end/);
  assert.equal(db.images.findById(saved.id).prompt, longPrompt);
  assert.equal(db.images.findById(saved.id).revised_prompt, longRevised);
});

test('comic project images are saved under projects and hidden from my gallery', async () => {
  const projectId = 'comic-project-gallery-test';
  db.comicProjects.upsert({
    id: projectId,
    userId: user.id,
    title: '漫画项目',
    story: '小故事',
    panelCount: 2,
    storyboard: { title: '漫画项目', panels: [{ beat: '一' }, { beat: '二' }] }
  });

  const result = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'comic panel', outputFormat: 'png', comicProjectId: projectId, comicPageIndex: 2 },
    { userId: user.id }
  );

  assert.equal(result.saved.length, 1);
  assert.equal(result.saved[0].comicProjectId, projectId);
  assert.equal(result.saved[0].comicPageIndex, 2);
  assert.equal(result.saved[0].comicPanelIndex, 2);
  assert.equal(result.items[0].comic_page_index, 2);
  assert.equal(result.items[0].comic_panel_index, 2);

  const mine = await gallery.listGallery({ userId: user.id, scope: 'mine', limit: 1000 });
  assert.equal(mine.items.some((item) => item.id === result.saved[0].id), false);
  assert.equal(mine.counts.comicProjects >= 1, true);

  const projectImages = await gallery.listComicProjectImages({ projectId, userId: user.id });
  assert.equal(projectImages.length, 1);
  assert.equal(projectImages[0].id, result.saved[0].id);
  assert.equal(projectImages[0].comicPageIndex, 2);
  assert.equal(projectImages[0].comicPanelIndex, 2);
});

test('saveGeneratedImages rejects comic projects owned by another user', async () => {
  const other = auth.register({
    username: 'comic_other_owner',
    email: 'comic-other-owner@example.com',
    password: 'longenough1'
  });
  const projectId = 'foreign-comic-project-gallery-test';
  db.comicProjects.upsert({
    id: projectId,
    userId: other.id,
    title: 'Foreign project',
    story: 'Other story',
    panelCount: 1,
    storyboard: { title: 'Foreign project', panels: [{ beat: 'one' }] }
  });

  await assert.rejects(
    () => gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: 'comic panel', outputFormat: 'png', comicProjectId: projectId, comicPanelIndex: 1 },
      { userId: user.id }
    ),
    /comic project not found/
  );
});

test('saveGeneratedImages rejects URL downloads over byte limit', async () => {
  await withEnv({ MAX_IMAGE_DOWNLOAD_BYTES: '4' }, async () => {
    const result = await gallery.saveGeneratedImages(
      [{ url: 'https://example.com/too-large.png' }],
      { prompt: 'x', outputFormat: 'png' },
      {
        userId: user.id,
        fetchImpl: async () => response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
      }
    );

    assert.equal(result.saved.length, 0);
    assert.match(result.items[0].save_error, /too large/);
    assert.deepEqual(listFilesRecursive(join(workDir, 'generated', 'tmp', 'downloads')), []);
  });
});

test('saveGeneratedImages applies timeout while reading URL image body', async () => {
  await withEnv({ IMAGE_DOWNLOAD_TIMEOUT_MS: '25' }, async () => {
    let canceled = false;
    const result = await gallery.saveGeneratedImages(
      [{ url: 'https://example.com/slow.png' }],
      { prompt: 'x', outputFormat: 'png' },
      {
        userId: user.id,
        fetchImpl: async () => new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(PNG_BYTES);
          },
          cancel() {
            canceled = true;
          }
        }), { headers: { 'content-type': 'image/png' } })
      }
    );

    assert.equal(result.saved.length, 0);
    assert.match(result.items[0].save_error, /timed out/);
    assert.equal(canceled, true);
    assert.deepEqual(listFilesRecursive(join(workDir, 'generated', 'tmp', 'downloads')), []);
  });
});

test('saveGeneratedImages rejects b64_json images over byte limit', async () => {
  await withEnv({ MAX_IMAGE_DOWNLOAD_BYTES: '4' }, async () => {
    const result = await gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: 'x', outputFormat: 'png' },
      { userId: user.id }
    );

    assert.equal(result.saved.length, 0);
    assert.match(result.items[0].save_error, /too large/);
  });
});

test('saveGeneratedImages rejects b64_json payloads that are not real images', async () => {
  const html = Buffer.from('<!doctype html><script>globalThis.pwned=1</script>');
  const result = await gallery.saveGeneratedImages(
    [{ b64_json: `data:text/html;base64,${html.toString('base64')}` }],
    { prompt: 'x', outputFormat: 'png' },
    { userId: user.id }
  );

  assert.equal(result.saved.length, 0);
  assert.match(result.items[0].save_error, /content-type is not allowed|not a supported image/);
});

test('saveGeneratedImages rejects explicit non-image content-type', async () => {
  const result = await gallery.saveGeneratedImages(
    [{ url: 'https://example.com/not-image' }],
    { prompt: 'x', outputFormat: 'png' },
    {
      userId: user.id,
      fetchImpl: async () => response(new TextEncoder().encode('<html></html>'), {
        headers: { 'content-type': 'text/html' }
      })
    }
  );

  assert.equal(result.saved.length, 0);
  assert.match(result.items[0].save_error, /content-type is not allowed/);
});

test('saveGeneratedImages removes written file if database insert fails', async () => {
  const cleanupUser = auth.register({
    username: 'cleanup_owner',
    email: 'cleanup-owner@example.com',
    password: 'longenough1'
  });
  const originalInsert = db.images.insert;
  db.images.insert = () => {
    throw new Error('simulated insert failure');
  };

  try {
    const result = await gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: 'cleanup on insert failure', outputFormat: 'png' },
      { userId: cleanupUser.id }
    );

    assert.equal(result.saved.length, 0);
    assert.match(result.items[0].save_error, /simulated insert failure/);
    assert.deepEqual(
      listFilesRecursive(join(workDir, 'generated', 'users', cleanupUser.id, 'images')),
      []
    );
  } finally {
    db.images.insert = originalInsert;
  }
});

test('users can publish an own image and see like counts in public gallery', async () => {
  const result = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'public test', outputFormat: 'png' },
    { userId: user.id }
  );
  const id = result.saved[0].id;

  let publicList = await gallery.listGallery({ userId: user.id, scope: 'public' });
  assert.equal(publicList.items.some((item) => item.id === id), false);

  const published = await gallery.setImagePublic(id, { userId: user.id, isPublic: true });
  assert.equal(published.isPublic, true);

  publicList = await gallery.listGallery({ userId: user.id, scope: 'public' });
  const item = publicList.items.find((it) => it.id === id);
  assert.ok(item);
  assert.equal(item.likeCount, 0);
  assert.equal(item.likedByMe, false);

  const liked = await gallery.likePublicImage(id, { userId: user.id });
  assert.equal(liked.likeCount, 1);
  assert.equal(liked.likedByMe, true);

  const duplicate = await gallery.likePublicImage(id, { userId: user.id });
  assert.equal(duplicate.alreadyLiked, true);
  assert.equal(duplicate.likeCount, 1);
});

test('public gallery likes enforce per-user daily limit', async () => {
  await withEnv({ PUBLIC_GALLERY_DAILY_LIKE_LIMIT: '1' }, async () => {
    const viewer = auth.register({ username: 'viewer', email: 'viewer@x.com', password: 'longenough1' });
    const first = await gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: 'limit one', outputFormat: 'png' },
      { userId: user.id }
    );
    const second = await gallery.saveGeneratedImages(
      [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
      { prompt: 'limit two', outputFormat: 'png' },
      { userId: user.id }
    );
    await gallery.setImagePublic(first.saved[0].id, { userId: user.id, isPublic: true });
    await gallery.setImagePublic(second.saved[0].id, { userId: user.id, isPublic: true });

    const liked = await gallery.likePublicImage(first.saved[0].id, { userId: viewer.id });
    assert.equal(liked.likeQuota.remaining, 0);

    await assert.rejects(
      () => gallery.likePublicImage(second.saved[0].id, { userId: viewer.id }),
      /daily like limit exceeded/
    );
  });
});

test('removeDanglingFile only deletes files under a user images directory', async () => {
  const userRoot = join(workDir, 'generated', 'users', user.id);
  const profilePath = join(userRoot, 'profile.txt');
  mkdirSync(userRoot, { recursive: true });
  writeFileSync(profilePath, 'not an image');

  await assert.rejects(
    () => gallery.removeDanglingFile(`users/${user.id}/profile.txt`),
    /only user-scoped image files/
  );
  await assert.rejects(
    () => gallery.removeDanglingFile(`users/${user.id}/images/../../profile.txt`),
    /invalid path/
  );
  assert.equal(existsSync(profilePath), true);

  const orphanPath = join(userRoot, 'images', 'dangling', 'orphan.png');
  mkdirSync(join(userRoot, 'images', 'dangling'), { recursive: true });
  writeFileSync(orphanPath, Buffer.from(PNG_BYTES));

  const removed = await gallery.removeDanglingFile(`users/${user.id}/images/dangling/orphan.png`);
  assert.equal(removed.path, `users/${user.id}/images/dangling/orphan.png`);
  assert.equal(existsSync(orphanPath), false);
});

test('gallery listing ignores db paths outside trusted image roots', async () => {
  const unsafeId = 'unsafe-path-row';
  const outsidePath = join(workDir, 'server.js');
  writeFileSync(outsidePath, Buffer.from(PNG_BYTES));
  db.images.insert({
    id: unsafeId,
    userId: user.id,
    createdAt: new Date().toISOString(),
    filename: 'server.js',
    path: '../server.js',
    mimeType: 'image/png',
    bytes: PNG_BYTES.length,
    isPublic: false,
    prompt: 'unsafe path',
    sourceType: 'legacy'
  });

  const mine = await gallery.listGallery({ userId: user.id, limit: 1000 });
  assert.equal(mine.items.some((item) => item.id === unsafeId), false);

  const orphans = await gallery.scanOrphans();
  assert.equal(
    orphans.missingFiles.some((item) => item.id === unsafeId && item.reason === 'invalid_path'),
    true
  );
});

test('galleryFileUrl refuses dot-segment stored paths', () => {
  assert.equal(gallery.galleryFileUrl('../server.js'), '');
  assert.equal(gallery.galleryFileUrl(`users/${user.id}/images/2026-04-25/a.png`).startsWith('/gallery-files/'), true);
});

test('scanOrphans reads image rows in bounded maintenance pages', async () => {
  const original = db.images.listAllForMaintenance;
  const calls = [];
  db.images.listAllForMaintenance = function patchedListAllForMaintenance(options = {}) {
    calls.push(options);
    return original.call(this, options);
  };

  try {
    await withEnv({
      GALLERY_MAINTENANCE_SCAN_PAGE_SIZE: '1',
      GALLERY_STAT_CONCURRENCY: '2'
    }, async () => {
      await gallery.saveGeneratedImages(
        [
          { b64_json: Buffer.from(PNG_BYTES).toString('base64') },
          { b64_json: Buffer.from(PNG_BYTES).toString('base64') }
        ],
        { prompt: 'paged maintenance scan', outputFormat: 'png' },
        { userId: user.id }
      );
      const result = await gallery.scanOrphans();
      assert.ok(Array.isArray(result.missingFiles));
      assert.ok(Array.isArray(result.danglingFiles));
    });
  } finally {
    db.images.listAllForMaintenance = original;
  }

  assert.ok(calls.length >= 2);
  assert.ok(calls.every((call) => call.limit === 1));
  assert.deepEqual(calls.slice(0, 3).map((call) => call.offset), [0, 1, 2]);
});

test('scanOrphans reports truncation when database scan reaches row cap', async () => {
  await withEnv({
    GALLERY_MAINTENANCE_SCAN_PAGE_SIZE: '1',
    GALLERY_ORPHAN_SCAN_MAX_DB_ROWS: '1'
  }, async () => {
    const result = await gallery.scanOrphans();
    assert.equal(result.truncated, true);
    assert.equal(result.truncationReason, 'max_db_rows');
    assert.equal(result.skippedDanglingScan, true);
    assert.equal(result.scan.dbRows, 1);
  });
});

test('scanOrphans caps recursive filesystem traversal', async () => {
  const danglingDir = join(workDir, 'generated', 'users', user.id, 'images', 'scan-limit');
  mkdirSync(danglingDir, { recursive: true });
  writeFileSync(join(danglingDir, 'dangling-a.png'), Buffer.from(PNG_BYTES));
  writeFileSync(join(danglingDir, 'dangling-b.png'), Buffer.from(PNG_BYTES));

  await withEnv({
    GALLERY_ORPHAN_SCAN_MAX_DB_ROWS: '100000',
    GALLERY_ORPHAN_SCAN_MAX_FILES: '1',
    GALLERY_ORPHAN_SCAN_MAX_DIRS: '1000',
    GALLERY_ORPHAN_SCAN_TIMEOUT_MS: '10000'
  }, async () => {
    const result = await gallery.scanOrphans();
    assert.equal(result.truncated, true);
    assert.equal(result.truncationReason, 'max_files');
    assert.equal(result.skippedDanglingScan, false);
    assert.equal(result.scan.files, 1);
    assert.ok(result.danglingFiles.length <= 1);
  });
});
