import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskApiKey, redactSecrets } from '../utils/mask.js';

const skLike = (suffix) => ['sk', suffix].join('-');
const LONG_SK_LIKE_KEY = skLike('proj-1234567890abcd');

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
  assert.equal(maskApiKey(LONG_SK_LIKE_KEY), 'sk-p****abcd');
});

test('长 key（>8）绝不完整回显', () => {
  for (const sample of [LONG_SK_LIKE_KEY, 'abcdefghijklmno', '123456789']) {
    assert.ok(
      !maskApiKey(sample).includes(sample),
      `mask 不应原样包含 key: ${sample}`
    );
  }
});

test('包含 **** 作为视觉分隔', () => {
  assert.match(maskApiKey(LONG_SK_LIKE_KEY), /\*\*\*\*/);
});

test('redactSecrets masks explicit and OpenAI-style secrets in error text', () => {
  const openAiStyleSecret = skLike('system-secret-123456');
  const explicitSecret = 'custom-token-abcdef';
  const raw = `upstream echoed Authorization: Bearer ${openAiStyleSecret} and ${explicitSecret}`;
  const redacted = redactSecrets(raw, [explicitSecret]);

  assert.ok(!redacted.includes(openAiStyleSecret));
  assert.ok(!redacted.includes(explicitSecret));
  assert.match(redacted, /sk-s\*\*\*\*3456/);
  assert.match(redacted, /cust\*\*\*\*cdef/);
});

test('redactSecrets masks named API key fields', () => {
  const fieldSecret = skLike('test-value');
  const redacted = redactSecrets(`apiKey=${fieldSecret} x-api-key: abcdefghijk`);

  assert.ok(!redacted.includes(fieldSecret));
  assert.ok(!redacted.includes('abcdefghijk'));
  assert.match(redacted, /apiKey=sk-t\*\*\*\*alue/);
});
