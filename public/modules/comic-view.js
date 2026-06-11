import { escapeHtml } from './dom.js';
import { imageSrcFromItem, pageStoryboardEditorEnabled } from './comic-model.js';

export const COMIC_RESULT_STATUS_LABELS = Object.freeze({
  pending: '等待',
  queued: '排队',
  running: '生成中',
  succeeded: '完成',
  failed: '失败',
  cancelled: '已停止',
  timeout: '超时'
});

export function comicResultStatusLabel(status = '') {
  return COMIC_RESULT_STATUS_LABELS[status] || String(status || '');
}

export function comicResultEmptyHtml() {
  return `<div class="empty-state">
      <div class="empty-icon" aria-hidden="true">□</div>
      <p>页分镜确认后点击“逐页生成图片”。生成时会把首页/上一页作为上下文参考，尽量锁定角色和画风。</p>
    </div>`;
}

export function comicResultCardHtml(entry = {}, index = 0, {
  storyboard = null,
  unitLabel = pageStoryboardEditorEnabled(storyboard) ? '页' : '格'
} = {}) {
  const item = entry.item || {};
  const src = imageSrcFromItem(item);
  const title = storyboard?.panels?.[index]?.beat || `分镜 ${index + 1}`;
  const status = entry.status || 'pending';
  const statusLabel = comicResultStatusLabel(status);
  const image = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title.slice(0, 80))}" loading="lazy" />`
    : `<div class="comic-result-placeholder">${escapeHtml(statusLabel)}</div>`;
  const actions = src
    ? `<a href="${escapeHtml(src)}" download="comic-panel-${index + 1}.png">下载</a>`
    : '';
  return `<article class="image-card comic-result-card" data-status="${escapeHtml(status)}">
      ${image}
      <div class="image-meta">
        <span>第 ${index + 1} ${escapeHtml(unitLabel)} ${escapeHtml(statusLabel)}</span>
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

  const unitLabel = pageStoryboardEditorEnabled(storyboard) ? '页' : '格';
  return {
    empty: false,
    html: entries.map((entry, index) => comicResultCardHtml(entry, index, {
      storyboard,
      unitLabel
    })).join('')
  };
}
