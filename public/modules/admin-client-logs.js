// ?????????????

import { $, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import {
  adminClientLogsErrorHtml,
  adminClientLogsSummaryText,
  adminClientLogsTableView,
  adminClientLogUserOptionsHtml
} from './admin-client-logs-view.js';

let adminClientLogUsers = [];

export function isAdminClientLogsLoaded() {
  return adminClientLogsLoaded;
}

export function setAdminClientLogUsers(users = []) {
  adminClientLogUsers = Array.isArray(users) ? users : [];
  syncClientLogUserFilter();
}

// ---------- 客户端详细日志 ----------

let adminClientLogs = [];
let adminClientLogsLoaded = false;
const adminClientLogFilter = {
  userId: '',
  level: '',
  search: ''
};

function syncClientLogUserFilter() {
  const userSel = $('adminClientLogUserFilter');
  if (!userSel) return;
  const current = adminClientLogFilter.userId;
  userSel.innerHTML = adminClientLogUserOptionsHtml(adminClientLogUsers, current);
}

function buildAdminClientLogQuery() {
  const params = new URLSearchParams();
  params.set('limit', '300');
  if (adminClientLogFilter.userId) params.set('userId', adminClientLogFilter.userId);
  if (adminClientLogFilter.level) params.set('level', adminClientLogFilter.level);
  if (adminClientLogFilter.search) params.set('search', adminClientLogFilter.search);
  return params.toString();
}

export function renderAdminClientLogs() {
  const wrap = $('adminClientLogsTableWrap');
  const summary = $('adminClientLogsSummary');
  if (!wrap) return;
  syncClientLogUserFilter();
  if (summary) summary.textContent = adminClientLogsSummaryText(adminClientLogs);

  wrap.innerHTML = adminClientLogsTableView(adminClientLogs, { users: adminClientLogUsers }).html;
}

export async function refreshAdminClientLogs({ silent = false } = {}) {
  try {
    const resp = await apiFetch(`/api/admin/client-logs?${buildAdminClientLogQuery()}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    adminClientLogs = Array.isArray(data.items) ? data.items : [];
    adminClientLogsLoaded = true;
    renderAdminClientLogs();
    if (!silent) setStatus(`客户端日志已刷新 · ${adminClientLogs.length} 条`, 'ok', 1400);
  } catch (err) {
    setStatus(`加载客户端日志失败：${err?.message || err}`, 'err', 2400);
    const wrap = $('adminClientLogsTableWrap');
    if (wrap) wrap.innerHTML = adminClientLogsErrorHtml(err?.message || '加载失败');
  }
}

export function bindAdminClientLogsPanel() {
  let searchTimer = null;
  $('adminClientLogsRefresh')?.addEventListener('click', () => refreshAdminClientLogs());
  $('adminClientLogUserFilter')?.addEventListener('change', (ev) => {
    adminClientLogFilter.userId = ev.target.value || '';
    refreshAdminClientLogs({ silent: true });
  });
  $('adminClientLogLevelFilter')?.addEventListener('change', (ev) => {
    adminClientLogFilter.level = ev.target.value || '';
    refreshAdminClientLogs({ silent: true });
  });
  $('adminClientLogSearch')?.addEventListener('input', (ev) => {
    adminClientLogFilter.search = ev.target.value || '';
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshAdminClientLogs({ silent: true }), 240);
  });
}
