import { test } from 'node:test';
import assert from 'node:assert/strict';

import { publicInterfaceConfig } from '../services/interface-defaults.js';

test('publicInterfaceConfig exposes only key presence, not masked key fragments', () => {
  const config = publicInterfaceConfig({
    enabled: true,
    name: 'default',
    image: {
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-image-secret-123456',
      maskedApiKey: 'sk-i****3456',
      defaultModel: 'gpt-image-2'
    },
    chat: {
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-chat-secret-123456',
      maskedApiKey: 'sk-c****3456',
      defaultModel: 'gpt-5.5'
    }
  });

  assert.equal(config.image.apiKey, '');
  assert.equal(config.chat.apiKey, '');
  assert.equal(config.image.hasApiKey, true);
  assert.equal(config.chat.hasApiKey, true);
  assert.equal(Object.hasOwn(config.image, 'maskedApiKey'), false);
  assert.equal(Object.hasOwn(config.chat, 'maskedApiKey'), false);
});
