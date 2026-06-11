import assert from 'node:assert/strict';
import test from 'node:test';

import { setLocale } from '../public/modules/i18n.js';
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
  tags: ['<tag>', '\u98ce\u683c'],
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

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('prompt history view renders summary counters', () => {
  const html = promptHistorySummaryHtml([
    historyItem,
    { source: 'studio', isPublic: false, pinned: false },
    { source: 'builder', isPublic: false, pinned: true }
  ], [historyItem]);

  assert.match(html, /\u5171 3 \u6761 \u00b7 \u663e\u793a 1/);
  assert.match(html, /\u6784\u9020\u5668 2/);
  assert.match(html, /\u751f\u6210\u9875 1/);
  assert.match(html, /\u5df2\u516c\u5f00 1/);
  assert.match(html, /\u56fa\u5b9a 2/);
});

test('prompt history view escapes example image markup', () => {
  const html = promptHistoryExamplesHtml(historyItem);

  assert.match(html, /aria-label="\u793a\u4f8b\u56fe"/);
  assert.match(html, /aria-label="\u9884\u89c8\u7b2c 1 \u5f20\u793a\u4f8b\u56fe"/);
  assert.match(html, /data-history-preview="https:\/\/example\.test\/a\.png\?x=&lt;bad&gt;"/);
  assert.match(html, /alt="&lt;title&gt; \u793a\u4f8b\u56fe 1"/);
  assert.doesNotMatch(html, /<bad>/);
});

test('prompt history view renders escaped item cards', () => {
  const html = promptHistoryItemHtml(historyItem);

  assert.match(html, /data-id="h&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /class="prompt-history-item is-pinned"/);
  assert.match(html, /&lt;title&gt;/);
  assert.match(html, /&lt;b&gt;prompt&lt;\/b&gt;/);
  assert.match(html, /&lt;tag&gt;/);
  assert.match(html, />\u6784\u9020\u5668<\/span>/);
  assert.match(html, /\u5df2\u56fa\u5b9a/);
  assert.match(html, /\u5df2\u516c\u5f00/);
  assert.match(html, /\u4f7f\u7528 2 \u6b21/);
  assert.match(html, /\u793a\u4f8b\u56fe 1 \u5f20/);
  assert.match(html, /model&quot;&gt;&lt;x&gt; \u00b7 1024x1024 \u00b7 &lt;quality&gt;/);
  assert.match(html, /data-action="clear-examples"/);
  assert.match(html, />\u53d6\u6d88\u516c\u5f00<\/button>/);
  assert.match(html, />\u53d6\u6d88\u56fa\u5b9a<\/button>/);

  assert.doesNotMatch(html, /<b>prompt<\/b>/);
  assert.doesNotMatch(html, /<script>/);
});

test('prompt history list state renders empty and populated lists', () => {
  const empty = promptHistoryListState([]);
  assert.equal(empty.empty, true);
  assert.match(empty.html, /\u6ca1\u6709\u5339\u914d\u7684\u5386\u53f2\u63d0\u793a\u8bcd/);

  const populated = promptHistoryListState([historyItem]);
  assert.equal(populated.empty, false);
  assert.match(populated.html, /prompt-history-item/);
});

test('prompt history view renders English locale text', () => {
  setLocale('en-US');

  const summary = promptHistorySummaryHtml([
    historyItem,
    { source: 'studio', isPublic: false, pinned: false },
    { source: 'builder', isPublic: false, pinned: true }
  ], [historyItem]);
  assert.match(summary, /3 total \u00b7 1 shown/);
  assert.match(summary, /Builder 2/);
  assert.match(summary, /Studio 1/);
  assert.match(summary, /Published 1/);
  assert.match(summary, /Pinned 2/);

  const empty = promptHistoryListState([]);
  assert.match(empty.html, /No matching prompt history/);

  const examples = promptHistoryExamplesHtml(historyItem);
  assert.match(examples, /aria-label="Example images"/);
  assert.match(examples, /aria-label="Preview example image 1"/);
  assert.match(examples, /alt="&lt;title&gt; example image 1"/);

  const item = promptHistoryItemHtml(historyItem);
  assert.match(item, />Builder<\/span>/);
  assert.match(item, /Pinned/);
  assert.match(item, /Published/);
  assert.match(item, /Used 2 times/);
  assert.match(item, /Example images 1/);
  assert.match(item, />Use<\/button>/);
  assert.match(item, />Copy<\/button>/);
  assert.match(item, />Load builder<\/button>/);
  assert.match(item, />Upload example image<\/button>/);
  assert.match(item, />Clear example images<\/button>/);
  assert.match(item, />Unpublish<\/button>/);
  assert.match(item, />Unpin<\/button>/);
  assert.match(item, />Delete<\/button>/);
});
