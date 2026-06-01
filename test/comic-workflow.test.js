import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMIC_PANEL_LIMITS,
  buildComicImagePrompt,
  buildComicStoryboardMessages,
  clampComicPanelCount,
  comicReferenceSpecs,
  comicStyleOptions,
  getComicStyleTemplate,
  parseComicStoryboardResponse
} from '../shared/comic-workflow.js';

test('comic style templates expose selectable built-in styles', () => {
  const styles = comicStyleOptions();

  assert.ok(styles.length >= 5);
  assert.ok(styles.some((item) => item.id === 'manhwa-romance'));
  assert.ok(styles.some((item) => item.id === 'ink-wash'));
  assert.equal(getComicStyleTemplate('missing').id, 'webtoon-color');
});

test('comic panel count is clamped to supported limits', () => {
  assert.equal(clampComicPanelCount(-1), COMIC_PANEL_LIMITS.default);
  assert.equal(clampComicPanelCount(99), COMIC_PANEL_LIMITS.max);
  assert.equal(clampComicPanelCount(3.8), 3);
});

test('storyboard prompt requests strict JSON and exact panel count', () => {
  const messages = buildComicStoryboardMessages({
    story: '一只发光的猫带女孩找到城市屋顶上的星河。',
    styleId: 'ink-wash',
    panelCount: 4
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /exactly 4/);
  assert.match(messages[0].content, /JSON/);
  assert.match(messages[0].content, /水墨/);
});

test('storyboard parser normalizes fenced JSON and panels', () => {
  const result = parseComicStoryboardResponse(`\`\`\`json
{
  "title": "屋顶星河",
  "style_id": "manhwa-romance",
  "characters": [
    {
      "name": "小夏",
      "visual_signature": "短发、黄色雨衣、星形发夹",
      "costume": "黄色雨衣"
    }
  ],
  "panel_plan": [
    {
      "index": 1,
      "beat": "雨夜遇见发光猫",
      "shot": "中景",
      "image_prompt": "雨夜街角，黄色雨衣女孩蹲下看发光猫"
    }
  ]
}
\`\`\``, { panelCount: 2 });

  assert.equal(result.title, '屋顶星河');
  assert.equal(result.styleId, 'manhwa-romance');
  assert.equal(result.characters[0].visualSignature, '短发、黄色雨衣、星形发夹');
  assert.equal(result.panels.length, 2);
  assert.match(result.panels[1].imagePrompt, /第 2 格/);
});

test('comic image prompt contains style, character bible, panel details, and context rule', () => {
  const storyboard = parseComicStoryboardResponse(JSON.stringify({
    title: '屋顶星河',
    style_id: 'webtoon-color',
    style_bible: '干净线稿，蓝紫夜色，高光统一。',
    characters: [
      {
        name: '小夏',
        role: '主角',
        visual_signature: '短发、黄色雨衣、星形发夹',
        costume: '黄色雨衣'
      }
    ],
    panel_plan: [
      {
        index: 1,
        beat: '她跟着猫跑上楼梯',
        shot: '低角度中景',
        camera: '向上仰拍',
        composition: '楼梯形成对角线',
        image_prompt: '女孩和发光猫沿旧楼梯向上奔跑'
      }
    ]
  }));

  const prompt = buildComicImagePrompt({ storyboard, panel: storyboard.panels[0], panelIndex: 1, totalPanels: 1 });

  assert.match(prompt, /vertical color webtoon/);
  assert.match(prompt, /短发、黄色雨衣、星形发夹/);
  assert.match(prompt, /楼梯形成对角线/);
  assert.match(prompt, /参考图只用于锁定角色/);
  assert.match(prompt, /不要生成任何文字/);
});

test('comic reference specs use first and previous generated images without duplicates', () => {
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'a' }), [{ type: 'gallery', id: 'a' }]);
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'b' }), [
    { type: 'gallery', id: 'a' },
    { type: 'gallery', id: 'b' }
  ]);
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'b', enabled: false }), []);
});
