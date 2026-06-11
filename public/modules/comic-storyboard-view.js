import { escapeHtml } from './dom.js';
import { COMIC_PAGE_PANEL_LIMITS } from '../../shared/comic-workflow.js';
import {
  encodeEditorOriginalValue,
  ensureStoryboardPageStoryboards,
  normalizedOrFallbackPageStoryboard,
  pageStoryboardContentEditorValue,
  pageStoryboardEditorEnabled,
  pageStoryboardEditorValue,
  pageStoryboardPanelCountEditorValue,
  totalPagePanelCount
} from './comic-model.js';

export function comicStyleGuideHtml(items = [], { selectedId = '' } = {}) {
  return (Array.isArray(items) ? items : []).map((item = {}) => {
    const active = item.id === selectedId ? ' active' : '';
    const tags = Array.isArray(item.tags) ? item.tags : [];
    return `<article class="comic-style-card${active}" data-comic-style-card="${escapeHtml(item.id)}">
      <div class="comic-style-card-head">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(tags.join(' / '))}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
    </article>`;
  }).join('');
}

export function comicStoryboardView(value) {
  if (!value) {
    return {
      empty: true,
      html: `<div class="empty-state">
      <div class="empty-icon" aria-hidden="true">▦</div>
      <p>先输入小故事并点击“生成页分镜”。模型会自动给出角色设定、风格圣经、实际页数和每页画格规划。</p>
    </div>`
    };
  }

  const storyboard = value;
  const showPageStoryboards = pageStoryboardEditorEnabled(storyboard);
  if (showPageStoryboards) ensureStoryboardPageStoryboards(storyboard);
  const pageCount = storyboard.panels.length;
  const innerPanelCount = showPageStoryboards ? totalPagePanelCount(storyboard) : pageCount;
  const characters = storyboard.characters?.length
    ? storyboard.characters.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>：${escapeHtml([
      item.role,
      item.visualSignature,
      item.costume,
      item.expressionRules
    ].filter(Boolean).join('；'))}</li>`).join('')
    : '<li>模型未提取到明确角色；生成时会按故事主体保持一致。</li>';

  const panels = storyboard.panels.map((panel, index) => comicStoryboardPanelHtml(panel, index, { showPageStoryboards })).join('');

  return {
    empty: false,
    html: `
    <section class="comic-bible">
      <div>
        <p class="eyebrow">Storyboard</p>
        <h3>${escapeHtml(storyboard.title)}</h3>
        <p>${escapeHtml(storyboard.logline || '已生成页分镜设计。')}</p>
        <div class="comic-page-summary">
          ${showPageStoryboards
            ? `模型已自动决定 ${pageCount} 页漫画 · 共 ${innerPanelCount} 个页内画格；实际页数和每页画格数都可在生成后微调。`
            : `已生成 ${pageCount} 格分镜；每格提示词可在下方编辑。`}
        </div>
      </div>
      <div class="comic-bible-grid">
        <section>
          <h4>角色一致性</h4>
          <ul>${characters}</ul>
        </section>
        <section>
          <h4>风格圣经</h4>
          <p>${escapeHtml(storyboard.styleBible)}</p>
        </section>
      </div>
    </section>
    <section class="comic-panel-list">${panels}</section>`
  };
}

export function comicStoryboardPanelHtml(panel = {}, index = 0, { showPageStoryboards = false } = {}) {
  const pageStoryboard = showPageStoryboards ? normalizedOrFallbackPageStoryboard(panel, index) : null;
  const pageStoryboardJson = pageStoryboardEditorValue(pageStoryboard);
  const pagePanelCount = pageStoryboardPanelCountEditorValue(pageStoryboard, 1);
  const pageContent = showPageStoryboards ? pageStoryboardContentEditorValue({ ...panel, pageStoryboard }, index) : '';
  const pageStoryboardField = showPageStoryboards ? `<div class="comic-page-editor">
      <div class="comic-page-editor-head">
        <strong>第 ${index + 1} 页（单页分镜）</strong>
        <span>${pagePanelCount} 个页内画格 · 模型生成，可微调</span>
      </div>
      <div class="comic-page-editor-grid">
        <label class="field">
          <span>本页画格数（模型生成，可改）</span>
          <input type="number" min="${COMIC_PAGE_PANEL_LIMITS.min}" max="${COMIC_PAGE_PANEL_LIMITS.max}" value="${pagePanelCount}" data-comic-page-panel-count="${index}" data-comic-page-panel-count-original="${pagePanelCount}" />
        </label>
        <label class="field comic-page-content-field">
          <span>本页画格内容（单页分镜，可改）</span>
          <textarea rows="5" data-comic-page-content="${index}" data-comic-page-content-original="${escapeHtml(encodeEditorOriginalValue(pageContent))}">${escapeHtml(pageContent)}</textarea>
        </label>
      </div>
      <details class="comic-page-json-details">
        <summary>高级：查看/编辑单页分镜 JSON</summary>
        <label class="field comic-page-storyboard-field">
          <span>单页分镜布局 JSON（可改）</span>
          <textarea rows="8" data-comic-page-storyboard="${index}" spellcheck="false">${escapeHtml(pageStoryboardJson)}</textarea>
        </label>
      </details>
    </div>` : '';
  const itemLabel = showPageStoryboards ? `第 ${index + 1} 页` : `#${index + 1}`;
  return `<article class="comic-panel-card" data-comic-panel="${index}">
    <header>
      <span class="comic-panel-index">${escapeHtml(itemLabel)}</span>
      <div>
        <strong>${escapeHtml(panel.beat || `${showPageStoryboards ? '第 ' + (index + 1) + ' 页' : '分镜 ' + (index + 1)}`)}</strong>
        <p>${escapeHtml([panel.shot, panel.camera, panel.composition].filter(Boolean).join(' · ') || '镜头/构图可继续手动补充')}</p>
      </div>
    </header>
    <dl>
      <div><dt>场景</dt><dd>${escapeHtml(panel.setting || '-')}</dd></div>
      <div><dt>动作</dt><dd>${escapeHtml(panel.action || '-')}</dd></div>
      <div><dt>情绪</dt><dd>${escapeHtml(panel.emotion || '-')}</dd></div>
      <div><dt>连续性</dt><dd>${escapeHtml(panel.continuityNotes || '-')}</dd></div>
    </dl>
    <label class="field">
      <span>${showPageStoryboards ? '本页整图提示词（可改）' : '本格生图提示词（可改）'}</span>
      <textarea rows="5" data-comic-panel-prompt="${index}">${escapeHtml(panel.imagePrompt || '')}</textarea>
    </label>
    ${pageStoryboardField}
  </article>`;
}
