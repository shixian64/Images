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
  assert.equal(t('dom.maskKey.empty'), 'Missing key');
  assert.equal(t('dom.status.ready'), 'Ready');
  assert.equal(t('drawer.title.default'), 'Details');
  assert.equal(t('dialog.confirm.title'), 'Confirm action');
  assert.equal(t('dialog.info.ok'), 'Got it');
  assert.equal(t('dialog.form.title'), 'Fill in information');
  assert.equal(t('admin.gallery.summary.hits', { total: 2, totalAll: 5 }), 'Hits 2 / 5 images');
  assert.equal(t('admin.gallery.table.thumbnail'), 'Thumbnail');
  assert.equal(t('admin.interfaces.summary.imageKey', { state: 'Configured' }), 'Image key: Configured');
  assert.equal(t('admin.registration.summary.defaultTtl', { days: 7 }), 'Default TTL: 7 days');
  assert.equal(t('admin.quota.header.usage'), 'Usage (today / month / storage)');
  assert.equal(t('admin.users.pager.info', { page: 2, totalPages: 3, pageSize: 50 }), 'Page 2 / 3 · 50 per page');
  assert.equal(t('admin.jobs.summary.successRate', { rate: '88%' }), 'Success rate 88%');
  assert.equal(t('jobs.queued.position', { count: 2 }), '2 ahead');
  assert.equal(t('profiles.test.failed', { error: 'boom' }), 'Failed · boom');
  assert.equal(t('profile.usage.periodHint', { promptOptimizations: 1, fails: 2, images: 3 }), 'Prompt optimizations 1 · failures 2 · saved 3 images');
  assert.equal(t('selects.empty'), 'No options');
  assert.equal(t('selects.placeholder'), 'Select an option');
  assert.equal(t('logs.summary.count', { total: 3, shown: 1 }), '3 total · 1 shown');
  assert.equal(t('promptHistory.summary.count', { total: 3, shown: 1 }), '3 total · 1 shown');
  assert.equal(t('promptHistory.examples.previewAria', { index: 1 }), 'Preview example image 1');
  assert.equal(t('promptSquare.summary.count', { total: 3, shown: 1 }), 'Square 3 total · 1 shown');
  assert.equal(t('promptSquare.preview.openAria', { title: 'Demo' }), 'Open Demo example image');
  assert.equal(t('prompt.source.square'), 'Square');
  assert.equal(t('prompt.untitled'), 'Untitled prompt');
  assert.equal(t('studio.result.previewAria', { index: 2 }), 'Enlarge generated image 2');
  assert.equal(t('studio.reference.removeAria', { index: 1 }), 'Remove reference image 1');
  assert.equal(t('theme.toggle.title', { mode: t('theme.mode.dark') }), 'Theme: Dark (click to switch)');
  assert.equal(t('imagePreview.closeLabel'), 'Close image preview');
  assert.equal(t('clipboard.manual.title'), 'Manual copy');
  assert.equal(t('clipboard.error.empty'), 'No text to copy.');
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
