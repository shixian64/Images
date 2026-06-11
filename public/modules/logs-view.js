import { escapeHtml } from './dom.js';

const LEVEL_LABELS = {
  info: 'Info',
  warn: 'Warn',
  error: 'Error'
};

function logCounts(logs) {
  const counts = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const log of logs || []) {
    const level = log?.level;
    counts[level] = (counts[level] || 0) + 1;
  }
  return counts;
}

export function logLevelChipHtml(level, label, count, activeLevel = 'all') {
  const active = activeLevel === level;
  return `
    <button
      type="button"
      class="chip ${escapeHtml(level)} level-chip${active ? ' active' : ''}"
      data-level-filter="${escapeHtml(level)}"
      aria-pressed="${active ? 'true' : 'false'}"
      title="筛选 ${escapeHtml(label)} 日志；再次点击取消筛选"
    >${escapeHtml(label)} ${Number(count) || 0}</button>`;
}

export function logSummaryHtml({
  logs = [],
  filtered = [],
  activeLevel = 'all',
  syncEnabled = true,
  syncQueueLength = 0
} = {}) {
  const counts = logCounts(logs);
  const syncQueueHint = syncEnabled && syncQueueLength ? ` · 待同步 ${Number(syncQueueLength) || 0}` : '';
  const levelChips = Object.entries(LEVEL_LABELS)
    .map(([level, label]) => logLevelChipHtml(level, label, counts[level], activeLevel))
    .join('');

  return `
    <span class="chip">共 ${logs.length} 条 · 显示 ${filtered.length}</span>
    ${levelChips}
    <label
      class="chip log-sync-toggle ${syncEnabled ? 'info' : 'warn'}"
      title="关闭后新日志仅保留在此浏览器，不再上报页面 URL、User-Agent、窗口大小和错误上下文；待同步队列会清空。"
    >
      <input
        id="clientLogSyncToggle"
        type="checkbox"
        aria-label="同步客户端日志到服务器"
        ${syncEnabled ? 'checked' : ''}
      />
      <span>服务端同步：${syncEnabled ? '开' : '关'}${syncQueueHint}</span>
    </label>
  `;
}

export function logEmptyHtml() {
  return `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <p>没有匹配的日志。试试切换等级或清空搜索。</p>
      </div>`;
}

function logMetaHtml(meta) {
  if (!meta || !Object.keys(meta).length) return '';
  return `<span class="log-meta">${escapeHtml(JSON.stringify(meta))}</span>`;
}

export function shortLogTime(ts) {
  return String(ts || '').slice(11, 19);
}

export function logItemHtml(log = {}) {
  const metaText = logMetaHtml(log.meta);
  return `
      <article class="log-item" data-level="${escapeHtml(log.level)}" data-id="${escapeHtml(log.id)}">
        <span class="log-ts">${escapeHtml(shortLogTime(log.ts))}</span>
        <span class="log-level">${escapeHtml(log.level)}</span>
        <span class="log-msg">${escapeHtml(log.message)}${metaText}</span>
        <span class="log-actions">
          <button data-action="copy" data-id="${escapeHtml(log.id)}">复制</button>
        </span>
      </article>`;
}

export function logListHtml(filtered = []) {
  if (!filtered.length) return logEmptyHtml();
  return filtered.map(logItemHtml).join('');
}

