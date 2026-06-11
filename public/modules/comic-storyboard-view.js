import { escapeHtml } from './dom.js';
import { COMIC_PAGE_PANEL_LIMITS } from '../../shared/comic-workflow.js';
import { t } from './i18n.js';
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

function storyText(key, params = {}) {
  return t(`comic.storyboard.${key}`, params);
}

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
      <p>${escapeHtml(storyText('empty'))}</p>
    </div>`
    };
  }

  const storyboard = value;
  const showPageStoryboards = pageStoryboardEditorEnabled(storyboard);
  if (showPageStoryboards) ensureStoryboardPageStoryboards(storyboard);
  const pageCount = storyboard.panels.length;
  const innerPanelCount = showPageStoryboards ? totalPagePanelCount(storyboard) : pageCount;
  const characters = storyboard.characters?.length
    ? storyboard.characters.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>${escapeHtml(storyText('character.joiner'))}${escapeHtml([
      item.role,
      item.visualSignature,
      item.costume,
      item.expressionRules
    ].filter(Boolean).join(storyText('character.separator')))}</li>`).join('')
    : `<li>${escapeHtml(storyText('character.empty'))}</li>`;

  const panels = storyboard.panels.map((panel, index) => comicStoryboardPanelHtml(panel, index, { showPageStoryboards })).join('');

  return {
    empty: false,
    html: `
    <section class="comic-bible">
      <div>
        <p class="eyebrow">Storyboard</p>
        <h3>${escapeHtml(storyboard.title)}</h3>
        <p>${escapeHtml(storyboard.logline || storyText('defaultLogline'))}</p>
        <div class="comic-page-summary">
          ${showPageStoryboards
            ? escapeHtml(storyText('summary.pages', { pageCount, innerPanelCount }))
            : escapeHtml(storyText('summary.panels', { pageCount }))}
        </div>
      </div>
      <div class="comic-bible-grid">
        <section>
          <h4>${escapeHtml(storyText('charactersTitle'))}</h4>
          <ul>${characters}</ul>
        </section>
        <section>
          <h4>${escapeHtml(storyText('styleBibleTitle'))}</h4>
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
        <strong>${escapeHtml(storyText('pageEditor.title', { index: index + 1 }))}</strong>
        <span>${escapeHtml(storyText('pageEditor.countSummary', { count: pagePanelCount }))}</span>
      </div>
      <div class="comic-page-editor-grid">
        <label class="field">
          <span>${escapeHtml(storyText('pageEditor.panelCountLabel'))}</span>
          <input type="number" min="${COMIC_PAGE_PANEL_LIMITS.min}" max="${COMIC_PAGE_PANEL_LIMITS.max}" value="${pagePanelCount}" data-comic-page-panel-count="${index}" data-comic-page-panel-count-original="${pagePanelCount}" />
        </label>
        <label class="field comic-page-content-field">
          <span>${escapeHtml(storyText('pageEditor.contentLabel'))}</span>
          <textarea rows="5" data-comic-page-content="${index}" data-comic-page-content-original="${escapeHtml(encodeEditorOriginalValue(pageContent))}">${escapeHtml(pageContent)}</textarea>
        </label>
      </div>
      <details class="comic-page-json-details">
        <summary>${escapeHtml(storyText('pageEditor.advancedSummary'))}</summary>
        <label class="field comic-page-storyboard-field">
          <span>${escapeHtml(storyText('pageEditor.jsonLabel'))}</span>
          <textarea rows="8" data-comic-page-storyboard="${index}" spellcheck="false">${escapeHtml(pageStoryboardJson)}</textarea>
        </label>
      </details>
    </div>` : '';
  const itemLabel = showPageStoryboards ? storyText('pageLabel', { index: index + 1 }) : `#${index + 1}`;
  return `<article class="comic-panel-card" data-comic-panel="${index}">
    <header>
      <span class="comic-panel-index">${escapeHtml(itemLabel)}</span>
      <div>
        <strong>${escapeHtml(panel.beat || storyText(showPageStoryboards ? 'panelFallback.page' : 'panelFallback.panel', { index: index + 1 }))}</strong>
        <p>${escapeHtml([panel.shot, panel.camera, panel.composition].filter(Boolean).join(' · ') || storyText('shotFallback'))}</p>
      </div>
    </header>
    <dl>
      <div><dt>${escapeHtml(storyText('field.setting'))}</dt><dd>${escapeHtml(panel.setting || '-')}</dd></div>
      <div><dt>${escapeHtml(storyText('field.action'))}</dt><dd>${escapeHtml(panel.action || '-')}</dd></div>
      <div><dt>${escapeHtml(storyText('field.emotion'))}</dt><dd>${escapeHtml(panel.emotion || '-')}</dd></div>
      <div><dt>${escapeHtml(storyText('field.continuity'))}</dt><dd>${escapeHtml(panel.continuityNotes || '-')}</dd></div>
    </dl>
    <label class="field">
      <span>${escapeHtml(storyText(showPageStoryboards ? 'promptLabel.page' : 'promptLabel.panel'))}</span>
      <textarea rows="5" data-comic-panel-prompt="${index}">${escapeHtml(panel.imagePrompt || '')}</textarea>
    </label>
    ${pageStoryboardField}
  </article>`;
}
