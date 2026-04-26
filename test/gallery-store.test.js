import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let gallery;
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

function response(bytes, { status = 200, headers = {} } = {}) {
  return new Response(bytes, { status, headers });
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

test('saveGeneratedImages downloads URL images with redirect disabled', async () => {
  let seenOptions = null;
  const result = await gallery.saveGeneratedImages(
    [{ url: 'https://example.com/image.png' }],
    { prompt: 'x', outputFormat: 'png' },
    {
      userId: user.id,
      fetchImpl: async (_url, options) => {
        seenOptions = options;
        return response(PNG_BYTES, {
          headers: { 'content-type': 'image/png', 'content-length': String(PNG_BYTES.length) }
        });
      }
    }
  );

  assert.equal(result.saved.length, 1);
  assert.equal(seenOptions.redirect, 'manual');
  assert.equal(seenOptions.method, 'GET');
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
