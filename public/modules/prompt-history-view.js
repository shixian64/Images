import { escapeHtml } from './dom.js';
import {
  formatTime,
  historyPreviewImages,
  sourceLabel
} from './prompt-utils.js';

export function promptHistorySummaryHtml(history = [], filtered = []) {
  const list = Array.isArray(history) ? history : [];
  const shown = Array.isArray(filtered) ? filtered : [];
  const pinned = list.filter((item) => item.pinned).length;
  const published = list.filter((item) => item.isPublic).length;
  const builder = list.filter((item) => item.source === 'builder').length;
  const studio = list.filter((item) => item.source === 'studio').length;
  return `
    <span class="chip">共 ${list.length} 条 · 显示 ${shown.length}</span>
    <span class="chip info">构造器 ${builder}</span>
    <span class="chip">生成页 ${studio}</span>
    <span class="chip public">已公开 ${published}</span>
    <span class="chip pin">固定 ${pinned}</span>
  `;
}

export function promptHistoryExamplesHtml(item = {}) {
  const previews = historyPreviewImages(item);
  if (!previews.length) return '';
  return `<div class="prompt-history-examples" aria-label="示例图">
    ${previews.map((url, index) => `
      <button class="prompt-history-example" type="button" data-history-preview="${escapeHtml(url)}" aria-label="预览第 ${index + 1} 张示例图">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(`${item.title} 示例图 ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer" />
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
        <p>没有匹配的历史提示词。试试换一个搜索词或标签。</p>
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
    : '<span>未标记</span>';
  const meta = [item.meta?.model, item.meta?.size, item.meta?.quality].filter(Boolean).join(' · ');
  const previews = historyPreviewImages(item);
  return `
      <article class="prompt-history-item ${item.pinned ? 'is-pinned' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-history-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(sourceLabel(item.source))}</span>
            ${item.pinned ? '<span class="prompt-pin">已固定</span>' : ''}
            ${item.isPublic ? '<span class="prompt-public">已公开</span>' : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
          ${promptHistoryExamplesHtml(item)}
        </div>
        <div class="prompt-history-side">
          <span>${escapeHtml(formatTime(item.updatedAt))}</span>
          <span>使用 ${item.useCount || 0} 次</span>
          ${previews.length ? `<span>示例图 ${previews.length} 张</span>` : ''}
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="prompt-history-buttons">
          <button data-action="use" type="button">使用</button>
          <button data-action="copy" type="button">复制</button>
          <button data-action="load" type="button">载入构造</button>
          <button data-action="upload-example" type="button">上传示例图</button>
          ${previews.length ? '<button data-action="clear-examples" type="button">清空示例图</button>' : ''}
          <button data-action="toggle-public" type="button">${item.isPublic ? '取消公开' : '公开到广场'}</button>
          <button data-action="pin" type="button">${item.pinned ? '取消固定' : '固定'}</button>
          <button data-action="delete" class="danger" type="button">删除</button>
        </div>
      </article>`;
}
