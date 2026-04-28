import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adminInterfaceConfig, publicInterfaceConfig } from '../services/interface-defaults.js';

const skLike = (suffix) => ['sk', suffix].join('-');

function sampleConfig() {
  const imageApiKey = skLike('image-secret-123456');
  const chatApiKey = skLike('chat-secret-123456');

  return {
    enabled: true,
    name: 'default',
    image: {
      baseUrl: 'https://api.example.com',
      apiKey: imageApiKey,
      maskedApiKey: 'sk-i****3456',
      defaultModel: 'gpt-image-2',
      testStatus: 'err',
      testLatencyMs: 123,
      testedAt: '2026-04-26T00:00:00.000Z',
      testError: `upstream leaked ${imageApiKey}`
    },
    chat: {
      baseUrl: 'https://api.example.com',
      apiKey: chatApiKey,
      maskedApiKey: 'sk-c****3456',
      defaultModel: 'gpt-5.5',
      testStatus: 'ok',
      testLatencyMs: 45,
      testedAt: '2026-04-26T00:00:01.000Z',
      testError: ''
    }
  };
}

test('publicInterfaceConfig exposes only key presence, not masked key fragments or probe details', () => {
  const config = publicInterfaceConfig(sampleConfig());

  assert.equal(config.image.apiKey, '');
  assert.equal(config.chat.apiKey, '');
  assert.equal(config.image.hasApiKey, true);
  assert.equal(config.chat.hasApiKey, true);
  assert.equal(Object.hasOwn(config.image, 'maskedApiKey'), false);
  assert.equal(Object.hasOwn(config.chat, 'maskedApiKey'), false);
  assert.equal(Object.hasOwn(config.image, 'testError'), false);
  assert.equal(Object.hasOwn(config.image, 'testLatencyMs'), false);
  assert.equal(Object.hasOwn(config.image, 'testedAt'), false);
  assert.equal(config.image.testStatus, 'err');
});

test('adminInterfaceConfig keeps probe details while redacting raw keys', () => {
  const config = adminInterfaceConfig(sampleConfig());

  assert.equal(config.image.apiKey, '');
  assert.equal(config.image.hasApiKey, true);
  assert.equal(config.image.testError, 'upstream leaked sk-i****3456');
  assert.equal(config.image.testLatencyMs, 123);
  assert.equal(config.image.testedAt, '2026-04-26T00:00:00.000Z');
});

test('interface defaults reject base URLs with embedded credentials', () => {
  const config = sampleConfig();
  config.image.baseUrl = 'https://user:pass@api.example.com';

  assert.throws(
    () => adminInterfaceConfig(config),
    /baseUrl must not include credentials/
  );
});
