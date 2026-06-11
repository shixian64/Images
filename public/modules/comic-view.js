import { escapeHtml } from './dom.js';
import { imageSrcFromItem, pageStoryboardEditorEnabled } from './comic-model.js';
import { t } from './i18n.js';

export const COMIC_RESULT_STATUS_LABELS = Object.freeze({
  pending: 'comic.result.status.pending',
  queued: 'comic.result.status.queued',
  running: 'comic.result.status.running',
  succeeded: 'comic.result.status.succeeded',
  failed: 'comic.result.status.failed',
  cancelled: 'comic.result.status.cancelled',
  timeout: 'comic.result.status.timeout'
});

export function comicResultStatusLabel(status = '') {
  const key = COMIC_RESULT_STATUS_LABELS[status];
  return key ? t(key) : String(status || '');
}

export function comicResultEmptyHtml() {
  return `<div class="empty-state">
      <div class="empty-icon" aria-hidden="true">□</div>
      <p>${escapeHtml(t('comic.result.empty'))}</p>
    </div>`;
}

export function comicResultCardHtml(entry = {}, index = 0, {
  storyboard = null,
  unitLabel = pageStoryboardEditorEnabled(storyboard) ? t('comic.result.unit.page') : t('comic.result.unit.panel')
} = {}) {
  const item = entry.item || {};
  const src = imageSrcFromItem(item);
  const itemIndex = index + 1;
  const title = storyboard?.panels?.[index]?.beat || t('comic.result.titleFallback', { index: itemIndex });
  const status = entry.status || 'pending';
  const statusLabel = comicResultStatusLabel(status);
  const image = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title.slice(0, 80))}" loading="lazy" />`
    : `<div class="comic-result-placeholder">${escapeHtml(statusLabel)}</div>`;
  const actions = src
    ? `<a href="${escapeHtml(src)}" download="comic-panel-${itemIndex}.png">${escapeHtml(t('comic.result.download'))}</a>`
    : '';
  return `<article class="image-card comic-result-card" data-status="${escapeHtml(status)}">
      ${image}
      <div class="image-meta">
        <span>${escapeHtml(t('comic.result.meta', { index: itemIndex, unit: unitLabel, status: statusLabel }))}</span>
        <span>${escapeHtml(entry.jobId ? entry.jobId.slice(0, 8) : '')}</span>
      </div>
      <p class="prompt-preview" title="${escapeHtml(title)}">${escapeHtml(title)}</p>
      ${entry.error ? `<p class="revised">${escapeHtml(entry.error)}</p>` : ''}
      ${actions ? `<div class="comic-result-actions">${actions}</div>` : ''}
    </article>`;
}

export function comicResultsView(generatedPanels = [], storyboard = null) {
  const entries = Array.isArray(generatedPanels) ? generatedPanels : [];
  if (!entries.length) {
    return {
      empty: true,
      html: comicResultEmptyHtml()
    };
  }

  const unitLabel = pageStoryboardEditorEnabled(storyboard) ? t('comic.result.unit.page') : t('comic.result.unit.panel');
  return {
    empty: false,
    html: entries.map((entry, index) => comicResultCardHtml(entry, index, {
      storyboard,
      unitLabel
    })).join('')
  };
}
