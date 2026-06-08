import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
const prevSecret = process.env.IMAGE_STUDIO_SECRET_KEY;

after(() => {
  if (prevCwd) process.chdir(prevCwd);
  if (prevSecret === undefined) delete process.env.IMAGE_STUDIO_SECRET_KEY;
  else process.env.IMAGE_STUDIO_SECRET_KEY = prevSecret;
  try { if (workDir) rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('system default interface API keys are encrypted at rest when a master key is configured', async () => {
  prevCwd = process.cwd();
  process.env.IMAGE_STUDIO_SECRET_KEY = 'interface-storage-test-secret';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-interface-secret-'));
  process.chdir(workDir);

  const db = await import('../services/db.js');
  const interfaces = await import('../services/interface-defaults.js');
  db.migrate();

  interfaces.setGlobalInterfaceConfig({
    enabled: true,
    image: {
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-image-storage-secret',
      defaultModel: 'gpt-image-2'
    },
    chat: {
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-chat-storage-secret',
      defaultModel: 'gpt-5.5'
    }
  }, 'test');

  const runtime = interfaces.getGlobalInterfaceConfig();
  assert.equal(runtime.image.apiKey, 'sk-image-storage-secret');
  assert.equal(runtime.chat.apiKey, 'sk-chat-storage-secret');

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    const row = sqlite.prepare('SELECT value FROM system_settings WHERE key = ?').get(interfaces.interfaceDefaultsKey());
    assert.ok(row?.value);
    assert.equal(row.value.includes('sk-image-storage-secret'), false);
    assert.equal(row.value.includes('sk-chat-storage-secret'), false);
    assert.match(row.value, /enc:v1:/);
  } finally {
    sqlite.close();
  }
});
