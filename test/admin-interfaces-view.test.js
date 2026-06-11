import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTERFACE_BASE_URL,
  globalEndpointConfig,
  globalEndpointTestView,
  globalInterfaceSummaryHtml,
  interfaceKeyState
} from '../public/modules/admin-interfaces-view.js';

test('admin interfaces view normalizes endpoint defaults and key state', () => {
  assert.equal(DEFAULT_INTERFACE_BASE_URL, 'https://api.openai.com');
  assert.deepEqual(globalEndpointConfig(null, 'image'), {
    baseUrl: DEFAULT_INTERFACE_BASE_URL,
    apiKey: '',
    hasApiKey: null,
    maskedApiKey: '',
    defaultModel: 'gpt-image-2',
    testStatus: 'unknown',
    testLatencyMs: null,
    testedAt: null,
    testError: '',
    secretError: ''
  });
  assert.equal(globalEndpointConfig({}, 'chat').defaultModel, 'gpt-5.5');
  assert.equal(globalEndpointConfig({ image: { hasApiKey: 1, baseUrl: 'https://x', defaultModel: 'm' } }, 'image').hasApiKey, true);
  assert.equal(interfaceKeyState({ hasApiKey: true }), '已配置');
  assert.equal(interfaceKeyState({ hasApiKey: false }), '未配置');
  assert.equal(interfaceKeyState({ hasApiKey: null }), '未知');
});

test('admin interfaces view formats endpoint test state', () => {
  assert.deepEqual(globalEndpointTestView({ testStatus: 'unknown' }), { state: 'idle', text: '未测试' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'ok', testLatencyMs: 123 }), { state: 'ok', text: 'OK · 123ms' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'busy' }), { state: 'busy', text: '测试中…' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'failed', secretError: '<secret>' }), { state: 'err', text: '失败 · <secret>' });
});

test('admin interfaces view renders escaped summary', () => {
  assert.match(globalInterfaceSummaryHtml(null), /尚未加载/);
  const html = globalInterfaceSummaryHtml({
    enabled: false,
    name: '<name>',
    image: {
      hasApiKey: true,
      defaultModel: '<image-model>'
    },
    chat: {
      hasApiKey: false,
      defaultModel: '<chat-model>'
    }
  });

  assert.match(html, /停用/);
  assert.match(html, /&lt;name&gt;/);
  assert.match(html, /生图 Key：已配置/);
  assert.match(html, /对话 Key：未配置/);
  assert.match(html, /&lt;image-model&gt;/);
  assert.match(html, /&lt;chat-model&gt;/);
  assert.doesNotMatch(html, /<name>/);
  assert.doesNotMatch(html, /<image-model>/);
});
