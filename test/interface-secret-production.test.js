import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let prevEnv;
let db;
let interfaces;

const ENV_KEYS = [
  'NODE_ENV',
  'IMAGE_STUDIO_SECRET_KEY',
  'SECRETS_MASTER_KEY',
  'APP_SECRET_KEY',
  'ALLOW_PLAINTEXT_SYSTEM_KEYS'
];

before(async () => {
  prevCwd = process.cwd();
  prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'production';
  delete process.env.IMAGE_STUDIO_SECRET_KEY;
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;

  workDir = mkdtempSync(join(tmpdir(), 'image-studio-interface-secret-prod-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  interfaces = await import('../services/interface-defaults.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  for (const [key, value] of Object.entries(prevEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('production refuses plaintext system interface keys without a master key', () => {
  assert.throws(
    () => interfaces.setGlobalInterfaceConfig({
      image: {
        baseUrl: 'https://api.example.test',
        apiKey: 'sk-prod-image-secret',
        defaultModel: 'gpt-image-2'
      }
    }, 'test'),
    /IMAGE_STUDIO_SECRET_KEY is required/
  );
  assert.equal(db.systemSettings.get(interfaces.interfaceDefaultsKey()), null);

  process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS = '1';
  const next = interfaces.setGlobalInterfaceConfig({
    image: {
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-prod-image-secret',
      defaultModel: 'gpt-image-2'
    }
  }, 'test');
  assert.equal(next.image.apiKey, 'sk-prod-image-secret');
  assert.equal(db.systemSettings.get(interfaces.interfaceDefaultsKey()).image.apiKey, 'sk-prod-image-secret');
});
