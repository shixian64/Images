import assert from 'node:assert/strict';
import test from 'node:test';

import {
  promptHistoryExamplesHtml,
  promptHistoryItemHtml,
  promptHistoryListState,
  promptHistorySummaryHtml
} from '../public/modules/prompt-history-view.js';

const historyItem = {
  id: 'h"><script>',
  title: '<title>',
  prompt: '<b>prompt</b>',
  source: 'builder',
  tags: ['<tag>', '风格'],
  pinned: true,
  isPublic: true,
  updatedAt: 'not-a-date',
  useCount: 2,
  meta: {
    model: 'model"><x>',
    size: '1024x1024',
    quality: '<quality>',
    previewImages: ['https://example.test/a.png?x=<bad>']
  }
};

test('prompt history view renders summary counters', () => {
  const html = promptHistorySummaryHtml([
    historyItem,
    { source: 'studio', isPublic: false, pinned: false },
    { source: 'builder', isPublic: false, pinned: true }
  ], [historyItem]);

  assert.match(html, /共 3 条 · 显示 1/);
  assert.match(html, /构造器 2/);
  assert.match(html, /生成页 1/);
  assert.match(html, /已公开 1/);
  assert.match(html, /固定 2/);
});

test('prompt history view escapes example image markup', () => {
  const html = promptHistoryExamplesHtml(historyItem);

  assert.match(html, /data-history-preview="https:\/\/example\.test\/a\.png\?x=&lt;bad&gt;"/);
  assert.match(html, /alt="&lt;title&gt; 示例图 1"/);
  assert.doesNotMatch(html, /<bad>/);
});

test('prompt history view renders escaped item cards', () => {
  const html = promptHistoryItemHtml(historyItem);

  assert.match(html, /data-id="h&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /class="prompt-history-item is-pinned"/);
  assert.match(html, /&lt;title&gt;/);
  assert.match(html, /&lt;b&gt;prompt&lt;\/b&gt;/);
  assert.match(html, /&lt;tag&gt;/);
  assert.match(html, /已固定/);
  assert.match(html, /已公开/);
  assert.match(html, /使用 2 次/);
  assert.match(html, /示例图 1 张/);
  assert.match(html, /model&quot;&gt;&lt;x&gt; · 1024x1024 · &lt;quality&gt;/);
  assert.match(html, /data-action="clear-examples"/);
  assert.match(html, />取消公开<\/button>/);
  assert.match(html, />取消固定<\/button>/);

  assert.doesNotMatch(html, /<b>prompt<\/b>/);
  assert.doesNotMatch(html, /<script>/);
});

test('prompt history list state renders empty and populated lists', () => {
  const empty = promptHistoryListState([]);
  assert.equal(empty.empty, true);
  assert.match(empty.html, /没有匹配的历史提示词/);

  const populated = promptHistoryListState([historyItem]);
  assert.equal(populated.empty, false);
  assert.match(populated.html, /prompt-history-item/);
});
