import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customSelectMenuHtml,
  selectOptionLabel
} from '../public/modules/selects-view.js';
import {
  customSelectAriaFallback,
  customSelectPlaceholderLabel
} from '../public/modules/selects.js';
import { setLocale } from '../public/modules/i18n.js';

test('selects view resolves option label fallbacks', () => {
  setLocale('zh-CN');
  assert.equal(selectOptionLabel({ label: 'Label' }), 'Label');
  assert.equal(selectOptionLabel({ text: 'Text' }), 'Text');
  assert.equal(selectOptionLabel({ textContent: 'Content' }), 'Content');
  assert.equal(selectOptionLabel({ value: 'value' }), 'value');
  assert.equal(selectOptionLabel({}), '未命名');
});

test('selects view renders empty state', () => {
  setLocale('zh-CN');
  assert.equal(customSelectMenuHtml([]), '<div class="custom-select-empty">暂无选项</div>');
  assert.equal(customSelectMenuHtml([{ label: 'hidden', hidden: true }]), '<div class="custom-select-empty">暂无选项</div>');
});

test('selects view escapes groups and option labels', () => {
  setLocale('zh-CN');
  const html = customSelectMenuHtml([
    {
      index: '1"><bad>',
      group: '<group>',
      label: '<label>',
      value: '<value>',
      selected: true
    },
    {
      index: 2,
      group: '<group>',
      text: 'x"><script>',
      disabled: true
    },
    {
      index: 3,
      group: '<other>',
      value: '<fallback>'
    }
  ]);

  assert.match(html, /custom-select-group">&lt;group&gt;/);
  assert.match(html, /data-option-index="0"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /&lt;label&gt;/);
  assert.match(html, /x&quot;&gt;&lt;script&gt;/);
  assert.match(html, /&lt;other&gt;/);
  assert.match(html, /&lt;fallback&gt;/);
  assert.doesNotMatch(html, /<label>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<fallback>/);
});

test('selects view uses locale messages for fallback chrome', () => {
  setLocale('en-US');

  assert.equal(selectOptionLabel({}), 'Untitled');
  assert.equal(customSelectMenuHtml([]), '<div class="custom-select-empty">No options</div>');
  assert.equal(customSelectPlaceholderLabel(), 'Select an option');
  assert.equal(customSelectAriaFallback(), 'Dropdown select');

  setLocale('zh-CN');
});

test('select enhancement helper labels use Chinese locale defaults', () => {
  setLocale('zh-CN');

  assert.equal(customSelectPlaceholderLabel(), '请选择');
  assert.equal(customSelectAriaFallback(), '下拉选择');
});
