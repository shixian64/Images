import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMIC_PAGE_PANEL_LIMITS,
  COMIC_PANEL_LIMITS,
  buildComicImagePrompt,
  buildComicStoryboardRepairMessages,
  buildComicStoryboardMessages,
  clampComicPagePanelCount,
  clampComicPanelCount,
  comicPageStoryboardToJson,
  comicReferenceSpecs,
  comicStyleOptions,
  getComicStyleTemplate,
  normalizeComicPageStoryboard,
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
  assert.equal(clampComicPagePanelCount(99), COMIC_PAGE_PANEL_LIMITS.max);
  assert.equal(clampComicPagePanelCount(2.9), 2);
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

test('storyboard prompt can request per-page storyboard JSON', () => {
  const messages = buildComicStoryboardMessages({
    story: '少年在天台和巨龙对峙，下一秒城市灯光全部熄灭。',
    styleId: 'american-comic',
    panelCount: 2,
    includePageStoryboards: true
  });

  assert.match(messages[0].content, /page_storyboard/);
  assert.match(messages[0].content, /页数由你自动决定/);
  assert.match(messages[0].content, /先自动决定 page_count/);
  assert.match(messages[0].content, /panel_plan 的每一项都代表一页漫画/);
  assert.match(messages[0].content, /自动决定每页 panel_count/);
  assert.match(messages[0].content, /大格主视觉型/);
  assert.match(messages[0].content, /斜切分镜/);
  assert.match(messages[1].content, /页数上限：2/);
  assert.match(messages[1].content, /每一页额外生成 page_storyboard JSON/);
});

test('storyboard repair prompt asks for parseable JSON fallback', () => {
  const messages = buildComicStoryboardRepairMessages({
    story: '少年在天台遇见一只会发光的白鸽。',
    styleId: 'american-comic',
    panelCount: 2,
    includePageStoryboards: true,
    badResponse: '这里没有 JSON，只有解释。',
    parseError: 'Storyboard response does not contain a JSON object.'
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /JSON\.parse/);
  assert.match(messages[0].content, /禁止尾逗号/);
  assert.match(messages[0].content, /page_storyboard/);
  assert.match(messages[1].content, /上一轮解析错误/);
  assert.match(messages[1].content, /这里没有 JSON/);
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
      "image_prompt": "雨夜街角，黄色雨衣女孩蹲下看发光猫",
      "page_storyboard": {
        "layout_type": "横向条带型",
        "layout_keywords": ["strip layout", "clear reading order"],
        "reading_order": "从上到下三条横向阅读",
        "visual_hierarchy": "第一条交代雨夜环境，第二条突出女孩，第三条聚焦发光猫",
        "narrative_function": "建立奇遇开端",
        "content": "雨夜街角，女孩在旧楼入口遇见发光猫。",
        "panel_count": 3,
        "sub_panels": [
          {
            "id": "A",
            "role": "开场",
            "area": "顶部通栏",
            "shot": "远景",
            "content": "雨夜街角与旧楼入口"
          }
        ],
        "design_notes": "横向分层，节奏安静但有神秘感",
        "ai_prompt_addon": "strip layout, manga page layout"
      }
    }
  ]
}
\`\`\``, { panelCount: 2 });

  assert.equal(result.title, '屋顶星河');
  assert.equal(result.styleId, 'manhwa-romance');
  assert.equal(result.characters[0].visualSignature, '短发、黄色雨衣、星形发夹');
  assert.equal(result.panels.length, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.panels[0].pageStoryboard.layoutType, '横向条带型');
  assert.equal(result.panels[0].pageStoryboard.content, '雨夜街角，女孩在旧楼入口遇见发光猫。');
  assert.equal(result.panels[0].pageStoryboard.subPanels[0].area, '顶部通栏');
  assert.match(result.panels[1].imagePrompt, /第 2 格/);
});

test('storyboard parser repairs common malformed JSON from chat models', () => {
  const result = parseComicStoryboardResponse(`模型输出如下：
\`\`\`json
{
  "title": "白鸽和薄荷",
  "style_id": "american-comic",
  "characters": [
    { "name": "白鸽", "visual_signature": "白色羽毛" }
    { "name": "薄荷", "visual_signature": "绿色围巾" }
  ],
  "panel_plan": [
    { "index": 1, "beat": "白鸽落在薄荷窗边", "image_prompt": "窗边白鸽与绿色围巾少年" },
  ],
}
\`\`\`
请查收。`, { panelCount: 1 });

  assert.equal(result.title, '白鸽和薄荷');
  assert.equal(result.styleId, 'american-comic');
  assert.equal(result.characters.length, 2);
  assert.equal(result.panels.length, 1);
  assert.equal(result.panels[0].beat, '白鸽落在薄荷窗边');
});

test('storyboard parser can keep model-selected page count in auto page mode', () => {
  const result = parseComicStoryboardResponse(JSON.stringify({
    title: '自动页数',
    page_count: 2,
    panel_plan: [
      { index: 1, beat: '第一页', image_prompt: '第一页画面' },
      { index: 2, beat: '第二页', image_prompt: '第二页画面' }
    ]
  }), { panelCount: 6, autoPageCount: true });

  assert.equal(result.pageCount, 2);
  assert.equal(result.panels.length, 2);
  assert.equal(result.panels[1].beat, '第二页');

  const capped = parseComicStoryboardResponse(JSON.stringify({
    title: '超出上限',
    page_count: 9,
    panel_plan: Array.from({ length: 9 }, (_, index) => ({
      index: index + 1,
      beat: `第 ${index + 1} 页`,
      image_prompt: `第 ${index + 1} 页画面`
    }))
  }), { panelCount: 3, autoPageCount: true });

  assert.equal(capped.pageCount, 3);
  assert.equal(capped.panels.length, 3);
});

test('page storyboard normalization and JSON formatting are stable', () => {
  const page = normalizeComicPageStoryboard({
    layoutType: '大格主视觉型',
    layoutKeywords: 'dominant panel, manga page layout',
    readingOrder: '先读顶部小格，再进入中央大格',
    content: '空荡楼顶之后，巨龙突然落下。',
    panelCount: 2,
    subPanels: [
      { id: 'A', role: '铺垫', area: '顶部小格', content: '空荡楼顶' },
      { id: 'B', role: '爆发', area: '中央大格', content: '巨龙落下' }
    ]
  });

  assert.equal(page.layoutType, '大格主视觉型');
  assert.equal(page.content, '空荡楼顶之后，巨龙突然落下。');
  assert.deepEqual(page.layoutKeywords, ['dominant panel', 'manga page layout']);
  assert.equal(page.subPanels.length, 2);
  assert.match(comicPageStoryboardToJson(page), /"layoutType": "大格主视觉型"/);
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

test('comic image prompt includes page storyboard JSON when available', () => {
  const storyboard = parseComicStoryboardResponse(JSON.stringify({
    title: '天台对峙',
    style_id: 'american-comic',
    panel_plan: [
      {
        index: 1,
        beat: '少年看到巨龙降落',
        image_prompt: '少年站在天台边缘，巨龙从云层俯冲',
        page_storyboard: {
          layout_type: '大格主视觉型',
          reading_order: '先读左上角反应格，再进入中央大格',
          visual_hierarchy: '中央大格占页面大部分，突出巨龙压迫感',
          content: '少年抬头发现巨龙压向城市，页面用主视觉营造压迫。',
          panel_count: 2,
          sub_panels: [
            { id: 'A', role: '反应', area: '左上小格', content: '少年抬头' },
            { id: 'B', role: '主视觉', area: '中央大格', content: '巨龙压向城市' }
          ]
        }
      }
    ]
  }));

  const prompt = buildComicImagePrompt({ storyboard, panel: storyboard.panels[0], panelIndex: 1, totalPanels: 1 });

  assert.match(prompt, /生成第 1\/1 页/);
  assert.match(prompt, /本页分镜内容：少年抬头发现巨龙压向城市/);
  assert.match(prompt, /当前页漫画页分镜 JSON/);
  assert.match(prompt, /大格主视觉型/);
  assert.match(prompt, /central|中央大格/);
});

test('comic reference specs use first and previous generated images without duplicates', () => {
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'a' }), [{ type: 'gallery', id: 'a' }]);
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'b' }), [
    { type: 'gallery', id: 'a' },
    { type: 'gallery', id: 'b' }
  ]);
  assert.deepEqual(comicReferenceSpecs({ anchorId: 'a', previousId: 'b', enabled: false }), []);
});
