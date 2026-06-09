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
let secrets;

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
  process.env.IMAGE_STUDIO_SECRET_KEY = 'old-interface-master-secret';
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;

  workDir = mkdtempSync(join(tmpdir(), 'image-studio-interface-secret-rotation-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  interfaces = await import('../services/interface-defaults.js');
  secrets = await import('../services/secrets.js');
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

test('system default interface API keys can be rotated to a new master key', () => {
  interfaces.setGlobalInterfaceConfig({
    enabled: true,
    image: {
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-image-rotation-secret',
      defaultModel: 'gpt-image-2'
    },
    chat: {
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-chat-rotation-secret',
      defaultModel: 'gpt-5.5'
    }
  }, 'test');

  const beforeStored = db.systemSettings.get(interfaces.interfaceDefaultsKey());
  assert.match(beforeStored.image.apiKey, /^enc:v1:/);
  assert.match(beforeStored.chat.apiKey, /^enc:v1:/);

  const result = interfaces.rotateGlobalInterfaceSecrets({
    currentSecret: 'old-interface-master-secret',
    nextSecret: 'new-interface-master-secret',
    updatedBy: 'rotation-test'
  });
  assert.equal(result.rotated, 2);

  const afterStored = db.systemSettings.get(interfaces.interfaceDefaultsKey());
  assert.notEqual(afterStored.image.apiKey, beforeStored.image.apiKey);
  assert.notEqual(afterStored.chat.apiKey, beforeStored.chat.apiKey);
  assert.equal(afterStored.updatedBy, 'rotation-test');
  assert.equal(
    secrets.unprotectSecretWithMaster(afterStored.image.apiKey, 'new-interface-master-secret'),
    'sk-image-rotation-secret'
  );
  assert.equal(
    secrets.unprotectSecretWithMaster(afterStored.chat.apiKey, 'new-interface-master-secret'),
    'sk-chat-rotation-secret'
  );
  assert.throws(() => secrets.unprotectSecretWithMaster(afterStored.image.apiKey, 'old-interface-master-secret'));

  process.env.IMAGE_STUDIO_SECRET_KEY = 'new-interface-master-secret';
  const runtime = interfaces.getGlobalInterfaceConfig();
  assert.equal(runtime.image.apiKey, 'sk-image-rotation-secret');
  assert.equal(runtime.chat.apiKey, 'sk-chat-rotation-secret');
});
