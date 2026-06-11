import { escapeHtml } from './dom.js';
import { t } from './i18n.js';
import {
  formatTime,
  historyPreviewImages
} from './prompt-utils.js';

function promptHistorySourceLabel(source) {
  return t(`prompt.source.${source}`, {}, t('prompt.source.manual'));
}

export function promptHistorySummaryHtml(history = [], filtered = []) {
  const list = Array.isArray(history) ? history : [];
  const shown = Array.isArray(filtered) ? filtered : [];
  const pinned = list.filter((item) => item.pinned).length;
  const published = list.filter((item) => item.isPublic).length;
  const builder = list.filter((item) => item.source === 'builder').length;
  const studio = list.filter((item) => item.source === 'studio').length;
  return `
    <span class="chip">${escapeHtml(t('promptHistory.summary.count', { total: list.length, shown: shown.length }))}</span>
    <span class="chip info">${escapeHtml(t('promptHistory.summary.builder', { count: builder }))}</span>
    <span class="chip">${escapeHtml(t('promptHistory.summary.studio', { count: studio }))}</span>
    <span class="chip public">${escapeHtml(t('promptHistory.summary.published', { count: published }))}</span>
    <span class="chip pin">${escapeHtml(t('promptHistory.summary.pinned', { count: pinned }))}</span>
  `;
}

export function promptHistoryExamplesHtml(item = {}) {
  const previews = historyPreviewImages(item);
  if (!previews.length) return '';
  const title = item.title || t('promptHistory.untitled');
  return `<div class="prompt-history-examples" aria-label="${escapeHtml(t('promptHistory.examples.aria'))}">
    ${previews.map((url, index) => `
      <button class="prompt-history-example" type="button" data-history-preview="${escapeHtml(url)}" aria-label="${escapeHtml(t('promptHistory.examples.previewAria', { index: index + 1 }))}">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(t('promptHistory.examples.alt', { title, index: index + 1 }))}" loading="lazy" referrerpolicy="no-referrer" />
      </button>
    `).join('')}
  </div>`;
}

export function promptHistoryListState(filtered = []) {
  if (!filtered.length) {
    return {
      empty: true,
      html: `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">✦</div>
        <p>${escapeHtml(t('promptHistory.empty'))}</p>
      </div>`
    };
  }

  return {
    empty: false,
    html: filtered.map((item) => promptHistoryItemHtml(item)).join('')
  };
}

export function promptHistoryItemHtml(item = {}) {
  const tags = item.tags?.length
    ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
    : `<span>${escapeHtml(t('promptHistory.untagged'))}</span>`;
  const meta = [item.meta?.model, item.meta?.size, item.meta?.quality].filter(Boolean).join(' · ');
  const previews = historyPreviewImages(item);
  const title = item.title || t('promptHistory.untitled');
  return `
      <article class="prompt-history-item ${item.pinned ? 'is-pinned' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-history-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(promptHistorySourceLabel(item.source))}</span>
            ${item.pinned ? `<span class="prompt-pin">${escapeHtml(t('promptHistory.badge.pinned'))}</span>` : ''}
            ${item.isPublic ? `<span class="prompt-public">${escapeHtml(t('promptHistory.badge.public'))}</span>` : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
          ${promptHistoryExamplesHtml(item)}
        </div>
        <div class="prompt-history-side">
          <span>${escapeHtml(formatTime(item.updatedAt))}</span>
          <span>${escapeHtml(t('promptHistory.usageCount', { count: item.useCount || 0 }))}</span>
          ${previews.length ? `<span>${escapeHtml(t('promptHistory.examples.count', { count: previews.length }))}</span>` : ''}
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="prompt-history-buttons">
          <button data-action="use" type="button">${escapeHtml(t('promptHistory.action.use'))}</button>
          <button data-action="copy" type="button">${escapeHtml(t('promptHistory.action.copy'))}</button>
          <button data-action="load" type="button">${escapeHtml(t('promptHistory.action.loadBuilder'))}</button>
          <button data-action="upload-example" type="button">${escapeHtml(t('promptHistory.action.uploadExample'))}</button>
          ${previews.length ? `<button data-action="clear-examples" type="button">${escapeHtml(t('promptHistory.action.clearExamples'))}</button>` : ''}
          <button data-action="toggle-public" type="button">${escapeHtml(t(item.isPublic ? 'promptHistory.action.unpublish' : 'promptHistory.action.publish'))}</button>
          <button data-action="pin" type="button">${escapeHtml(t(item.pinned ? 'promptHistory.action.unpin' : 'promptHistory.action.pin'))}</button>
          <button data-action="delete" class="danger" type="button">${escapeHtml(t('promptHistory.action.delete'))}</button>
        </div>
      </article>`;
}
