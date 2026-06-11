import { escapeHtml } from './dom.js';
import { t } from './i18n.js';
import {
  promptSquareSummaryStats,
  promptSquareTags
} from './prompt-square-model.js';
import {
  formatTime
} from './prompt-utils.js';

function promptSquareSourceLabel(source) {
  return t(`prompt.source.${source}`, {}, t('prompt.source.manual'));
}

export function promptSquareTagCloudHtml(items = [], { selectedTag = 'all' } = {}) {
  const tags = promptSquareTags(items);
  const selected = selectedTag !== 'all' && tags.includes(selectedTag) ? selectedTag : 'all';
  return [
    `<button class="prompt-square-tag ${selected === 'all' ? 'active' : ''}" type="button" data-square-tag="all">${escapeHtml(t('promptSquare.tag.all'))}</button>`,
    ...tags.map((tag) => (
      `<button class="prompt-square-tag ${selected === tag ? 'active' : ''}" type="button" data-square-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    ))
  ].join('');
}

export function promptSquareSummaryHtml(items = [], filtered = [], { currentUserId = '' } = {}) {
  const stats = promptSquareSummaryStats(items, currentUserId);
  return `
    <span class="chip">${escapeHtml(t('promptSquare.summary.count', { total: items.length, shown: filtered.length }))}</span>
    <span class="chip info">${escapeHtml(t('promptSquare.summary.mine', { count: stats.mine }))}</span>
    <span class="chip">${escapeHtml(t('promptSquare.summary.totalUses', { count: stats.totalUses }))}</span>
    <span class="chip pin">${escapeHtml(t('promptSquare.summary.sortHint'))}</span>
  `;
}

export function promptSquareListState(filtered = [], {
  currentUserId = '',
  loading = false,
  loaded = false
} = {}) {
  if (loading && !loaded) {
    return {
      empty: true,
      html: `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">\u2301</div>
        <p>${escapeHtml(t('promptSquare.empty.loading'))}</p>
      </div>`
    };
  }

  if (!filtered.length) {
    return {
      empty: true,
      html: `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">\u2726</div>
        <p>${escapeHtml(t('promptSquare.empty.noMatches'))}</p>
      </div>`
    };
  }

  return {
    empty: false,
    html: filtered.map((item, index) => promptSquareCardHtml(item, index, { currentUserId })).join('')
  };
}

export function promptSquareCardHtml(item = {}, index = 0, { currentUserId = '' } = {}) {
  const tags = item.tags?.length
    ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
    : `<span>${escapeHtml(t('promptSquare.untagged'))}</span>`;
  const meta = [
    item.meta?.sref ? `SREF ${item.meta.sref}` : '',
    item.meta?.sourceHot ? t('promptSquare.meta.sourceHot', { value: item.meta.sourceHot }) : '',
    item.meta?.model,
    item.meta?.size,
    item.meta?.quality
  ].filter(Boolean).join(' \u00b7 ');
  const mine = item.owner?.id === currentUserId;
  const previewUrl = Array.isArray(item.meta?.previewImages)
    ? item.meta.previewImages[0]
    : item.meta?.previewImage || '';
  const title = item.title || t('promptSquare.untitled');
  const preview = previewUrl
    ? `<button class="prompt-square-preview" type="button" data-square-preview="${escapeHtml(previewUrl)}" aria-label="${escapeHtml(t('promptSquare.preview.openAria', { title }))}">
          <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(t('promptSquare.preview.alt', { title }))}" loading="lazy" referrerpolicy="no-referrer" />
        </button>`
    : `<div class="prompt-square-preview prompt-square-preview-placeholder" aria-hidden="true"><span>${escapeHtml(t('promptSquare.preview.none'))}</span></div>`;
  const truncation = item.promptTruncated
    ? `<span title="${escapeHtml(t('promptSquare.truncation.title'))}">${escapeHtml(t('promptSquare.truncation.text', { count: Number(item.promptLength) || 0 }))}</span>`
    : '';
  return `
      <article class="prompt-square-card ${mine ? 'is-mine' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-square-rank">#${index + 1}</div>
        <div class="prompt-square-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(promptSquareSourceLabel(item.source))}</span>
            ${mine ? `<span class="prompt-public">${escapeHtml(t('promptSquare.badge.mine'))}</span>` : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
        </div>
        <div class="prompt-square-side">
          <span>${escapeHtml(t('promptSquare.side.author', { name: item.owner?.username || t('promptSquare.owner.unknown') }))}</span>
          <span>${escapeHtml(t('promptSquare.side.published', { time: formatTime(item.publishedAt) }))}</span>
          <span>${escapeHtml(t('promptSquare.side.usage', { count: Number(item.useCount) || 0 }))}</span>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
          ${truncation}
        </div>
        ${preview}
        <div class="prompt-history-buttons">
          <button data-action="use-square" type="button">${escapeHtml(t('promptSquare.action.use'))}</button>
          <button data-action="copy-square" type="button">${escapeHtml(t('promptSquare.action.copy'))}</button>
          <button data-action="save-square" type="button">${escapeHtml(t('promptSquare.action.save'))}</button>
          ${mine ? `<button data-action="unpublish-square" class="danger" type="button">${escapeHtml(t('promptSquare.action.unpublish'))}</button>` : ''}
        </div>
      </article>`;
}

export function promptSquareErrorHtml(error) {
  return `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">!</div>
          <p>${escapeHtml(t('promptSquare.error.loadFailed', { error: error?.message || String(error) }))}</p>
        </div>`;
}
