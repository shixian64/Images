import assert from 'node:assert/strict';
import test from 'node:test';

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
  tags: ['<tag>', '风格'],
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

test('prompt square view renders escaped tag cloud and summary', () => {
  const tagsHtml = promptSquareTagCloudHtml([squareItem], { selectedTag: '<tag>' });
  assert.match(tagsHtml, /data-square-tag="&lt;tag&gt;"/);
  assert.match(tagsHtml, /prompt-square-tag active" type="button" data-square-tag="&lt;tag&gt;"/);
  assert.doesNotMatch(tagsHtml, /data-square-tag="<tag>"/);

  const fallbackHtml = promptSquareTagCloudHtml([squareItem], { selectedTag: 'missing' });
  assert.match(fallbackHtml, /prompt-square-tag active" type="button" data-square-tag="all"/);

  const summaryHtml = promptSquareSummaryHtml([
    squareItem,
    { owner: { id: 'other' }, useCount: 4 }
  ], [squareItem], { currentUserId: 'me' });
  assert.match(summaryHtml, /广场共 2 条 · 当前显示 1/);
  assert.match(summaryHtml, /我的公开 1/);
  assert.match(summaryHtml, /累计使用 7/);
});

test('prompt square view renders loading, empty, and error states', () => {
  const loading = promptSquareListState([], { loading: true, loaded: false });
  assert.equal(loading.empty, true);
  assert.match(loading.html, /正在加载提示词广场/);

  const empty = promptSquareListState([], { loading: false, loaded: true });
  assert.equal(empty.empty, true);
  assert.match(empty.html, /还没有匹配的公开提示词/);

  const errorHtml = promptSquareErrorHtml(new Error('<boom>'));
  assert.match(errorHtml, /提示词广场加载失败：&lt;boom&gt;/);
  assert.doesNotMatch(errorHtml, /<boom>/);
});

test('prompt square view renders escaped cards and owner controls', () => {
  const card = promptSquareCardHtml(squareItem, 1, { currentUserId: 'me' });

  assert.match(card, /data-id="sq&quot;&gt;&lt;script&gt;"/);
  assert.match(card, /#2/);
  assert.match(card, /&lt;title&gt;/);
  assert.match(card, /&lt;b&gt;draw&lt;\/b&gt;/);
  assert.match(card, /&lt;tag&gt;/);
  assert.match(card, /作者 &lt;owner&gt;/);
  assert.match(card, /SREF &lt;sref&gt; · 来源热度 &lt;hot&gt; · model&quot;&gt;&lt;x&gt; · 1024x1024 · &lt;quality&gt;/);
  assert.match(card, /data-square-preview="https:\/\/example\.test\/p\.png\?x=&lt;bad&gt;"/);
  assert.match(card, /aria-label="打开 &lt;title&gt; 示例图"/);
  assert.match(card, /我的公开/);
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

  assert.match(card, /预览已截断 · 完整 4321 字/);
  assert.match(card, /操作时会自动加载完整提示词/);
});

test('prompt square list state renders populated lists', () => {
  const view = promptSquareListState([squareItem], { currentUserId: 'other', loaded: true });
  assert.equal(view.empty, false);
  assert.match(view.html, /prompt-square-card/);
  assert.doesNotMatch(view.html, /我的公开/);
  assert.doesNotMatch(view.html, /unpublish-square/);
});
