import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
