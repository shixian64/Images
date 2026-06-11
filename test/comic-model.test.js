import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_JOB_STATUSES,
  applyStoryboardEditorUpdates,
  decodeEditorOriginalValue,
  encodeEditorOriginalValue,
  ensureStoryboardPageStoryboards,
  firstResultItem,
  generatedEntryFromJob,
  imageIdFromItem,
  imageSrcFromItem,
  itemPanelIndex,
  latestJobForPage,
  pageStoryboardContentEditorValue,
  pageStoryboardEditorEnabled,
  pageStoryboardPanelCountEditorValue,
  parsePageStoryboardEditorValue,
  resizePageSubPanels,
  totalPagePanelCount
} from '../public/modules/comic-model.js';

test('comic model extracts image and job metadata', () => {
  assert.equal(imageSrcFromItem({ local_url: '/a.png' }), '/a.png');
  assert.equal(imageSrcFromItem({ b64_json: 'abc' }), 'data:image/png;base64,abc');
  assert.equal(imageSrcFromItem({ b64_json: 'data:image/webp;base64,abc' }), 'data:image/webp;base64,abc');
  assert.equal(imageIdFromItem({ gallery_id: 'g1' }), 'g1');
  assert.equal(itemPanelIndex({ comic_page_index: '2' }), 2);
  assert.equal(itemPanelIndex({ comic_page_index: '0' }), null);

  const jobs = [
    { id: 'old', status: 'succeeded', payload: { comicPageIndex: 1 }, updatedAt: 20 },
    { id: 'active', status: 'running', payload: { comicPageIndex: 1 }, updatedAt: 10 },
    { id: 'other', status: 'queued', payload: { comicPageIndex: 2 }, updatedAt: 30 }
  ];
  assert.equal(ACTIVE_JOB_STATUSES.has('running'), true);
  assert.equal(latestJobForPage(jobs, 1).id, 'active');

  const done = { id: 'j1', status: 'succeeded', payload: { prompt: 'p' }, result: { data: [{ b64_json: 'abc' }] } };
  assert.equal(firstResultItem(done)?.b64_json, 'abc');
  assert.equal(generatedEntryFromJob(done).status, 'succeeded');
  assert.equal(generatedEntryFromJob({ id: 'j2', status: 'timeout', error: 'slow' }).status, 'failed');
});

test('comic model normalizes editable page storyboard fields', () => {
  const source = 'A. 主画格：角色出现';
  assert.equal(decodeEditorOriginalValue(encodeEditorOriginalValue(source)), source);

  const parsed = parsePageStoryboardEditorValue(JSON.stringify({
    layoutType: '三格页',
    content: '第一页',
    panelCount: 2,
    subPanels: [
      { id: 'A', role: '开场', content: '进门' },
      { id: 'B', role: '反应', content: '回头' }
    ]
  }), 0);
  assert.equal(parsed.panelCount, 2);
  assert.equal(pageStoryboardPanelCountEditorValue(parsed), 2);
  assert.equal(pageStoryboardContentEditorValue({ pageStoryboard: parsed }, 0), '第一页');

  const resized = resizePageSubPanels(parsed, 3, '新 A\n新 B\n新 C');
  assert.deepEqual(resized.map((item) => item.content), ['新 A', '新 B', '新 C']);

  assert.throws(
    () => parsePageStoryboardEditorValue('{bad', 1),
    /第 2 页高级 JSON 不是合法 JSON/
  );
});

test('comic model fills missing page storyboards and counts inner panels', () => {
  const storyboard = {
    panels: [
      { beat: '开始', setting: '桥上', action: '奔跑', imagePrompt: '桥上奔跑' },
      {
        beat: '转折',
        pageStoryboard: {
          layoutType: '双格',
          content: '对峙',
          panelCount: 2,
          subPanels: [{ id: 'A', content: '看见敌人' }, { id: 'B', content: '拔剑' }]
        }
      }
    ]
  };

  assert.equal(pageStoryboardEditorEnabled(storyboard), true);
  ensureStoryboardPageStoryboards(storyboard);
  assert.equal(storyboard.pageStoryboardEnabled, true);
  assert.equal(storyboard.pageCount, 2);
  assert.equal(storyboard.panels[0].pageStoryboard.panelCount, 1);
  assert.equal(totalPagePanelCount(storyboard), 3);
});

test('comic model applies storyboard editor updates', () => {
  const storyboard = {
    panels: [
      {
        beat: '第一页',
        imagePrompt: '旧提示',
        pageStoryboard: {
          layoutType: '单格',
          content: '旧内容',
          panelCount: 1,
          subPanels: [{ id: 'A', content: '旧内容' }]
        }
      },
      {
        beat: '第二页',
        imagePrompt: '旧提示 2'
      }
    ]
  };

  applyStoryboardEditorUpdates(storyboard, {
    panelPrompts: new Map([[0, '  新提示  ']]),
    pagePanelCounts: new Map([[0, 2]]),
    pageContents: new Map([[0, 'A 新内容\nB 新内容']]),
    pageStoryboards: new Map([[1, null]])
  });

  assert.equal(storyboard.panels[0].imagePrompt, '新提示');
  assert.equal(storyboard.panels[0].pageStoryboard.panelCount, 2);
  assert.deepEqual(
    storyboard.panels[0].pageStoryboard.subPanels.map((item) => item.content),
    ['A 新内容', 'B 新内容']
  );
  assert.equal(storyboard.panels[1].pageStoryboard, undefined);
  assert.equal(storyboard.pageCount, 2);
  assert.equal(storyboard.pageStoryboardEnabled, true);
});
