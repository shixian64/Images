import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VIDEO_KEYFRAME_LIMITS,
  buildVideoBetweenPrompt,
  buildVideoKeyframePrompt,
  buildVideoStoryboardMessages,
  buildVideoStoryboardRepairMessages,
  clampVideoKeyframeCount,
  normalizeVideoStoryboard,
  parseVideoStoryboardResponse,
  videoReferenceSpecsFromIndexes
} from '../shared/video-workflow.js';

test('video workflow clamps and normalizes model storyboard output', () => {
  assert.equal(clampVideoKeyframeCount(99), VIDEO_KEYFRAME_LIMITS.max);
  assert.equal(clampVideoKeyframeCount(1), VIDEO_KEYFRAME_LIMITS.min);

  const storyboard = normalizeVideoStoryboard({
    title: '霓虹追逐',
    visual_style: '电影感霓虹',
    continuity_rules: '角色服装保持一致',
    keyframe_count: 3,
    keyframes: [
      { beat: '快递员起跑', image_prompt: '雨夜天台，快递员起跑', reference_indexes: [1, 3, 9] },
      { beat: '发光猫转身', prompt: '发光猫在巷口回头' }
    ]
  }, {
    prompt: '雨夜追逐',
    keyframeLimit: 5,
    maxReferenceCount: 3
  });

  assert.equal(storyboard.title, '霓虹追逐');
  assert.equal(storyboard.keyframeCount, 3);
  assert.equal(storyboard.keyframes.length, 3);
  assert.deepEqual(storyboard.keyframes[0].referenceIndexes, [1, 3]);
  assert.equal(storyboard.transitions.length, 2);
  assert.equal(storyboard.transitions[0].from, 1);
  assert.equal(storyboard.transitions[0].to, 2);
});

test('video storyboard parser accepts fenced json and produces editable fields', () => {
  const storyboard = parseVideoStoryboardResponse(`\`\`\`json
  {
    "title": "纸船入海",
    "keyframe_count": 2,
    "keyframes": [
      { "beat": "纸船被放入水中", "image_prompt": "手把纸船放进溪流" },
      { "beat": "纸船漂向大海", "image_prompt": "纸船在晨光中入海" }
    ],
    "transitions": [
      { "from": 1, "to": 2, "image_prompt": "纸船顺水漂流的中间画面" }
    ]
  }
  \`\`\``, { prompt: '纸船旅行', keyframeLimit: 4 });

  assert.equal(storyboard.keyframes[1].imagePrompt, '纸船在晨光中入海');
  assert.equal(storyboard.transitions[0].imagePrompt, '纸船顺水漂流的中间画面');
});

test('video prompts include global config and reference rules', () => {
  const config = {
    style: '统一电影感、蓝紫色霓虹',
    motion: '镜头从左向右推进',
    negative: '不要文字、Logo、水印'
  };
  const messages = buildVideoStoryboardMessages({
    prompt: '快递员追发光猫',
    keyframeLimit: 5,
    referenceCount: 2,
    referenceLabels: ['角色设定', '街景'],
    config
  });

  assert.match(messages[0].content, /参考图列表/);
  assert.match(messages[0].content, /统一电影感/);
  assert.match(messages[1].content, /最多关键帧数/);

  const keyPrompt = buildVideoKeyframePrompt({
    storyboard: { title: '追猫', visualStyle: '雨夜', continuityRules: '服装一致' },
    keyframe: { beat: '快递员跃过水洼', imagePrompt: '低角度水花飞溅' },
    index: 1,
    total: 3,
    projectPrompt: '追逐发光猫',
    referenceCount: 1,
    config
  });
  assert.match(keyPrompt, /统一电影感/);
  assert.match(keyPrompt, /参考图只用于锁定/);

  const betweenPrompt = buildVideoBetweenPrompt({
    storyboard: { title: '追猫', visualStyle: '雨夜', continuityRules: '服装一致' },
    fromFrame: { beat: '起跳' },
    toFrame: { beat: '落地' },
    transition: { from: 1, to: 2, imagePrompt: '空中到落地之间' },
    fromLabel: '1',
    toLabel: '1.1',
    targetLabel: '1.04',
    config
  });
  assert.match(betweenPrompt, /1-1\.1/);
  assert.match(betweenPrompt, /1\.04/);
  assert.match(betweenPrompt, /两端关键帧将作为参考图/);
  assert.match(betweenPrompt, /不要文字/);
});

test('video storyboard repair prompt asks for parseable JSON fallback', () => {
  const messages = buildVideoStoryboardRepairMessages({
    prompt: '小机器人穿过森林',
    keyframeLimit: 4,
    referenceCount: 1,
    referenceLabels: ['机器人角色'],
    badResponse: '不是 JSON',
    parseError: 'Video storyboard response does not contain a JSON object.'
  });

  assert.match(messages[0].content, /JSON\.parse/);
  assert.match(messages[0].content, /keyframes\.length/);
  assert.match(messages[0].content, /机器人角色/);
  assert.match(messages[1].content, /上一轮解析错误/);
});

test('video reference specs map storyboard indexes to project gallery ids', () => {
  const refs = videoReferenceSpecsFromIndexes([
    { id: 'a' },
    { id: 'b' },
    { id: 'c' }
  ], [2, 1, 2, 99]);
  assert.deepEqual(refs, [
    { type: 'gallery', id: 'b' },
    { type: 'gallery', id: 'a' }
  ]);
});
