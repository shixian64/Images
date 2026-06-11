import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comicStoryboardPanelHtml,
  comicStoryboardView,
  comicStyleGuideHtml
} from '../public/modules/comic-storyboard-view.js';

test('comic storyboard view renders escaped style guide cards', () => {
  const html = comicStyleGuideHtml([
    {
      id: 'style"><script>',
      label: '<label>',
      tags: ['<tag>', 'ink'],
      summary: '<summary>'
    }
  ], { selectedId: 'style"><script>' });

  assert.match(html, /comic-style-card active/);
  assert.match(html, /data-comic-style-card="style&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /&lt;label&gt;/);
  assert.match(html, /&lt;tag&gt; \/ ink/);
  assert.match(html, /&lt;summary&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('comic storyboard view renders the empty state', () => {
  const view = comicStoryboardView(null);
  assert.equal(view.empty, true);
  assert.match(view.html, /先输入小故事/);
});

test('comic storyboard view escapes storyboard fields and editor content', () => {
  const storyboard = {
    title: '<title>',
    logline: '<logline>',
    styleBible: '<style bible>',
    characters: [{
      name: '<hero>',
      role: '<lead>',
      visualSignature: '<scar>',
      costume: '<coat>',
      expressionRules: '<smile>'
    }],
    panels: [{
      beat: '<beat>',
      shot: '<shot>',
      camera: '<camera>',
      composition: '<composition>',
      setting: '<setting>',
      action: '<action>',
      emotion: '<emotion>',
      continuityNotes: '<continuity>',
      imagePrompt: '<prompt>',
      pageStoryboard: {
        layoutType: '<layout>',
        content: '<page content>',
        panelCount: 2,
        subPanels: [{ id: 'A', content: '<sub a>' }, { id: 'B', content: '<sub b>' }]
      }
    }]
  };

  const view = comicStoryboardView(storyboard);
  assert.equal(view.empty, false);
  assert.match(view.html, /&lt;title&gt;/);
  assert.match(view.html, /&lt;logline&gt;/);
  assert.match(view.html, /&lt;style bible&gt;/);
  assert.match(view.html, /&lt;hero&gt;/);
  assert.match(view.html, /&lt;lead&gt;；&lt;scar&gt;；&lt;coat&gt;；&lt;smile&gt;/);
  assert.match(view.html, /&lt;beat&gt;/);
  assert.match(view.html, /&lt;shot&gt; · &lt;camera&gt; · &lt;composition&gt;/);
  assert.match(view.html, /&lt;setting&gt;/);
  assert.match(view.html, /&lt;action&gt;/);
  assert.match(view.html, /&lt;emotion&gt;/);
  assert.match(view.html, /&lt;continuity&gt;/);
  assert.match(view.html, /&lt;prompt&gt;/);
  assert.match(view.html, /value="2" data-comic-page-panel-count="0"/);
  assert.match(view.html, /data-comic-page-content-original="%3Cpage%20content%3E"/);
  assert.match(view.html, /&lt;page content&gt;/);
  assert.match(view.html, /&quot;layoutType&quot;: &quot;&lt;layout&gt;&quot;/);
  assert.match(view.html, /&quot;content&quot;: &quot;&lt;sub a&gt;&quot;/);

  assert.doesNotMatch(view.html, /<title>/);
  assert.doesNotMatch(view.html, /<prompt>/);
  assert.doesNotMatch(view.html, /<sub a>/);
  assert.equal(storyboard.pageStoryboardEnabled, true);
  assert.equal(storyboard.pageCount, 1);
});

test('comic storyboard panel view supports legacy non-page mode', () => {
  const html = comicStoryboardPanelHtml({
    beat: '',
    setting: '',
    action: '',
    imagePrompt: '<legacy prompt>'
  }, 2, { showPageStoryboards: false });

  assert.match(html, /#3/);
  assert.match(html, /分镜 3/);
  assert.match(html, /本格生图提示词/);
  assert.match(html, /&lt;legacy prompt&gt;/);
  assert.doesNotMatch(html, /comic-page-editor/);
});
