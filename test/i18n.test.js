import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDateTime,
  formatDuration,
  formatNumber,
  getLocale,
  normalizeLocale,
  setLocale,
  supportedLocales,
  t
} from '../public/modules/i18n.js';

test('i18n normalizes supported locales and falls back predictably', () => {
  assert.deepEqual(supportedLocales(), ['zh-CN', 'en-US']);
  assert.equal(normalizeLocale('zh-Hans-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-GB'), 'en-US');
  assert.equal(normalizeLocale('fr-FR'), 'zh-CN');
});

test('i18n translates keys with interpolation', () => {
  assert.equal(setLocale('en-US'), 'en-US');
  assert.equal(getLocale(), 'en-US');
  assert.equal(t('job.status.running'), 'Running');
  assert.equal(t('admin.clientLogs.summary.count', { count: 3 }), 'Showing 3');
  assert.equal(t('duration.minutesSeconds', { minutes: 2, seconds: 5 }), '2m 5s');
  assert.equal(t('missing.key', {}, 'Fallback {name}'), 'Fallback ');
  assert.equal(t('missing.key', { name: 'Alice' }, 'Fallback {name}'), 'Fallback Alice');

  setLocale('zh-CN');
  assert.equal(t('job.status.running'), '执行中');
});

test('i18n formats date, number, and duration with current locale', () => {
  setLocale('en-US');
  assert.equal(formatDuration(0), '-');
  assert.equal(formatDuration(999), '999ms');
  assert.equal(formatDuration(1500), '2s');
  assert.equal(formatDuration(61_000), '1m 1s');
  assert.equal(formatNumber(12345), '12,345');
  assert.equal(formatDateTime('not-a-date'), '-');
  assert.match(formatDateTime('2026-06-11T12:00:00.000Z'), /\d/);

  setLocale('zh-CN');
});
