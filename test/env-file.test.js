import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadEnvFile, parseEnvFile } from '../scripts/env-file.js';

test('parseEnvFile handles comments, exports, and quoted values', () => {
  const parsed = parseEnvFile(`
    # comment
    PORT=9999
    export NODE_ENV=production
    EMPTY=
    HASH=abc#123
    COMMENTED=value # ignored
    SINGLE='a # b'
    DOUBLE="line\\nnext"
    BAD-NAME=skip
  `);

  assert.equal(parsed.get('PORT'), '9999');
  assert.equal(parsed.get('NODE_ENV'), 'production');
  assert.equal(parsed.get('EMPTY'), '');
  assert.equal(parsed.get('HASH'), 'abc#123');
  assert.equal(parsed.get('COMMENTED'), 'value');
  assert.equal(parsed.get('SINGLE'), 'a # b');
  assert.equal(parsed.get('DOUBLE'), 'line\nnext');
  assert.equal(parsed.has('BAD-NAME'), false);
});

test('loadEnvFile does not override existing environment by default', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'image-studio-env-'));
  try {
    const file = path.join(dir, '.env');
    await writeFile(file, 'A=from-file\nB=two\n', 'utf8');
    const env = { A: 'existing' };

    const result = loadEnvFile(file, { env });

    assert.deepEqual(result, { loaded: true, count: 1 });
    assert.deepEqual(env, { A: 'existing', B: 'two' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadEnvFile reports missing optional env files', () => {
  const result = loadEnvFile(path.join(tmpdir(), 'missing-image-studio.env'), { env: {} });
  assert.deepEqual(result, { loaded: false, count: 0 });
});
