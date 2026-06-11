import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTERFACE_BASE_URL,
  globalEndpointConfig,
  globalEndpointTestView,
  globalInterfaceErrorHtml,
  globalInterfaceSummaryHtml,
  interfaceKeyState
} from '../public/modules/admin-interfaces-view.js';
import { setLocale } from '../public/modules/i18n.js';

test('admin interfaces view normalizes endpoint defaults and key state', () => {
  setLocale('zh-CN');
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
  setLocale('zh-CN');
  assert.deepEqual(globalEndpointTestView({ testStatus: 'unknown' }), { state: 'idle', text: '未测试' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'ok', testLatencyMs: 123 }), { state: 'ok', text: 'OK · 123ms' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'busy' }), { state: 'busy', text: '测试中…' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'failed', secretError: '<secret>' }), { state: 'err', text: '失败 · <secret>' });
});

test('admin interfaces view renders escaped summary', () => {
  setLocale('zh-CN');
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

test('admin interfaces view renders escaped error chip', () => {
  setLocale('zh-CN');
  const html = globalInterfaceErrorHtml('上游异常 <script>alert(1)</script> "><bad>');

  assert.match(html, /class="chip error"/);
  assert.match(html, /上游异常 &lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;&gt;&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin interfaces view uses locale messages for summary chrome', () => {
  setLocale('en-US');
  assert.equal(interfaceKeyState({ hasApiKey: true }), 'Configured');
  assert.equal(interfaceKeyState({ hasApiKey: false }), 'Not configured');
  assert.equal(interfaceKeyState({ hasApiKey: null }), 'Unknown');
  assert.deepEqual(globalEndpointTestView({ testStatus: 'unknown' }), { state: 'idle', text: 'Not tested' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'busy' }), { state: 'busy', text: 'Testing…' });
  assert.deepEqual(globalEndpointTestView({ testStatus: 'failed' }), { state: 'err', text: 'Failed · Unknown error' });

  assert.match(globalInterfaceSummaryHtml(null), /Not loaded/);
  const html = globalInterfaceSummaryHtml({
    enabled: true,
    image: { hasApiKey: true, defaultModel: 'img' },
    chat: { hasApiKey: false, defaultModel: 'chat' }
  });
  assert.match(html, /Enabled/);
  assert.match(html, /System default/);
  assert.match(html, /Image key: Configured/);
  assert.match(html, /Chat key: Not configured/);
  assert.match(html, /Image model: img/);
  assert.match(html, /Chat model: chat/);
  assert.match(globalInterfaceErrorHtml('boom'), /Load failed: boom/);

  setLocale('zh-CN');
});
