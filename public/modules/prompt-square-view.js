import { escapeHtml } from './dom.js';
import {
  promptSquareSummaryStats,
  promptSquareTags
} from './prompt-square-model.js';
import {
  formatTime,
  sourceLabel
} from './prompt-utils.js';

export function promptSquareTagCloudHtml(items = [], { selectedTag = 'all' } = {}) {
  const tags = promptSquareTags(items);
  const selected = selectedTag !== 'all' && tags.includes(selectedTag) ? selectedTag : 'all';
  return [
    `<button class="prompt-square-tag ${selected === 'all' ? 'active' : ''}" type="button" data-square-tag="all">所有风格</button>`,
    ...tags.map((tag) => (
      `<button class="prompt-square-tag ${selected === tag ? 'active' : ''}" type="button" data-square-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    ))
  ].join('');
}

export function promptSquareSummaryHtml(items = [], filtered = [], { currentUserId = '' } = {}) {
  const stats = promptSquareSummaryStats(items, currentUserId);
  return `
    <span class="chip">广场共 ${items.length} 条 · 当前显示 ${filtered.length}</span>
    <span class="chip info">我的公开 ${stats.mine}</span>
    <span class="chip">累计使用 ${stats.totalUses}</span>
    <span class="chip pin">风格标签 / 热度排序</span>
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
        <div class="empty-icon" aria-hidden="true">⌁</div>
        <p>正在加载提示词广场…</p>
      </div>`
    };
  }

  if (!filtered.length) {
    return {
      empty: true,
      html: `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">✦</div>
        <p>还没有匹配的公开提示词。可以先去“历史提示词管理”公开一条。</p>
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
    : '<span>未标记</span>';
  const meta = [
    item.meta?.sref ? `SREF ${item.meta.sref}` : '',
    item.meta?.sourceHot ? `来源热度 ${item.meta.sourceHot}` : '',
    item.meta?.model,
    item.meta?.size,
    item.meta?.quality
  ].filter(Boolean).join(' · ');
  const mine = item.owner?.id === currentUserId;
  const previewUrl = Array.isArray(item.meta?.previewImages)
    ? item.meta.previewImages[0]
    : item.meta?.previewImage || '';
  const preview = previewUrl
    ? `<button class="prompt-square-preview" type="button" data-square-preview="${escapeHtml(previewUrl)}" aria-label="打开 ${escapeHtml(item.title)} 示例图">
          <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(`${item.title} 示例图`)}" loading="lazy" referrerpolicy="no-referrer" />
        </button>`
    : '<div class="prompt-square-preview prompt-square-preview-placeholder" aria-hidden="true"><span>暂无示例图</span></div>';
  const truncation = item.promptTruncated
    ? `<span title="操作时会自动加载完整提示词">预览已截断 · 完整 ${Number(item.promptLength) || 0} 字</span>`
    : '';
  return `
      <article class="prompt-square-card ${mine ? 'is-mine' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-square-rank">#${index + 1}</div>
        <div class="prompt-square-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(sourceLabel(item.source))}</span>
            ${mine ? '<span class="prompt-public">我的公开</span>' : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
        </div>
        <div class="prompt-square-side">
          <span>作者 ${escapeHtml(item.owner?.username || 'unknown')}</span>
          <span>发布 ${escapeHtml(formatTime(item.publishedAt))}</span>
          <span>使用 ${Number(item.useCount) || 0} 次</span>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
          ${truncation}
        </div>
        ${preview}
        <div class="prompt-history-buttons">
          <button data-action="use-square" type="button">使用</button>
          <button data-action="copy-square" type="button">复制</button>
          <button data-action="save-square" type="button">保存到历史</button>
          ${mine ? '<button data-action="unpublish-square" class="danger" type="button">取消公开</button>' : ''}
        </div>
      </article>`;
}

export function promptSquareErrorHtml(error) {
  return `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">!</div>
          <p>提示词广场加载失败：${escapeHtml(error?.message || String(error))}</p>
        </div>`;
}
