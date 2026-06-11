import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comicProjectCardHtml,
  comicProjectCardsHtml,
  comicProjectDetailHtml,
  comicProjectProgress,
  comicProjectProgressText,
  comicProjectStatusLabel,
  downloadSrcFromGalleryItem,
  formatBytes,
  galleryEmptyHtml,
  galleryImageCardHtml,
  galleryImageCardsHtml,
  getImagePrompt,
  previewSrcFromGalleryItem,
  thumbnailSrcFromGalleryItem
} from '../public/modules/gallery-view.js';

test('gallery view resolves image URLs and formats metadata', () => {
  const item = {
    url: '/original.png',
    thumbnail_url: '/thumb.png',
    previewUrl: '/preview.png',
    downloadUrl: '/download.png',
    revised_prompt: ' revised '
  };

  assert.equal(thumbnailSrcFromGalleryItem(item), '/thumb.png');
  assert.equal(previewSrcFromGalleryItem(item), '/preview.png');
  assert.equal(downloadSrcFromGalleryItem(item), '/download.png');
  assert.equal(getImagePrompt(item), 'revised');
  assert.equal(formatBytes(0), '-');
  assert.equal(formatBytes(2048), '2.0 KB');
});

test('gallery view renders escaped empty state and private card controls', () => {
  const empty = galleryEmptyHtml('<script>alert(1)</script>');
  assert.match(empty, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(empty, /<script>alert/);

  const html = galleryImageCardHtml({
    id: 'img"><script>',
    local_url: '/image.png?x=<bad>',
    filename: 'file"><img>.png',
    prompt: '<b>prompt</b>',
    model: 'gpt-image',
    size: '1024x1024',
    bytes: 1536,
    createdAt: 'not-a-date',
    isPublic: true,
    likeCount: 3
  }, 0, {
    scope: 'mine',
    totalCount: 2
  });

  assert.match(html, /data-gallery-id="img&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /download="file&quot;&gt;&lt;img&gt;.png"/);
  assert.match(html, /&lt;b&gt;prompt&lt;\/b&gt;/);
  assert.match(html, /已公开到公开图库/);
  assert.match(html, /取消公开/);
  assert.match(html, /1.5 KB/);
  assert.doesNotMatch(html, /<b>prompt<\/b>/);
});

test('gallery view renders public cards with like limits', () => {
  const html = galleryImageCardHtml({
    id: 'public-1',
    url: '/public.png',
    userId: 'abcdef123456',
    ownerUsername: '<owner>',
    prompt: '',
    likedByMe: false,
    likeCount: 10
  }, 1, {
    scope: 'public',
    totalCount: 3,
    likeQuota: { remaining: 0 }
  });

  assert.match(html, /public-gallery-card/);
  assert.match(html, /作者 &lt;owner&gt;/);
  assert.match(html, /今日用完/);
  assert.match(html, /data-gallery-like[^>]*disabled/);
  assert.match(html, /data-gallery-copy-prompt disabled/);
});

test('gallery view renders multiple cards with a stable total count', () => {
  const html = galleryImageCardsHtml([
    { id: 'a', url: '/a.png' },
    { id: 'b', url: '/b.png' }
  ], {
    scope: 'mine',
    totalCount: 5
  });

  assert.match(html, /#5/);
  assert.match(html, /#4/);
});

test('gallery view formats comic project status and progress', () => {
  assert.equal(comicProjectStatusLabel('storyboard'), '已生成页分镜');
  assert.equal(comicProjectStatusLabel('custom'), 'custom');
  assert.deepEqual(comicProjectProgress({
    status: 'generating',
    pageCount: 5,
    progress: {
      completed: 7,
      running: 1,
      queued: 2,
      failed: 3,
      computedStatus: 'generating'
    }
  }), {
    total: 5,
    completed: 5,
    active: 0,
    running: 1,
    queued: 2,
    failed: 3,
    computedStatus: 'generating'
  });
  assert.equal(comicProjectProgressText({
    pageCount: 5,
    progress: { completed: 2, running: 1, queued: 1 }
  }), '2/5 张 · 1 个运行中 · 1 个排队中');
  assert.equal(comicProjectProgressText({
    imageCount: 2,
    progress: { failed: 1 }
  }), '2/- 张 · 1 个失败');
});

test('gallery view renders escaped comic project cards', () => {
  const html = comicProjectCardHtml({
    id: 'p"><script>',
    title: '<title>',
    story: '<story>',
    thumbnailUrl: '/thumb"><bad>',
    updatedAt: 'bad-date',
    styleLabel: '<style>',
    imageModel: '<model>',
    size: '<size>',
    quality: '<quality>',
    progress: {
      total: 4,
      completed: 2,
      running: 1,
      computedStatus: '<status>'
    }
  }, '1"><bad>', { totalCount: '3"><bad>' });

  assert.match(html, /data-comic-project-id="p&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /data-comic-project-index="0"/);
  assert.match(html, /src="\/thumb&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /aria-label="打开漫画项目 &lt;title&gt;"/);
  assert.match(html, /&lt;status&gt; · 2\/4 张 · 1 个运行中/);
  assert.match(html, /&lt;style&gt; · &lt;model&gt; · &lt;size&gt; · &lt;quality&gt;/);
  assert.match(html, /title="&lt;story&gt;"/);
  assert.doesNotMatch(html, /<title>/);
  assert.doesNotMatch(html, /<bad>/);

  const list = comicProjectCardsHtml([
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' }
  ]);
  assert.match(list, /#2/);
  assert.match(list, /#1/);
});

test('gallery view renders escaped comic project detail', () => {
  const html = comicProjectDetailHtml({
    title: '<title>',
    story: '<story>',
    styleLabel: '<style>',
    imageModel: '<model>',
    size: '<size>',
    quality: '<quality>',
    outputFormat: '<png>',
    progress: {
      total: 3,
      completed: 1,
      queued: 1,
      computedStatus: '<status>'
    }
  }, [], {
    emptyImagesHtml: galleryEmptyHtml('<empty>')
  });

  assert.match(html, /&lt;title&gt;/);
  assert.match(html, /&lt;style&gt; · &lt;model&gt; · &lt;size&gt; · &lt;quality&gt; · &lt;png&gt;/);
  assert.match(html, /1\/3 张 · 1 个排队中 · &lt;status&gt;/);
  assert.match(html, /&lt;story&gt;/);
  assert.match(html, /&lt;empty&gt;/);
  assert.doesNotMatch(html, /<title>/);
  assert.doesNotMatch(html, /<empty>/);

  const withImages = comicProjectDetailHtml({ title: 'T' }, [{ id: 'img' }], {
    imageCardsHtml: '<article class="image-card">image</article>'
  });
  assert.match(withImages, /<article class="image-card">image<\/article>/);
});
