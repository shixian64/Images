// 日志面板：分级 / 搜索 / 导出 / 清空 / 复制 / 错误徽章。
// 实现 README 承诺但旧 JS 缺失的功能；对应 docs §5.6 状态与反馈 + §13.1。

import { $, escapeHtml, maskKey, setStatus } from './dom.js';
import { apiFetch, getLastRequestTraceId } from './auth.js';
import { copyText } from './clipboard.js';
import { redactSecrets } from '../../shared/redaction.js';
import {
  KEYS,
  readJsonScoped,
  readStringScoped,
  writeJsonScoped,
  writeStringScoped
} from './state.js';

const MAX_LOGS = 300;
const SYNC_QUEUE_MAX = 300;
const SYNC_BATCH_SIZE = 50;
const SYNC_RETRY_MS = 15_000;
const LEVEL_ORDER = ['debug', 'info', 'warn', 'error'];

// why：延迟到首次访问/挂载，模块加载期用户尚未就绪；避免误用 guest scope。
let logs = [];
let logsLoaded = false;
let errorSeenAt = '';
let syncQueue = [];
let syncQueueLoaded = false;
let syncTimer = null;
let syncInFlight = false;
let clientErrorHandlersMounted = false;
function ensureLogsLoaded() {
  if (logsLoaded) return;
  logsLoaded = true;
  const storedLogs = readJsonScoped(KEYS.logs, []);
  logs = sanitizeLoadedEntries(storedLogs, MAX_LOGS);
  if (entriesChanged(storedLogs, logs)) writeJsonScoped(KEYS.logs, logs);
  errorSeenAt = readStringScoped(KEYS.logErrorSeenAt, '');
}

function ensureSyncQueueLoaded() {
  if (syncQueueLoaded) return;
  syncQueueLoaded = true;
  const storedQueue = readJsonScoped(KEYS.clientLogSyncQueue, []);
  syncQueue = sanitizeLoadedEntries(storedQueue, SYNC_QUEUE_MAX);
  if (entriesChanged(storedQueue, syncQueue)) writeJsonScoped(KEYS.clientLogSyncQueue, syncQueue);
}
const listeners = new Set();

function emit() { for (const fn of listeners) fn(); }

export function onLogsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SENSITIVE_META_KEY_RE = /(?:api[-_ ]?key|authorization|bearer|token|password|passwd|secret|credential)/i;
const REDACTED_FIELD = '••••';

export function redactLogString(value) {
  return redactSecrets(value);
}

// meta 中若含 apiKey / key 字段，自动脱敏，避免日志泄漏。
function isSensitiveMetaKey(key) {
  return SENSITIVE_META_KEY_RE.test(String(key || ''));
}

function sanitizeSensitiveMetaValue(value) {
  if (typeof value !== 'string') return REDACTED_FIELD;
  if (/^sk-[A-Za-z0-9._-]{6,}$/.test(value)) return maskKey(value);
  const redacted = redactLogString(value);
  if (redacted !== value) return redacted;
  return value.startsWith('sk-') ? maskKey(value) : REDACTED_FIELD;
}

function sanitizeMetaValue(value, depth = 0) {
  if (depth > 5) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactLogString(value);
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeMetaValue(item, depth + 1));
  if (typeof value !== 'object') return value;
  const copy = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    copy[key] = isSensitiveMetaKey(key)
      ? sanitizeSensitiveMetaValue(item)
      : sanitizeMetaValue(item, depth + 1);
  }
  return copy;
}

export function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  return sanitizeMetaValue(meta);
}

export function sanitizeLogEntryForStorage(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const sanitized = {
    ...entry,
    message: redactLogString(entry.message || ''),
    meta: sanitizeMeta(entry.meta || {})
  };
  if (entry.context && typeof entry.context === 'object') {
    sanitized.context = sanitizeMeta(entry.context);
  }
  return sanitized;
}

function sanitizeLoadedEntries(entries, max) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, max).map(sanitizeLogEntryForStorage);
}

function entriesChanged(before, after) {
  try {
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    return true;
  }
}

function persistSyncQueue() {
  ensureSyncQueueLoaded();
  if (syncQueue.length > SYNC_QUEUE_MAX) syncQueue = syncQueue.slice(0, SYNC_QUEUE_MAX);
  writeJsonScoped(KEYS.clientLogSyncQueue, syncQueue);
}

export function isClientLogSyncEnabled() {
  return readStringScoped(KEYS.clientLogSyncEnabled, '1') !== '0';
}

function clearSyncTimer() {
  if (!syncTimer) return;
  clearTimeout(syncTimer);
  syncTimer = null;
}

function clearSyncQueue() {
  ensureSyncQueueLoaded();
  if (!syncQueue.length) return;
  syncQueue = [];
  persistSyncQueue();
}

export function setClientLogSyncEnabled(enabled) {
  const normalized = enabled ? '1' : '0';
  writeStringScoped(KEYS.clientLogSyncEnabled, normalized);
  if (!enabled) {
    clearSyncTimer();
    clearSyncQueue();
  }
}

function clientContext(traceId = getLastRequestTraceId()) {
  return {
    pageUrl: redactLogString(location.href),
    userAgent: redactLogString(navigator.userAgent),
    language: redactLogString(navigator.language),
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    traceId
  };
}

function entryForSync(entry) {
  const traceId = entry.traceId || getLastRequestTraceId();
  return {
    id: entry.id,
    ts: entry.ts,
    level: entry.level,
    message: redactLogString(entry.message),
    meta: sanitizeMeta(entry.meta),
    traceId,
    context: clientContext(traceId)
  };
}

function scheduleSync(delay = 800) {
  if (!isClientLogSyncEnabled()) return;
  ensureSyncQueueLoaded();
  if (!syncQueue.length || syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncClientLogs();
  }, delay);
}

function enqueueSync(entry) {
  if (!isClientLogSyncEnabled() || entry?.syncEligible === false) return;
  ensureSyncQueueLoaded();
  if (!entry?.id) return;
  if (!syncQueue.some((item) => item.id === entry.id)) {
    syncQueue.unshift(entry);
    persistSyncQueue();
  }
  scheduleSync();
}

function enqueueExistingLogsForSync() {
  if (!isClientLogSyncEnabled()) return;
  ensureLogsLoaded();
  ensureSyncQueueLoaded();
  const queued = new Set(syncQueue.map((item) => item.id));
  let changed = false;
  for (const entry of logs.slice(0, MAX_LOGS)) {
    if (!entry?.id || entry.syncEligible === false || queued.has(entry.id)) continue;
    syncQueue.push(entry);
    queued.add(entry.id);
    changed = true;
  }
  if (changed) persistSyncQueue();
}

export async function syncClientLogs() {
  ensureSyncQueueLoaded();
  if (!isClientLogSyncEnabled()) {
    clearSyncTimer();
    clearSyncQueue();
    return;
  }
  if (syncInFlight || !syncQueue.length) return;
  syncInFlight = true;
  const batch = syncQueue.slice(0, SYNC_BATCH_SIZE);
  try {
    const resp = await apiFetch('/api/client-logs', {
      method: 'POST',
      body: { items: batch.map(entryForSync) }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const sentIds = new Set(batch.map((item) => item.id));
    syncQueue = syncQueue.filter((item) => !sentIds.has(item.id));
    persistSyncQueue();
    if (syncQueue.length) scheduleSync(300);
  } catch {
    scheduleSync(SYNC_RETRY_MS);
  } finally {
    syncInFlight = false;
  }
}

export function addLog(level, message, meta = {}) {
  ensureLogsLoaded();
  if (!LEVEL_ORDER.includes(level)) level = 'info';
  const traceId = getLastRequestTraceId();
  const entry = {
    id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    level,
    message: redactLogString(message || ''),
    meta: sanitizeMeta(meta),
    traceId,
    syncEligible: isClientLogSyncEnabled()
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeJsonScoped(KEYS.logs, logs);
  enqueueSync(entry);
  emit();
  return entry;
}

export function getLogs() { ensureLogsLoaded(); return logs.slice(); }

export function clearLogs() {
  ensureLogsLoaded();
  logs = [];
  writeJsonScoped(KEYS.logs, logs);
  emit();
}

function getUnreadErrorCount() {
  ensureLogsLoaded();
  return logs.filter((log) => (
    log.level === 'error' &&
    (!errorSeenAt || String(log.ts || '') > errorSeenAt)
  )).length;
}

function markErrorsSeen() {
  ensureLogsLoaded();
  const latestError = logs.find((log) => log.level === 'error');
  errorSeenAt = latestError?.ts || new Date().toISOString();
  writeStringScoped(KEYS.logErrorSeenAt, errorSeenAt);
}

function errorMeta(error) {
  if (!error) return {};
  if (typeof error === 'string') return { reason: error };
  return {
    name: error.name || '',
    message: error.message || String(error),
    stack: error.stack || ''
  };
}

function mountClientErrorLogging() {
  if (clientErrorHandlersMounted) return;
  clientErrorHandlersMounted = true;
  window.addEventListener('error', (ev) => {
    const target = ev.target;
    if (target && target !== window && !ev.message) {
      addLog('error', 'client.resource_error', {
        tagName: target.tagName || '',
        src: target.currentSrc || target.src || target.href || ''
      });
      return;
    }
    addLog('error', 'client.error', {
      message: ev.message || '',
      source: ev.filename || '',
      lineno: ev.lineno || 0,
      colno: ev.colno || 0,
      ...errorMeta(ev.error)
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    addLog('error', 'client.unhandledrejection', errorMeta(ev.reason));
  });
}

export function exportLogs() {
  ensureLogsLoaded();
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

function renderSummary(filtered, activeLevel = 'all') {
  ensureSyncQueueLoaded();
  const counts = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const l of logs) counts[l.level] = (counts[l.level] || 0) + 1;
  const syncEnabled = isClientLogSyncEnabled();
  const syncQueueHint = syncEnabled && syncQueue.length ? ` · 待同步 ${syncQueue.length}` : '';
  const levelChip = (level, label) => `
    <button
      type="button"
      class="chip ${level} level-chip${activeLevel === level ? ' active' : ''}"
      data-level-filter="${level}"
      aria-pressed="${activeLevel === level ? 'true' : 'false'}"
      title="筛选 ${label} 日志；再次点击取消筛选"
    >${label} ${counts[level]}</button>`;

  $('logSummary').innerHTML = `
    <span class="chip">共 ${logs.length} 条 · 显示 ${filtered.length}</span>
    ${levelChip('info', 'Info')}
    ${levelChip('warn', 'Warn')}
    ${levelChip('error', 'Error')}
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

  const badge = $('logErrorBadge');
  if (badge) {
    const unreadErrors = getUnreadErrorCount();
    if (unreadErrors > 0) {
      badge.hidden = false;
      badge.textContent = String(unreadErrors);
      badge.title = `${unreadErrors} 条新的错误日志`;
    } else {
      badge.textContent = '0';
      badge.hidden = true;
      badge.removeAttribute('title');
    }
  }
}

function renderList(filtered) {
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
    const metaText = log.meta && Object.keys(log.meta).length
      ? `<span class="log-meta">${escapeHtml(JSON.stringify(log.meta))}</span>`
      : '';
    const shortTs = log.ts.slice(11, 19);
    return `
      <article class="log-item" data-level="${escapeHtml(log.level)}" data-id="${escapeHtml(log.id)}">
        <span class="log-ts">${escapeHtml(shortTs)}</span>
        <span class="log-level">${escapeHtml(log.level)}</span>
        <span class="log-msg">${escapeHtml(log.message)}${metaText}</span>
        <span class="log-actions">
          <button data-action="copy" data-id="${escapeHtml(log.id)}">复制</button>
        </span>
      </article>`;
  }).join('');

  list.onclick = async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const entry = logs.find((l) => l.id === id);
    if (!entry) return;
    if (btn.dataset.action === 'copy') {
      try {
        const result = await copyText(JSON.stringify(entry, null, 2));
        setStatus(result.manual ? '请在弹出的文本框中手动复制日志' : '日志已复制', result.manual ? 'ready' : 'ok', 1400);
      } catch (err) {
        setStatus(`复制失败：${err?.message || err}`, 'err', 1800);
      }
    }
  };
}

export function mountLogsPanel() {
  ensureLogsLoaded();
  ensureSyncQueueLoaded();
  mountClientErrorLogging();
  enqueueExistingLogsForSync();
  scheduleSync(300);
  const searchEl = $('logSearch');
  let activeLevel = 'all';

  function rerender() {
    const keyword = (searchEl.value || '').trim();
    const filtered = filterLogs(activeLevel, keyword);
    renderSummary(filtered, activeLevel);
    renderList(filtered);
  }

  searchEl.addEventListener('input', rerender);
  const summaryEl = $('logSummary');
  summaryEl.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-level-filter]');
    if (!chip) return;
    activeLevel = activeLevel === chip.dataset.levelFilter ? 'all' : chip.dataset.levelFilter;
    rerender();
  });
  summaryEl.addEventListener('change', (ev) => {
    if (ev.target?.id !== 'clientLogSyncToggle') return;
    setClientLogSyncEnabled(Boolean(ev.target.checked));
    if (isClientLogSyncEnabled()) scheduleSync(300);
    rerender();
  });
  $('exportLogs').addEventListener('click', exportLogs);
  $('clearLogs').addEventListener('click', () => {
    if (confirm('确认清空所有日志？')) clearLogs();
  });
  document.addEventListener('app-tab-changed', (ev) => {
    if (ev.detail?.tabId !== 'logsPanel') return;
    markErrorsSeen();
    rerender();
  });

  onLogsChanged(rerender);
  if ($('logsPanel')?.classList.contains('active')) {
    markErrorsSeen();
  }
  rerender();
}
