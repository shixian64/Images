import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatBytes,
  imageSrcFromItem,
  referenceListView,
  referencePreview,
  studioGalleryView,
  studioImageCardHtml
} from '../public/modules/studio-view.js';

test('studio view formats bytes and resolves image sources', () => {
  assert.equal(formatBytes(0), '');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');

  assert.equal(imageSrcFromItem({ local_url: '/a.png' }), '/a.png');
  assert.equal(imageSrcFromItem({ b64_json: 'abc' }), 'data:image/png;base64,abc');
  assert.equal(imageSrcFromItem({ b64_json: 'data:image/webp;base64,abc' }), 'data:image/webp;base64,abc');
  assert.equal(referencePreview({ previewUrl: 'blob:a', url: 'https://example.test/a.png' }), 'blob:a');
});

test('studio view renders empty reference and gallery states', () => {
  const refs = referenceListView([]);
  assert.equal(refs.empty, true);
  assert.match(refs.html, /还没有参考图/);

  const gallery = studioGalleryView([], 'prompt');
  assert.equal(gallery.empty, true);
  assert.match(gallery.html, /data\[\]/);
});

test('studio view renders reference list with escaped dynamic fields', () => {
  const view = referenceListView([
    {
      clientId: 'ref"><script>',
      type: 'upload',
      previewUrl: 'blob:<x>',
      filename: '<b>evil</b>.png',
      bytes: 2048
    }
  ]);

  assert.equal(view.empty, false);
  assert.match(view.html, /data-reference-id="ref&quot;&gt;&lt;script&gt;"/);
  assert.match(view.html, /title="&lt;b&gt;evil&lt;\/b&gt;.png"/);
  assert.match(view.html, /2.0 KB/);
  assert.doesNotMatch(view.html, /<b>evil<\/b>/);
});

test('studio view renders gallery cards and escapes result metadata', () => {
  const html = studioImageCardHtml({
    local_url: '/gallery/image.png?x=<bad>',
    file_name: 'x"><img src=x>.png',
    gallery_id: 'g1',
    save_error: '<img src=x onerror=alert(1)>'
  }, 1, {
    prompt: '<script>alert(1)</script>',
    timestamp: 123
  });

  assert.match(html, /data-studio-index="1"/);
  assert.match(html, /download="x&quot;&gt;&lt;img src=x&gt;.png"/);
  assert.match(html, /alt="&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(html, /本地保存失败：&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>alert/);

  const view = studioGalleryView([{ b64_json: 'abc' }], '', { timestamp: 123 });
  assert.equal(view.empty, false);
  assert.match(view.html, /download="image-123-1\.png"/);
  assert.match(view.html, /data:image\/png;base64,abc/);
  assert.match(view.html, /data-studio-add-reference="0" disabled/);
});
