import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let promptExamples;
let user;

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-prompt-example-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  promptExamples = await import('../services/prompt-example-images.js');

  db.migrate();
  user = auth.register({ username: 'prompt_example_owner', email: 'prompt-example@x.com', password: 'longenough1' });
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('savePromptExampleImage stores uploaded image as prompt example', async () => {
  const image = await promptExamples.savePromptExampleImage({
    userId: user.id,
    file: {
      fieldName: 'image',
      filename: 'sample.png',
      contentType: 'image/png',
      buffer: PNG_BYTES
    },
    title: 'Sample prompt',
    prompt: 'draw a sample'
  });

  assert.match(image.url, /^\/prompt-example-files\/users\//);
  assert.match(image.path, /\/images\/prompt-examples\//);
  assert.equal(image.mimeType, 'image/png');
  assert.equal(existsSync(join(workDir, 'generated', ...image.path.split('/'))), true);

  const row = db.images.findById(image.id);
  assert.equal(row.source_type, 'prompt_example');
  assert.equal(row.user_id, user.id);
  assert.equal(row.prompt, 'draw a sample');
});

test('savePromptExampleImage rejects non-image payloads', async () => {
  await assert.rejects(
    () => promptExamples.savePromptExampleImage({
      userId: user.id,
      file: {
        fieldName: 'image',
        filename: 'fake.png',
        contentType: 'image/png',
        buffer: Buffer.from('<html></html>')
      }
    }),
    /PNG、JPEG 或 WebP/
  );
});
