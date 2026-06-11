import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comicResultCardHtml,
  comicResultsView,
  comicResultStatusLabel
} from '../public/modules/comic-view.js';

test('comic result view renders empty state', () => {
  const view = comicResultsView([], { panels: [] });
  assert.equal(view.empty, true);
  assert.match(view.html, /逐页生成图片/);
});

test('comic result view renders status, image, and job metadata', () => {
  assert.equal(comicResultStatusLabel('running'), '生成中');
  assert.equal(comicResultStatusLabel('custom'), 'custom');

  const html = comicResultCardHtml({
    status: 'succeeded',
    jobId: 'abcdef123456',
    item: { local_url: '/gallery/a.png' }
  }, 0, {
    storyboard: { panels: [{ beat: '开场' }], pageStoryboardEnabled: true },
    unitLabel: '页'
  });

  assert.match(html, /data-status="succeeded"/);
  assert.match(html, /第 1 页 完成/);
  assert.match(html, /abcdef12/);
  assert.match(html, /download="comic-panel-1\.png"/);
  assert.match(html, /alt="开场"/);
});

test('comic result view escapes dynamic text fields', () => {
  const html = comicResultCardHtml({
    status: 'failed"><script>',
    jobId: 'job<script>',
    error: '<img src=x onerror=alert(1)>',
    item: {}
  }, 0, {
    storyboard: { panels: [{ beat: '<b>标题</b>' }] },
    unitLabel: '<页>'
  });

  assert.doesNotMatch(html, /data-status="failed"><script>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /failed&quot;&gt;&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;标题&lt;\/b&gt;/);
  assert.match(html, /&lt;页&gt;/);
});
