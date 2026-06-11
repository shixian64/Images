import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PROMPT_EXAMPLE_IMAGES,
  buildLargeSquarePreviewUrl,
  deriveTitle,
  historyPreviewImageIds,
  historyPreviewImages,
  mergeTags,
  normalizeHistory,
  normalizeTags,
  sourceLabel
} from '../public/modules/prompt-utils.js';

test('prompt utility normalizes tags and history entries', () => {
  assert.deepEqual(normalizeTags(' 国风, 赛博\n#国风，夜景 '), ['国风', '赛博', '夜景']);
  assert.deepEqual(mergeTags(['国风', '夜景'], '夜景,赛博'), ['国风', '夜景', '赛博']);
  assert.equal(deriveTitle('长'.repeat(31)), `${'长'.repeat(30)}…`);
  assert.equal(sourceLabel('square'), '广场');
  assert.equal(sourceLabel('unknown'), '手动');

  const [entry] = normalizeHistory([{
    id: 'p1',
    prompt: '  一只猫  ',
    tags: '猫, 可爱',
    public: true,
    useCount: '3',
    ts: '2026-01-02T03:04:05.000Z'
  }]);
  assert.equal(entry.id, 'p1');
  assert.equal(entry.prompt, '一只猫');
  assert.deepEqual(entry.tags, ['猫', '可爱']);
  assert.equal(entry.isPublic, true);
  assert.equal(entry.useCount, 3);
  assert.equal(entry.createdAt, '2026-01-02T03:04:05.000Z');
});

test('prompt utility trims example image metadata and upgrades CDN preview URLs', () => {
  const entry = {
    meta: {
      previewImages: [' https://a.test/1.png ', '', 'https://a.test/1.png', 'https://a.test/2.png', 'https://a.test/3.png', 'https://a.test/4.png', 'https://a.test/5.png'],
      previewImageIds: ['a', 'a', 'b', '', 'c', 'd', 'e']
    }
  };
  assert.deepEqual(historyPreviewImages(entry), [
    'https://a.test/1.png',
    'https://a.test/2.png',
    'https://a.test/3.png',
    'https://a.test/4.png'
  ]);
  assert.equal(historyPreviewImages(entry).length, MAX_PROMPT_EXAMPLE_IMAGES);
  assert.deepEqual(historyPreviewImageIds(entry), ['a', 'b', 'c', 'd']);

  assert.equal(
    buildLargeSquarePreviewUrl('https://img.test/cdn-cgi/image/width=320,quality=70/path.png'),
    'https://img.test/cdn-cgi/image/width=1200,quality=92/path.png'
  );
  assert.equal(buildLargeSquarePreviewUrl('https://img.test/plain.png'), 'https://img.test/plain.png');
});
