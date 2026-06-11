import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPromptSquareItems,
  inPromptSquarePeriod,
  promptSquareSummaryStats,
  promptSquareTags
} from '../public/modules/prompt-square-model.js';

const NOW = Date.parse('2026-06-11T00:00:00.000Z');

const ITEMS = [
  {
    id: 'mine-hot',
    title: '国风机甲',
    prompt: '红色机甲站在雨夜城市',
    tags: ['国风', '机甲'],
    source: 'builder',
    owner: { id: 'u1', username: 'alice' },
    useCount: 2,
    publishedAt: '2026-06-10T23:00:00.000Z',
    meta: { sourceHot: 80 }
  },
  {
    id: 'other-used',
    title: '水彩猫',
    prompt: '水彩风格小猫',
    tags: ['水彩', '动物'],
    source: 'square',
    owner: { id: 'u2', username: 'bob' },
    useCount: 9,
    publishedAt: '2026-06-08T00:00:00.000Z',
    meta: {}
  },
  {
    id: 'old',
    title: '旧图',
    prompt: '过期示例',
    tags: ['国风'],
    source: 'manual',
    owner: { id: 'u3', username: 'carol' },
    useCount: 3,
    publishedAt: '2026-05-01T00:00:00.000Z',
    meta: { sourceHot: 10 }
  }
];

test('prompt square model filters by period, tag, and keyword', () => {
  assert.equal(inPromptSquarePeriod(ITEMS[0], '24h', NOW), true);
  assert.equal(inPromptSquarePeriod(ITEMS[1], '24h', NOW), false);

  assert.deepEqual(
    filterPromptSquareItems(ITEMS, {
      period: '7d',
      tag: '国风',
      keyword: 'alice',
      now: NOW
    }).map((item) => item.id),
    ['mine-hot']
  );

  assert.deepEqual(
    filterPromptSquareItems(ITEMS, {
      period: 'all',
      keyword: '广场',
      now: NOW
    }).map((item) => item.id),
    ['other-used']
  );
});

test('prompt square model sorts and summarizes items', () => {
  assert.deepEqual(
    filterPromptSquareItems(ITEMS, { sort: 'sourceHot:desc', now: NOW }).map((item) => item.id),
    ['mine-hot', 'old', 'other-used']
  );
  assert.deepEqual(
    filterPromptSquareItems(ITEMS, { sort: 'useCount:desc', now: NOW }).map((item) => item.id),
    ['other-used', 'old', 'mine-hot']
  );
  assert.deepEqual(
    filterPromptSquareItems(ITEMS, { sort: 'mine:first', currentUserId: 'u1', now: NOW }).map((item) => item.id),
    ['mine-hot', 'other-used', 'old']
  );
  assert.deepEqual(promptSquareTags(ITEMS), ['动物', '国风', '机甲', '水彩']);
  assert.deepEqual(promptSquareSummaryStats(ITEMS, 'u1'), {
    total: 3,
    mine: 1,
    totalUses: 14
  });
});
