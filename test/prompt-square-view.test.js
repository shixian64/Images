import assert from 'node:assert/strict';
import test from 'node:test';

import { setLocale } from '../public/modules/i18n.js';
import {
  promptSquareCardHtml,
  promptSquareErrorHtml,
  promptSquareListState,
  promptSquareSummaryHtml,
  promptSquareTagCloudHtml
} from '../public/modules/prompt-square-view.js';

const squareItem = {
  id: 'sq"><script>',
  title: '<title>',
  prompt: '<b>draw</b>',
  source: 'seed',
  tags: ['<tag>', '\u98ce\u683c'],
  owner: { id: 'me', username: '<owner>' },
  publishedAt: 'not-a-date',
  useCount: 3,
  meta: {
    sref: '<sref>',
    sourceHot: '<hot>',
    model: 'model"><x>',
    size: '1024x1024',
    quality: '<quality>',
    previewImages: ['https://example.test/p.png?x=<bad>']
  }
};

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('prompt square view renders escaped tag cloud and summary', () => {
  const tagsHtml = promptSquareTagCloudHtml([squareItem], { selectedTag: '<tag>' });
  assert.match(tagsHtml, />\u6240\u6709\u98ce\u683c<\/button>/);
  assert.match(tagsHtml, /data-square-tag="&lt;tag&gt;"/);
  assert.match(tagsHtml, /prompt-square-tag active" type="button" data-square-tag="&lt;tag&gt;"/);
  assert.doesNotMatch(tagsHtml, /data-square-tag="<tag>"/);

  const fallbackHtml = promptSquareTagCloudHtml([squareItem], { selectedTag: 'missing' });
  assert.match(fallbackHtml, /prompt-square-tag active" type="button" data-square-tag="all"/);

  const summaryHtml = promptSquareSummaryHtml([
    squareItem,
    { owner: { id: 'other' }, useCount: 4 }
  ], [squareItem], { currentUserId: 'me' });
  assert.match(summaryHtml, /\u5e7f\u573a\u5171 2 \u6761 \u00b7 \u5f53\u524d\u663e\u793a 1/);
  assert.match(summaryHtml, /\u6211\u7684\u516c\u5f00 1/);
  assert.match(summaryHtml, /\u7d2f\u8ba1\u4f7f\u7528 7/);
});

test('prompt square view renders loading, empty, and error states', () => {
  const loading = promptSquareListState([], { loading: true, loaded: false });
  assert.equal(loading.empty, true);
  assert.match(loading.html, /\u6b63\u5728\u52a0\u8f7d\u63d0\u793a\u8bcd\u5e7f\u573a/);

  const empty = promptSquareListState([], { loading: false, loaded: true });
  assert.equal(empty.empty, true);
  assert.match(empty.html, /\u8fd8\u6ca1\u6709\u5339\u914d\u7684\u516c\u5f00\u63d0\u793a\u8bcd/);

  const errorHtml = promptSquareErrorHtml(new Error('<boom>'));
  assert.match(errorHtml, /\u63d0\u793a\u8bcd\u5e7f\u573a\u52a0\u8f7d\u5931\u8d25\uff1a&lt;boom&gt;/);
  assert.doesNotMatch(errorHtml, /<boom>/);
});

test('prompt square view renders escaped cards and owner controls', () => {
  const card = promptSquareCardHtml(squareItem, 1, { currentUserId: 'me' });

  assert.match(card, /data-id="sq&quot;&gt;&lt;script&gt;"/);
  assert.match(card, /#2/);
  assert.match(card, /&lt;title&gt;/);
  assert.match(card, /&lt;b&gt;draw&lt;\/b&gt;/);
  assert.match(card, /&lt;tag&gt;/);
  assert.match(card, />\u7cbe\u9009<\/span>/);
  assert.match(card, /\u4f5c\u8005 &lt;owner&gt;/);
  assert.match(card, /SREF &lt;sref&gt; \u00b7 \u6765\u6e90\u70ed\u5ea6 &lt;hot&gt; \u00b7 model&quot;&gt;&lt;x&gt; \u00b7 1024x1024 \u00b7 &lt;quality&gt;/);
  assert.match(card, /data-square-preview="https:\/\/example\.test\/p\.png\?x=&lt;bad&gt;"/);
  assert.match(card, /aria-label="\u6253\u5f00 &lt;title&gt; \u793a\u4f8b\u56fe"/);
  assert.match(card, /\u6211\u7684\u516c\u5f00/);
  assert.match(card, /data-action="unpublish-square"/);

  assert.doesNotMatch(card, /<b>draw<\/b>/);
  assert.doesNotMatch(card, /<script>/);
});

test('prompt square view marks truncated prompt previews', () => {
  const card = promptSquareCardHtml({
    ...squareItem,
    promptTruncated: true,
    promptLength: 4321
  }, 0, { currentUserId: 'other' });

  assert.match(card, /\u9884\u89c8\u5df2\u622a\u65ad \u00b7 \u5b8c\u6574 4321 \u5b57/);
  assert.match(card, /\u64cd\u4f5c\u65f6\u4f1a\u81ea\u52a8\u52a0\u8f7d\u5b8c\u6574\u63d0\u793a\u8bcd/);
});

test('prompt square list state renders populated lists', () => {
  const view = promptSquareListState([squareItem], { currentUserId: 'other', loaded: true });
  assert.equal(view.empty, false);
  assert.match(view.html, /prompt-square-card/);
  assert.doesNotMatch(view.html, /\u6211\u7684\u516c\u5f00/);
  assert.doesNotMatch(view.html, /unpublish-square/);
});

test('prompt square view renders English locale text', () => {
  setLocale('en-US');

  const tagsHtml = promptSquareTagCloudHtml([squareItem], { selectedTag: 'all' });
  assert.match(tagsHtml, />All styles<\/button>/);

  const summaryHtml = promptSquareSummaryHtml([
    squareItem,
    { owner: { id: 'other' }, useCount: 4 }
  ], [squareItem], { currentUserId: 'me' });
  assert.match(summaryHtml, /Square 2 total \u00b7 1 shown/);
  assert.match(summaryHtml, /My public 1/);
  assert.match(summaryHtml, /Total uses 7/);
  assert.match(summaryHtml, /Style tags \/ popularity sort/);

  const loading = promptSquareListState([], { loading: true, loaded: false });
  assert.match(loading.html, /Loading Prompt Square/);

  const empty = promptSquareListState([], { loading: false, loaded: true });
  assert.match(empty.html, /No matching public prompts/);

  const errorHtml = promptSquareErrorHtml(new Error('<boom>'));
  assert.match(errorHtml, /Prompt Square failed to load: &lt;boom&gt;/);

  const card = promptSquareCardHtml(squareItem, 1, { currentUserId: 'me' });
  assert.match(card, />Featured<\/span>/);
  assert.match(card, /Author &lt;owner&gt;/);
  assert.match(card, /SREF &lt;sref&gt; \u00b7 Source heat &lt;hot&gt; \u00b7 model&quot;&gt;&lt;x&gt; \u00b7 1024x1024 \u00b7 &lt;quality&gt;/);
  assert.match(card, /aria-label="Open &lt;title&gt; example image"/);
  assert.match(card, /alt="&lt;title&gt; example image"/);
  assert.match(card, /My public/);
  assert.match(card, /Used 3 times/);
  assert.match(card, />Use<\/button>/);
  assert.match(card, />Copy<\/button>/);
  assert.match(card, />Save to history<\/button>/);
  assert.match(card, />Unpublish<\/button>/);
});
