import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PROMPT_HISTORY } from '../public/modules/prompt-utils.js';
import { upsertPromptHistoryEntry } from '../public/modules/prompt-history-model.js';

test('upsertPromptHistoryEntry creates and updates prompt history entries', () => {
  const now = '2026-06-11T01:02:03.000Z';
  const created = upsertPromptHistoryEntry([], '  猫咪在月光下奔跑  ', {
    source: 'studio',
    tags: '猫, 月光',
    model: 'gpt-image-2',
    previewImages: ['https://img.test/a.png']
  }, { now });

  assert.equal(created.changed, true);
  assert.equal(created.history.length, 1);
  assert.equal(created.entry.prompt, '猫咪在月光下奔跑');
  assert.equal(created.entry.source, 'studio');
  assert.deepEqual(created.entry.tags, ['猫', '月光']);
  assert.equal(created.entry.useCount, 1);
  assert.equal(created.entry.lastUsedAt, now);
  assert.equal(created.entry.meta.model, 'gpt-image-2');

  const updated = upsertPromptHistoryEntry(created.history, '猫咪在月光下奔跑', {
    source: 'builder',
    title: '月光猫',
    tags: '夜景',
    size: '1024x1024'
  }, { now: '2026-06-11T02:03:04.000Z' });

  assert.equal(updated.history.length, 1);
  assert.equal(updated.entry.title, '月光猫');
  assert.equal(updated.entry.source, 'studio');
  assert.deepEqual(updated.entry.tags, ['猫', '月光', '夜景']);
  assert.equal(updated.entry.useCount, 1);
  assert.equal(updated.entry.meta.model, '');
  assert.equal(updated.entry.meta.size, '1024x1024');
});

test('upsertPromptHistoryEntry ignores empty prompts and trims history budget', () => {
  const unchanged = upsertPromptHistoryEntry([{ id: 'a', prompt: 'keep' }], '   ');
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.entry, null);
  assert.deepEqual(unchanged.history, [{ id: 'a', prompt: 'keep' }]);

  const old = Array.from({ length: MAX_PROMPT_HISTORY }, (_, i) => ({
    id: `old-${i}`,
    title: `old-${i}`,
    prompt: `old-${i}`,
    tags: [],
    source: 'manual',
    updatedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`,
    pinned: i === 10,
    meta: {}
  }));
  const result = upsertPromptHistoryEntry(old, 'new prompt', {}, { now: '2026-06-11T03:04:05.000Z' });
  assert.equal(result.history.length, MAX_PROMPT_HISTORY);
  assert.equal(result.history.some((item) => item.prompt === 'new prompt'), true);
  assert.equal(result.history.some((item) => item.id === 'old-10'), true);
  assert.equal(result.history.some((item) => item.id === 'old-159'), false);
});
