import assert from 'node:assert/strict';
import test from 'node:test';

import {
  optionLabel,
  optionValue,
  selectOptionsHtml
} from '../public/modules/select-options-view.js';

test('select options view resolves value and label fallbacks', () => {
  assert.equal(optionValue({ value: 'v1', id: 'id1' }), 'v1');
  assert.equal(optionValue({ id: 'id1' }), 'id1');
  assert.equal(optionValue({}), '');
  assert.equal(optionLabel({ value: 'v1', label: 'Label' }), 'Label');
  assert.equal(optionLabel({ value: 'v1' }), 'v1');
});

test('select options view escapes option values and labels', () => {
  const html = selectOptionsHtml([
    { value: 'a"><script>', label: '<b>A</b>' },
    { id: 'id"><img>', label: 'ID <img>' }
  ], { selectedValue: 'a"><script>' });

  assert.match(html, /value="a&quot;&gt;&lt;script&gt;" selected>&lt;b&gt;A&lt;\/b&gt;<\/option>/);
  assert.match(html, /value="id&quot;&gt;&lt;img&gt;">ID &lt;img&gt;<\/option>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>A<\/b>/);
});

test('select options view handles non-array input', () => {
  assert.equal(selectOptionsHtml(null), '');
});
