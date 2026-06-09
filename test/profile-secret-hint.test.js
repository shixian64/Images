import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('profile UI explicitly warns that personal API keys are memory-only', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const profiles = readFileSync('public/modules/profiles.js', 'utf8');

  assert.match(html, /API Key 不会写入本地存储/);
  assert.match(html, /API Key 仅保留在当前页面内存/);
  assert.match(profiles, /API Key 仅保留在当前页面，刷新后需重新填写/);
});
