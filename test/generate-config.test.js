import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const ENV_KEYS = [
  'IMAGE_GENERATION_TIMEOUT_MS',
  'GENERATE_STREAM_HEARTBEAT_MS',
  'MAX_IMAGES_PER_REQUEST'
];

async function withEnv(patch, fn) {
  const prev = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) process.env[key] = String(value);
  }
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test('generate numeric environment values fall back when invalid or non-positive', async () => {
  await withEnv({
    IMAGE_GENERATION_TIMEOUT_MS: 'disabled',
    GENERATE_STREAM_HEARTBEAT_MS: '0',
    MAX_IMAGES_PER_REQUEST: 'not-a-number'
  }, async () => {
    const mod = await import(`../routes/generate.js?invalid-env=${Date.now()}`);
    assert.equal(mod.getImageGenerationTimeoutMs(), 10 * 60 * 1000);
    assert.equal(mod.getGenerateStreamHeartbeatMs(), 15 * 1000);
    assert.equal(mod.getMaxImagesPerRequest(), 4);
  });
});

test('generate numeric environment values accept positive integers', async () => {
  await withEnv({
    IMAGE_GENERATION_TIMEOUT_MS: '12345',
    GENERATE_STREAM_HEARTBEAT_MS: '2345',
    MAX_IMAGES_PER_REQUEST: '3'
  }, async () => {
    const mod = await import(`../routes/generate.js?valid-env=${Date.now()}`);
    assert.equal(mod.getImageGenerationTimeoutMs(), 12345);
    assert.equal(mod.getGenerateStreamHeartbeatMs(), 2345);
    assert.equal(mod.getMaxImagesPerRequest(), 3);
  });
});
