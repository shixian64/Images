import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskApiKey } from '../utils/mask.js';

test('空值返回空串', () => {
  assert.equal(maskApiKey(''), '');
  assert.equal(maskApiKey(null), '');
  assert.equal(maskApiKey(undefined), '');
});

test('短 key（<=8）只露头部两位', () => {
  assert.equal(maskApiKey('abcd'), 'ab****');
  assert.equal(maskApiKey('12345678'), '12****');
});

test('长 key 头 4 尾 4', () => {
  assert.equal(maskApiKey('sk-proj-1234567890abcd'), 'sk-p****abcd');
});

test('长 key（>8）绝不完整回显', () => {
  for (const sample of ['sk-proj-1234567890abcd', 'abcdefghijklmno', '123456789']) {
    assert.ok(
      !maskApiKey(sample).includes(sample),
      `mask 不应原样包含 key: ${sample}`
    );
  }
});

test('包含 **** 作为视觉分隔', () => {
  assert.match(maskApiKey('sk-proj-1234567890abcd'), /\*\*\*\*/);
});
