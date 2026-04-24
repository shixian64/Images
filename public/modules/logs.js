// 日志面板：分级 / 搜索 / 导出 / 清空 / 复制 / 复用 prompt / 错误徽章。
// 实现 README 承诺但旧 JS 缺失的功能；对应 docs §5.6 状态与反馈 + §13.1。

import { $, escapeHtml, maskKey } from './dom.js';
import { KEYS, readJson, writeJson } from './state.js';

const MAX_LOGS = 300;
const LEVEL_ORDER = ['debug', 'info', 'warn', 'error'];

let logs = readJson(KEYS.logs, []);
const listeners = new Set();

function emit() { for (const fn of listeners) fn(); }

export function onLogsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// meta 中若含 apiKey / key 字段，自动脱敏，避免日志泄漏。
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const copy = { ...meta };
  for (const k of ['apiKey', 'api_key', 'key', 'authorization']) {
    if (copy[k]) copy[k] = maskKey(copy[k]);
  }
  return copy;
}

export function addLog(level, message, meta = {}) {
  if (!LEVEL_ORDER.includes(level)) level = 'info';
  const entry = {
    id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    level,
    message: String(message || ''),
    meta: sanitizeMeta(meta)
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeJson(KEYS.logs, logs);
  emit();
  return entry;
}

export function getLogs() { return logs.slice(); }

export function clearLogs() {
  logs = [];
  writeJson(KEYS.logs, logs);
  emit();
}

export function exportLogs() {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `image-studio-logs-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function filterLogs(level, keyword) {
  return logs.filter((log) => {
    if (level !== 'all' && log.level !== level) return false;
    if (!keyword) return true;
    const hay = [log.message, JSON.stringify(log.meta || {})].join(' ').toLowerCase();
    return hay.includes(keyword.toLowerCase());
  });
}

function renderSummary(filtered) {
  const counts = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const l of logs) counts[l.level] = (counts[l.level] || 0) + 1;
  $('logSummary').innerHTML = `
    <span class="chip">共 ${logs.length} 条 · 显示 ${filtered.length}</span>
    <span class="chip info">Info ${counts.info}</span>
    <span class="chip warn">Warn ${counts.warn}</span>
    <span class="chip error">Error ${counts.error}</span>
  `;

  const badge = $('logErrorBadge');
  if (badge) {
    if (counts.error > 0) {
      badge.hidden = false;
      badge.textContent = String(counts.error);
    } else {
      badge.textContent = '0';
      badge.hidden = true;
    }
  }
}

function renderList(filtered, { onReusePrompt } = {}) {
  const list = $('logList');
  if (!filtered.length) {
    list.dataset.empty = 'true';
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <p>没有匹配的日志。试试切换等级或清空搜索。</p>
      </div>`;
    return;
  }
  list.dataset.empty = 'false';

  list.innerHTML = filtered.map((log) => {
    const promptInMeta = log.meta?.prompt;
    const metaText = log.meta && Object.keys(log.meta).length
      ? `<span class="log-meta">${escapeHtml(JSON.stringify(log.meta))}</span>`
      : '';
    const reuseBtn = promptInMeta
      ? `<button data-action="reuse" data-id="${escapeHtml(log.id)}">复用 Prompt</button>`
      : '';
    const shortTs = log.ts.slice(11, 19);
    return `
      <article class="log-item" data-level="${escapeHtml(log.level)}" data-id="${escapeHtml(log.id)}">
        <span class="log-ts">${escapeHtml(shortTs)}</span>
        <span class="log-level">${escapeHtml(log.level)}</span>
        <span class="log-msg">${escapeHtml(log.message)}${metaText}</span>
        <span class="log-actions">
          <button data-action="copy" data-id="${escapeHtml(log.id)}">复制</button>
          ${reuseBtn}
        </span>
      </article>`;
  }).join('');

  list.onclick = (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const entry = logs.find((l) => l.id === id);
    if (!entry) return;
    if (btn.dataset.action === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(entry, null, 2));
    } else if (btn.dataset.action === 'reuse' && entry.meta?.prompt) {
      onReusePrompt?.(entry.meta.prompt);
    }
  };
}

export function mountLogsPanel({ onReusePrompt } = {}) {
  const levelEl = $('logLevelFilter');
  const searchEl = $('logSearch');

  function rerender() {
    const level = levelEl.value || 'all';
    const keyword = (searchEl.value || '').trim();
    const filtered = filterLogs(level, keyword);
    renderSummary(filtered);
    renderList(filtered, { onReusePrompt });
  }

  levelEl.addEventListener('change', rerender);
  searchEl.addEventListener('input', rerender);
  $('exportLogs').addEventListener('click', exportLogs);
  $('clearLogs').addEventListener('click', () => {
    if (confirm('确认清空所有日志？')) clearLogs();
  });

  onLogsChanged(rerender);
  rerender();
}
