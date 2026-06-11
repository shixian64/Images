import assert from 'node:assert/strict';
import test from 'node:test';

import { setLocale } from '../public/modules/i18n.js';
import {
  formatBytes,
  imageSrcFromItem,
  referenceListView,
  referencePreview,
  studioGalleryView,
  studioImageCardHtml
} from '../public/modules/studio-view.js';

test.beforeEach(() => {
  setLocale('zh-CN');
});

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
  assert.match(refs.html, /\u8fd8\u6ca1\u6709\u53c2\u8003\u56fe/);

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
  assert.match(view.html, /alt="\u53c2\u8003\u56fe 1"/);
  assert.match(view.html, /aria-label="\u79fb\u9664\u53c2\u8003\u56fe 1"/);
  assert.match(view.html, />\u79fb\u9664<\/button>/);
  assert.match(view.html, />#1 \u4e0a\u4f20<\/span>/);
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
  assert.match(html, /aria-label="\u653e\u5927\u67e5\u770b\u7b2c 2 \u5f20\u751f\u6210\u56fe"/);
  assert.match(html, /\u672c\u5730\u4fdd\u5b58\u5931\u8d25\uff1a&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, />\u4e0b\u8f7d<\/a>/);
  assert.match(html, />\u52a0\u5165\u53c2\u8003\u56fe<\/button>/);
  assert.match(html, />\u7ee7\u7eed\u7f16\u8f91<\/button>/);
  assert.doesNotMatch(html, /<script>alert/);

  const view = studioGalleryView([{ b64_json: 'abc' }], '', { timestamp: 123 });
  assert.equal(view.empty, false);
  assert.match(view.html, /download="image-123-1\.png"/);
  assert.match(view.html, /data:image\/png;base64,abc/);
  assert.match(view.html, /alt="\u751f\u6210\u56fe 1"/);
  assert.match(view.html, /data-studio-add-reference="0" disabled/);
});

test('studio view renders English locale text', () => {
  setLocale('en-US');

  const refs = referenceListView([]);
  assert.match(refs.html, /No reference images yet/);

  const list = referenceListView([{
    clientId: 'ref1',
    type: 'gallery',
    localUrl: '/g.png',
    bytes: 512
  }]);
  assert.match(list.html, /alt="Reference image 1"/);
  assert.match(list.html, /aria-label="Remove reference image 1"/);
  assert.match(list.html, />Remove<\/button>/);
  assert.match(list.html, />#1 Gallery<\/span>/);

  const gallery = studioGalleryView([], 'prompt');
  assert.match(gallery.html, /The interface returned successfully, but data\[\] was empty/);

  const card = studioImageCardHtml({
    local_url: '/gallery/image.png',
    gallery_id: 'g1',
    save_error: '<boom>'
  }, 0, { prompt: '', timestamp: 123 });
  assert.match(card, /aria-label="Enlarge generated image 1"/);
  assert.match(card, /alt="Generated image 1"/);
  assert.match(card, /Local save failed: &lt;boom&gt;/);
  assert.match(card, />Download<\/a>/);
  assert.match(card, />Add reference image<\/button>/);
  assert.match(card, />Continue editing<\/button>/);
});
