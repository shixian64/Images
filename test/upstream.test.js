import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImagePayload,
  resolveApiUrl,
  resolveModelsUrl
} from '../services/upstream.js';

// --- resolveApiUrl ---

test('resolveApiUrl 追加 /v1/images/generations', () => {
  assert.equal(resolveApiUrl('https://api.openai.com'), 'https://api.openai.com/v1/images/generations');
});

test('resolveApiUrl 不重复追加 /v1', () => {
  assert.equal(resolveApiUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/images/generations');
  assert.equal(resolveApiUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/images/generations');
});

test('resolveApiUrl 对自定义网关也生效', () => {
  assert.equal(
    resolveApiUrl('https://gateway.example.com/openai'),
    'https://gateway.example.com/openai/v1/images/generations'
  );
});

test('resolveApiUrl 空值 / 非法 URL 抛错', () => {
  assert.throws(() => resolveApiUrl(''), /Base URL is required/);
  assert.throws(() => resolveApiUrl('   '), /Base URL is required/);
  assert.throws(() => resolveApiUrl('not a url'));
});

// --- resolveModelsUrl ---

test('resolveModelsUrl 指向 /v1/models', () => {
  assert.equal(resolveModelsUrl('https://api.openai.com'), 'https://api.openai.com/v1/models');
  assert.equal(resolveModelsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/models');
});

// --- buildImagePayload ---

test('buildImagePayload 需要 prompt', () => {
  assert.throws(() => buildImagePayload({}), /Prompt is required/);
  assert.throws(() => buildImagePayload({ prompt: '   ' }), /Prompt is required/);
});

test('buildImagePayload 默认模型 gpt-image-2', () => {
  const p = buildImagePayload({ prompt: 'a cat' });
  assert.equal(p.model, 'gpt-image-2');
  assert.equal(p.n, 1);
});

test('buildImagePayload 过滤 auto 值', () => {
  const p = buildImagePayload({
    prompt: 'x',
    size: 'auto',
    quality: 'high',
    background: 'transparent',
    output_format: 'png'
  });
  assert.equal(p.quality, 'high');
  assert.equal(p.output_format, 'png');
  assert.ok(!('size' in p), 'auto 值的 size 不应传给上游');
  assert.ok(!('background' in p), 'background 不应传给上游');
});

test('buildImagePayload 会 trim prompt', () => {
  const p = buildImagePayload({ prompt: '  hi  ' });
  assert.equal(p.prompt, 'hi');
});

test('buildImagePayload 只带白名单字段，忽略未知字段', () => {
  const p = buildImagePayload({ prompt: 'x', evil_field: 'boom', apiKey: 'sk-xxx' });
  assert.ok(!('evil_field' in p));
  assert.ok(!('apiKey' in p), 'apiKey 绝不能跟进 upstream body');
});
