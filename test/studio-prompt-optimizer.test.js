import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromptOptimizationMessages,
  cleanOptimizedPrompt,
  extractChatText,
  formatOptimizedPromptParagraphs,
  splitLongParagraph
} from '../public/modules/studio-prompt-optimizer.js';

test('studio prompt optimizer builds chat messages without changing user prompt', () => {
  const messages = buildPromptOptimizationMessages('一只橘猫在月球上喝咖啡');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /不要 Markdown/);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /一只橘猫在月球上喝咖啡/);
});

test('studio prompt optimizer extracts text from common chat response shapes', () => {
  assert.equal(extractChatText({ choices: [{ message: { content: 'hello' } }] }), 'hello');
  assert.equal(extractChatText({ choices: [{ text: 'legacy' }] }), 'legacy');
  assert.equal(extractChatText({ output_text: 'flat' }), 'flat');
  assert.equal(extractChatText({ content: [{ text: 'a' }, { content: 'b' }, 'c'] }), 'abc');
});

test('studio prompt optimizer cleans fences and wrapping quotes', () => {
  assert.equal(cleanOptimizedPrompt('```text\n  prompt body  \n```'), 'prompt body');
  assert.equal(cleanOptimizedPrompt('“prompt body”'), 'prompt body');
  assert.equal(cleanOptimizedPrompt("'prompt body'"), 'prompt body');
});

test('studio prompt optimizer formats paragraphs for readable prompt output', () => {
  const formatted = formatOptimizedPromptParagraphs([
    '主体是一座雨夜里的赛博城市，霓虹灯映照湿润街道，行人撑伞穿过路口。',
    '镜头采用低角度广角构图，突出高楼压迫感和街道纵深。',
    '光线以蓝紫色为主，加入暖色招牌作为对比。'
  ].join('\n'));

  const paragraphs = formatted.split('\n\n');
  assert.ok(paragraphs.length >= 2);
  assert.match(formatted, /赛博城市/);
  assert.ok(paragraphs.every((paragraph) => !paragraph.includes('\n')));
});

test('studio prompt optimizer splits long comma-delimited paragraphs', () => {
  const chunks = splitLongParagraph(
    '主体细节丰富，环境层次清晰，镜头语言明确，光线方向稳定，色彩控制统一，材质纹理真实，背景元素克制，负面约束完整',
    24
  );
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((item) => item.length <= 24 || !/[，,、]/.test(item.slice(0, -1))));
});
