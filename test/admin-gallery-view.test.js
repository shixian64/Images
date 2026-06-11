import assert from 'node:assert/strict';
import test from 'node:test';

import { setLocale } from '../public/modules/i18n.js';
import {
  adminGalleryErrorSummaryHtml,
  adminGalleryErrorTableHtml,
  adminGalleryFilterSummaryText,
  adminGalleryImageDetailView,
  adminGalleryKnownUsers,
  adminGalleryLoadingSummaryHtml,
  adminGalleryLoadingTableHtml,
  adminGalleryModelFilterOptionsHtml,
  adminGalleryOrphanScanHtml,
  adminGalleryPagerView,
  adminGalleryShortId,
  adminGalleryStatsHtml,
  adminGallerySummaryHtml,
  adminGalleryTableRowHtml,
  adminGalleryTableView,
  adminGalleryUserFilterOptionsHtml,
  adminGalleryUserLabel,
  formatAdminGalleryBytes,
  formatAdminGalleryTime
} from '../public/modules/admin-gallery-view.js';

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('admin gallery view formats common labels and summaries', () => {
  assert.equal(formatAdminGalleryBytes(0), '-');
  assert.equal(formatAdminGalleryBytes(512), '512 B');
  assert.equal(formatAdminGalleryBytes(1536), '1.5 KB');
  assert.equal(formatAdminGalleryTime('not-a-date'), '-');
  assert.equal(adminGalleryShortId('abcdefghi'), 'abcdefgh');
  assert.equal(adminGalleryShortId(''), '-');

  const users = [
    { id: 'u2', email: 'b@example.test' },
    { id: 'u1', username: 'Alice' }
  ];
  assert.deepEqual(adminGalleryKnownUsers(users).map((u) => u.id), ['u1', 'u2']);
  assert.equal(adminGalleryUserLabel('u1', users), 'Alice');
  assert.equal(adminGalleryUserLabel('missing-user-id', users), 'missing-');
  assert.match(adminGallerySummaryHtml({ total: 2, totalAll: 5, storage: 'x"><bad>' }), /x&quot;&gt;&lt;bad&gt;/);
  assert.equal(adminGalleryFilterSummaryText({ total: 2, page: 3, pageSize: 20 }), '第 3 页 · 每页 20');
  assert.equal(adminGalleryFilterSummaryText({ total: 0, page: 3, pageSize: 20 }), '');
});

test('admin gallery loading and error templates are centralized and escaped', () => {
  assert.match(adminGalleryLoadingSummaryHtml(), /正在加载图库/);
  assert.match(adminGalleryLoadingTableHtml(), /empty-state/);

  const summary = adminGalleryErrorSummaryHtml('bad <script>alert(1)</script>');
  const table = adminGalleryErrorTableHtml('bad <script>alert(1)</script>');
  assert.match(summary, /bad &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(table, /bad &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(summary, /<script>/);
  assert.doesNotMatch(table, /<script>/);
});

test('admin gallery stats escape dynamic fields', () => {
  const html = adminGalleryStatsHtml({
    total: '7"><bad>',
    savedToday: 2,
    totalBytes: 1024,
    topUsers: [{ userId: 'u1', bytes: 2048 }],
    topModels: [{ model: '<model>', count: '3"><bad>' }]
  }, {
    users: [{ id: 'u1', username: '<alice>' }]
  });

  assert.match(html, /总图数/);
  assert.match(html, /2\.0 KB/);
  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /&lt;model&gt;/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<model>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin gallery table renders empty and escaped populated states', () => {
  const empty = adminGalleryTableView([]);
  assert.equal(empty.empty, true);
  assert.match(empty.html, /暂无符合条件的图片/);

  const row = {
    id: 'img"><script>',
    userId: 'u1',
    thumbnailUrl: '/img"><bad>',
    revisedPrompt: '<alt>',
    filename: '<file>.png',
    path: 'users/<path>.png',
    model: '<model>',
    size: '1024x1024"><bad>',
    quality: '<quality>',
    outputFormat: '<png>',
    bytes: 1536,
    createdAt: 'bad-date',
    fileMissing: true,
    missingReason: '<missing>'
  };
  const html = adminGalleryTableRowHtml(row, {
    selectedIds: new Set(['img"><script>']),
    users: [{ id: 'u1', username: '<alice>' }]
  });

  assert.match(html, /data-image-id="img&quot;&gt;&lt;script&gt;" class="selected is-missing-file"/);
  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /&lt;file&gt;\.png/);
  assert.match(html, /users\/&lt;path&gt;\.png/);
  assert.match(html, /&lt;model&gt;/);
  assert.match(html, /1024x1024&quot;&gt;&lt;bad&gt; · &lt;quality&gt; · &lt;png&gt;/);
  assert.match(html, /缺失：&lt;missing&gt;/);
  assert.match(html, /1\.5 KB/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin gallery filter and pager views are deterministic', () => {
  const userOptions = adminGalleryUserFilterOptionsHtml([
    { id: 'u"><bad>', username: '<alice>' }
  ], 'u"><bad>');
  assert.match(userOptions, /value="u&quot;&gt;&lt;bad&gt;" selected/);
  assert.match(userOptions, /&lt;alice&gt; \(u&quot;&gt;&lt;bad&gt;\)/);
  assert.doesNotMatch(userOptions, /<alice>/);

  const modelOptions = adminGalleryModelFilterOptionsHtml(new Set(['<model>']), '<model>');
  assert.match(modelOptions, /value="&lt;model&gt;" selected/);
  assert.doesNotMatch(modelOptions, /<model>/);

  const hidden = adminGalleryPagerView({ total: 10, pageSize: 10, page: 1 });
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.html, '');

  const shown = adminGalleryPagerView({ total: 21, pageSize: 10, page: 2 });
  assert.equal(shown.hidden, false);
  assert.match(shown.html, /上一页/);
  assert.match(shown.html, /第 2 \/ 3 页/);
});

test('admin gallery detail and orphan scan escape dynamic fields', () => {
  const detail = adminGalleryImageDetailView({
    filename: '<file>.png',
    previewUrl: '/preview"><bad>',
    downloadUrl: '/download"><bad>',
    userId: 'u1',
    path: '/x/<path>.png',
    model: '<model>',
    size: '<size>',
    quality: '<quality>',
    outputFormat: '<png>',
    profileName: '<profile>',
    prompt: '<prompt>',
    promptTruncated: true,
    revisedPrompt: '<revised>',
    revisedPromptTruncated: true
  }, {
    users: [{ id: 'u1', username: '<alice>' }]
  });

  assert.equal(detail.title, '<file>.png');
  assert.match(detail.html, /href="\/download&quot;&gt;&lt;bad&gt;"/);
  assert.match(detail.html, /&lt;prompt&gt;/);
  assert.match(detail.html, /&lt;revised&gt;/);
  assert.match(detail.html, /提示词已按管理员列表预算裁剪/);
  assert.match(detail.html, /Revised Prompt 已按管理员列表预算裁剪/);
  assert.doesNotMatch(detail.html, /<prompt>/);
  assert.doesNotMatch(detail.html, /<bad>/);

  const orphan = adminGalleryOrphanScanHtml({
    missing: [{ id: 'img"><bad>', userId: 'u1', path: '<missing>.png', createdAt: 'bad' }],
    dangling: [{ userId: 'u1', path: '<dangling>.png', bytes: 2048, mtime: 'bad' }]
  }, {
    users: [{ id: 'u1', username: '<alice>' }]
  });

  assert.match(orphan, /&lt;missing&gt;\.png/);
  assert.match(orphan, /data-id="img&quot;&gt;&lt;bad&gt;"/);
  assert.match(orphan, /&lt;dangling&gt;\.png/);
  assert.match(orphan, /2\.0 KB/);
  assert.doesNotMatch(orphan, /<alice>/);
  assert.doesNotMatch(orphan, /<bad>/);
});

test('admin gallery view uses locale messages for view chrome', () => {
  setLocale('en-US');

  const stats = adminGalleryStatsHtml({
    total: 7,
    savedToday: 2,
    totalBytes: 2048,
    topUsers: [],
    topModels: []
  });
  assert.match(stats, /Total images/);
  assert.match(stats, /New today/);
  assert.match(stats, /No data/);

  assert.match(adminGallerySummaryHtml({ total: 2, totalAll: 5, storage: 'x<y>' }), /Hits 2 \/ 5 images/);
  assert.match(adminGallerySummaryHtml({ total: 2, totalAll: 5, storage: 'x<y>' }), /Directory x&lt;y&gt;/);
  assert.match(adminGalleryLoadingSummaryHtml(), /Loading gallery/);
  assert.match(adminGalleryErrorTableHtml('<bad>'), /Gallery failed to load: &lt;bad&gt;/);
  assert.equal(adminGalleryFilterSummaryText({ total: 1, page: 2, pageSize: 50 }), 'Page 2 · 50 per page');

  const empty = adminGalleryTableView([]);
  assert.match(empty.html, /No matching images/);

  const table = adminGalleryTableView([{
    id: 'img1',
    userId: 'u1',
    filename: 'demo.png',
    model: 'm',
    bytes: 10,
    fileMissing: true,
    missingReason: '<gone>'
  }], { users: [{ id: 'u1', username: 'Alice' }] });
  assert.match(table.html, /aria-label="Select all"/);
  assert.match(table.html, />Thumbnail</);
  assert.match(table.html, />Actions</);
  assert.match(table.html, /Missing: &lt;gone&gt;/);
  assert.match(table.html, />View</);
  assert.match(table.html, />Delete</);

  const pager = adminGalleryPagerView({ total: 21, pageSize: 10, page: 2 });
  assert.match(pager.html, /Previous/);
  assert.match(pager.html, /Page 2 \/ 3/);
  assert.match(pager.html, /Next/);

  assert.match(adminGalleryUserFilterOptionsHtml([], ''), /All users/);
  assert.match(adminGalleryModelFilterOptionsHtml(new Set(), ''), /All models/);

  const detail = adminGalleryImageDetailView({
    prompt: '<prompt>',
    promptTruncated: true
  });
  assert.equal(detail.title, 'Image');
  assert.match(detail.html, />Prompt</);
  assert.match(detail.html, /The prompt was trimmed/);
  assert.doesNotMatch(detail.html, /<prompt>/);

  const orphan = adminGalleryOrphanScanHtml({
    missing: [],
    dangling: []
  });
  assert.match(orphan, /missingFiles: DB rows/);
  assert.match(orphan, /Missing files · 0/);
  assert.match(orphan, /Dangling files · 0/);
  assert.match(orphan, /None/);
});
