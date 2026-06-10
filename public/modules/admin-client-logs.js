// ?????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';

let adminClientLogUsers = [];

export function isAdminClientLogsLoaded() {
  return adminClientLogsLoaded;
}

export function setAdminClientLogUsers(users = []) {
  adminClientLogUsers = Array.isArray(users) ? users : [];
  syncClientLogUserFilter();
}

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function shortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

function userLabel(userId) {
  const user = adminClientLogUsers.find((item) => item.id === userId);
  if (!user) return shortId(userId);
  return user.username || user.email || shortId(userId);
}

function logLevelChipClass(level) {
  const value = String(level || '').toLowerCase();
  if (value === 'error' || value === 'fatal') return 'err';
  if (value === 'warn' || value === 'warning') return 'warn';
  if (value === 'info') return 'ok';
  return '';
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
  userSel.innerHTML = `<option value="">全部用户</option>` + adminClientLogUsers.map((u) => {
    const label = `${u.username || u.email || '-'} (${shortId(u.id)})`;
    return `<option value="${escapeHtml(u.id)}" ${current === u.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
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
  if (summary) summary.textContent = `显示 ${adminClientLogs.length} 条`;

  if (!adminClientLogs.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">▤</div><p>暂无匹配的客户端日志。</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="users-table admin-client-log-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>用户</th>
          <th>等级</th>
          <th>消息 / 上下文</th>
        </tr>
      </thead>
      <tbody>
        ${adminClientLogs.map((log) => {
          const user = log.user || {};
          const meta = log.meta ? JSON.stringify(log.meta) : '';
          return `
            <tr>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(formatTime(log.receivedAt))}</strong>
                  ${log.clientTs ? `<small>客户端：${escapeHtml(formatTime(log.clientTs))}</small>` : ''}
                </div>
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || userLabel(log.userId))}</strong>
                  <small>${escapeHtml(shortId(log.userId))}</small>
                </div>
              </td>
              <td><span class="chip ${logLevelChipClass(log.level)}">${escapeHtml(log.level || '-')}</span></td>
              <td>
                <div class="client-log-message">
                  <strong>${escapeHtml(log.message || '-')}</strong>
                  ${log.pageUrl ? `<small>${escapeHtml(log.pageUrl)}</small>` : ''}
                  ${meta ? `<code>${escapeHtml(meta)}</code>` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
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
    if (wrap) wrap.innerHTML = `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`;
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
