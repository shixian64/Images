import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

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
      title="${escapeHtml(t('logs.levelFilter.title', { label }))}"
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
  const syncQueueHint = syncEnabled && syncQueueLength
    ? t('logs.sync.queueHint', { count: Number(syncQueueLength) || 0 })
    : '';
  const levelChips = Object.entries(LEVEL_LABELS)
    .map(([level, label]) => logLevelChipHtml(level, label, counts[level], activeLevel))
    .join('');

  return `
    <span class="chip">${escapeHtml(t('logs.summary.count', { total: logs.length, shown: filtered.length }))}</span>
    ${levelChips}
    <label
      class="chip log-sync-toggle ${syncEnabled ? 'info' : 'warn'}"
      title="${escapeHtml(t('logs.sync.title'))}"
    >
      <input
        id="clientLogSyncToggle"
        type="checkbox"
        aria-label="${escapeHtml(t('logs.sync.aria'))}"
        ${syncEnabled ? 'checked' : ''}
      />
      <span>${escapeHtml(t('logs.sync.label', { state: syncEnabled ? t('logs.sync.on') : t('logs.sync.off') }))}${escapeHtml(syncQueueHint)}</span>
    </label>
  `;
}

export function logEmptyHtml() {
  return `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <p>${escapeHtml(t('logs.empty'))}</p>
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
          <button data-action="copy" data-id="${escapeHtml(log.id)}">${escapeHtml(t('logs.action.copy'))}</button>
        </span>
      </article>`;
}

export function logListHtml(filtered = []) {
  if (!filtered.length) return logEmptyHtml();
  return filtered.map(logItemHtml).join('');
}
