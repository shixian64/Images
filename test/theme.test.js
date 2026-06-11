import assert from 'node:assert/strict';
import test from 'node:test';

import { setLocale } from '../public/modules/i18n.js';
import {
  themeModeLabel,
  themeToggleTitle
} from '../public/modules/theme.js';

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('theme view formats localized mode labels and titles', () => {
  assert.equal(themeModeLabel('system'), '\u8ddf\u968f\u7cfb\u7edf');
  assert.equal(themeModeLabel('light'), '\u6d45\u8272');
  assert.equal(themeModeLabel('dark'), '\u6df1\u8272');
  assert.equal(themeToggleTitle('dark'), '\u4e3b\u9898\uff1a\u6df1\u8272\uff08\u70b9\u51fb\u5207\u6362\uff09');

  setLocale('en-US');
  assert.equal(themeModeLabel('system'), 'System');
  assert.equal(themeModeLabel('light'), 'Light');
  assert.equal(themeModeLabel('dark'), 'Dark');
  assert.equal(themeToggleTitle('dark'), 'Theme: Dark (click to switch)');
  assert.equal(themeToggleTitle('custom'), 'Theme: custom (click to switch)');
});
