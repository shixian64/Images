import assert from 'node:assert/strict';
import test from 'node:test';

import {
  endpointTestResultView,
  profileKeyStatus,
  profileListHtml,
  profileSummaryHtml,
  systemDefaultCardHtml
} from '../public/modules/profiles-view.js';

test('profiles view formats key and endpoint test status', () => {
  assert.equal(profileKeyStatus({ hasApiKey: true }), '已配置');
  assert.equal(profileKeyStatus({ hasApiKey: false }), '未配置');
  assert.equal(profileKeyStatus({}), '读取中');

  assert.deepEqual(endpointTestResultView({ testStatus: 'unknown' }), { state: 'idle', text: '未测试' });
  assert.deepEqual(endpointTestResultView({ testStatus: 'ok', testLatencyMs: 123 }), { state: 'ok', text: 'OK · 123ms' });
  assert.deepEqual(endpointTestResultView({ testStatus: 'busy' }), { state: 'busy', text: '测试中…' });
  assert.deepEqual(endpointTestResultView({ testStatus: 'err', testError: '<boom>' }), { state: 'err', text: '失败 · <boom>' });
});

test('profiles view renders escaped system default card', () => {
  const html = systemDefaultCardHtml({ name: '<system>', status: 'paused' }, {
    image: { baseUrl: 'https://image.test/?q=<bad>', defaultModel: 'img"><x>', hasApiKey: true },
    chat: { baseUrl: 'https://chat.test/?q=<bad>', defaultModel: 'chat"><x>', hasApiKey: false },
    systemMode: false,
    loaded: false
  });

  assert.match(html, /&lt;system&gt;/);
  assert.match(html, /已停用/);
  assert.match(html, /读取中…/);
  assert.match(html, /个人覆盖中/);
  assert.match(html, /https:\/\/image\.test\/\?q=&lt;bad&gt;/);
  assert.match(html, /img&quot;&gt;&lt;x&gt;/);
  assert.match(html, /已配置/);
  assert.match(html, /https:\/\/chat\.test\/\?q=&lt;bad&gt;/);
  assert.match(html, /chat&quot;&gt;&lt;x&gt;/);
  assert.match(html, /未配置/);
  assert.doesNotMatch(html, /<system>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('profiles view renders escaped profile list', () => {
  const html = profileListHtml([
    { id: 'p"><script>', name: '<profile>' },
    { id: 'p2', name: 'Other' }
  ], { activeId: 'p"><script>' });

  assert.match(html, /profile-item active/);
  assert.match(html, /data-id="p&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /&lt;profile&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('profiles view renders escaped summary and masks custom keys', () => {
  const systemHtml = profileSummaryHtml([
    { status: 'active' },
    { status: 'draft' }
  ], {
    effectiveProfile: { name: '<current>' },
    image: { defaultModel: 'img"><x>', hasApiKey: true, apiKey: 'sk-image-secret' },
    chat: { defaultModel: 'chat"><x>', hasApiKey: false, apiKey: 'sk-chat-secret' },
    systemMode: true
  });

  assert.match(systemHtml, /系统默认/);
  assert.match(systemHtml, /个人接口数<\/span><strong>2/);
  assert.match(systemHtml, /启用接口<\/span><strong>1/);
  assert.match(systemHtml, /&lt;current&gt;/);
  assert.match(systemHtml, /img&quot;&gt;&lt;x&gt;/);
  assert.match(systemHtml, /chat&quot;&gt;&lt;x&gt;/);
  assert.match(systemHtml, /已配置/);
  assert.match(systemHtml, /未配置/);
  assert.doesNotMatch(systemHtml, /sk-image-secret/);

  const customHtml = profileSummaryHtml([], {
    effectiveProfile: { name: 'Custom' },
    image: { defaultModel: 'img', apiKey: 'sk-image-secret' },
    chat: { defaultModel: 'chat', apiKey: 'sk-chat-secret' },
    systemMode: false
  });
  assert.match(customHtml, /个人覆盖/);
  assert.match(customHtml, /sk-i••••cret/);
  assert.match(customHtml, /sk-c••••cret/);
  assert.doesNotMatch(customHtml, /sk-image-secret/);
  assert.doesNotMatch(customHtml, /sk-chat-secret/);
});
