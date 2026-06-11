import assert from 'node:assert/strict';
import test from 'node:test';

import { composePrompt, promptBuilderQualityChecks } from '../public/modules/prompt-builder-model.js';

test('composePrompt builds structured prompt lines in order', () => {
  assert.equal(composePrompt({
    subject: '一只橘猫',
    style: '水彩',
    composition: '俯拍',
    lighting: '清晨柔光',
    palette: '暖色',
    text: '无文字',
    negative: '不要畸变'
  }), [
    '一只橘猫',
    '风格与媒介：水彩',
    '构图与镜头：俯拍',
    '光线与氛围：清晨柔光',
    '色彩与材质：暖色',
    '画面文字：无文字',
    '避免：不要畸变'
  ].join('\n'));

  assert.equal(composePrompt({ subject: '山谷', palette: '青绿色' }), '山谷\n色彩与材质：青绿色');
});

test('promptBuilderQualityChecks reports filled builder sections', () => {
  assert.deepEqual(promptBuilderQualityChecks({
    subject: '主体',
    style: '',
    composition: '构图',
    lighting: '',
    text: '标题',
    negative: ''
  }), {
    subject: true,
    style: false,
    composition: true,
    lighting: false,
    constraints: true
  });
});
