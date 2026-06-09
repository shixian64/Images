import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('custom API key queue submissions require an explicit volatile-secret confirmation', () => {
  const helper = readFileSync('public/modules/volatile-secrets.js', 'utf8');
  const studio = readFileSync('public/modules/studio.js', 'utf8');
  const comic = readFileSync('public/modules/comic.js', 'utf8');

  assert.match(helper, /个人 API Key 只保存在当前页面内存/);
  assert.match(helper, /任务可能无法继续/);
  assert.match(studio, /confirmVolatileCustomKeyUse\(\{ taskLabel: '生图任务' \}\)/);
  assert.match(comic, /confirmVolatileCustomKeyUse\(\{ taskLabel: '漫画页分镜任务' \}\)/);
  assert.match(comic, /confirmVolatileCustomKeyUse\(\{ taskLabel: '漫画生图任务' \}\)/);
});
