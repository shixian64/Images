// ???????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';

let adminJobUsers = [];

export function isAdminJobsLoaded() {
  return adminJobsLoaded;
}

export function setAdminJobUsers(users = []) {
  adminJobUsers = Array.isArray(users) ? users : [];
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
  const user = adminJobUsers.find((item) => item.id === userId);
  if (!user) return shortId(userId);
  return user.username || user.email || shortId(userId);
}

// ---------- 生成队列管理 ----------

let adminJobs = [];
let adminJobSettings = null;
let adminJobStats = null;
let adminJobsLoaded = false;

function statusText(status) {
  return {
    queued: '排队',
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时'
  }[status] || status || '-';
}

function statusChipClass(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'running') return 'info';
  if (status === 'cancelled') return '';
  return 'info';
}

function logLevelChipClass(level) {
  if (level === 'error') return 'err';
  if (level === 'warn') return 'warn';
  if (level === 'info') return 'info';
  return '';
}

function fmtDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1000) return `${Math.round(n)}ms`;
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function renderAdminJobsSummary() {
  const host = $('adminJobsSummary');
  if (!host) return;
  const by = adminJobStats?.byStatus || {};
  host.innerHTML = `
    <span class="chip info">排队 ${by.queued || 0}</span>
    <span class="chip info">执行中 ${by.running || 0}</span>
    <span class="chip ok">成功 ${by.succeeded || 0}</span>
    <span class="chip error">失败 ${Number(by.failed || 0) + Number(by.timeout || 0)}</span>
    <span class="chip">成功率 ${adminJobStats?.successRate == null ? '-' : `${adminJobStats.successRate}%`}</span>
    <span class="chip">平均耗时 ${fmtDuration(adminJobStats?.avgSuccessDurationMs)}</span>
  `;
}

function settingValue(key) {
  const v = adminJobSettings?.[key];
  return v === null || v === undefined ? '' : String(v);
}

export function renderAdminJobSettings() {
  const host = $('adminJobsSettings');
  if (!host) return;
  if (!adminJobSettings) {
    host.innerHTML = '<p class="hint">尚未加载设置。</p>';
    return;
  }
  host.innerHTML = `
    <label class="field switch-field">
      <span>维护模式</span>
      <label class="switch-row">
        <input id="queueMaintenanceMode" type="checkbox" ${adminJobSettings.maintenance_mode ? 'checked' : ''} />
        <span>开启后不接新任务且暂停调度</span>
      </label>
    </label>
    <label class="field"><span>全局并发</span>
      <input id="queueGlobalConcurrency" type="number" min="0" placeholder="跟随环境变量 / 不限" value="${escapeHtml(settingValue('global_concurrency'))}" />
    </label>
    <label class="field"><span>每用户最大排队数</span>
      <input id="queueMaxPendingUser" type="number" min="0" value="${escapeHtml(settingValue('max_pending_per_user'))}" />
    </label>
    <label class="field"><span>全局最大排队数</span>
      <input id="queueMaxPendingGlobal" type="number" min="0" value="${escapeHtml(settingValue('max_pending_global'))}" />
    </label>
    <label class="field"><span>最长等待（分钟）</span>
      <input id="queueMaxWaitMin" type="number" min="0" value="${adminJobSettings.max_wait_ms ? Math.round(adminJobSettings.max_wait_ms / 60000) : ''}" placeholder="0 = 不限制" />
    </label>
    <label class="field"><span>执行超时（分钟）</span>
      <input id="queueExecutionTimeoutMin" type="number" min="0" value="${adminJobSettings.execution_timeout_ms ? Math.round(adminJobSettings.execution_timeout_ms / 60000) : ''}" placeholder="留空 = 默认" />
    </label>
    <label class="field"><span>失败重试次数</span>
      <input id="queueMaxRetries" type="number" min="0" value="${escapeHtml(settingValue('max_retries'))}" />
    </label>
    <label class="field"><span>角色优先级 JSON</span>
      <textarea id="queueRolePriorities" rows="3">${escapeHtml(JSON.stringify(adminJobSettings.role_priorities || { admin: 100, user: 0 }, null, 2))}</textarea>
    </label>
  `;
}

export function renderAdminJobsTable() {
  const wrap = $('adminJobsTableWrap');
  if (!wrap) return;
  if (!adminJobs.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无队列任务</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="users-table management-table admin-jobs-table">
      <thead>
        <tr>
          <th>状态</th>
          <th>用户</th>
          <th>任务</th>
          <th>优先级</th>
          <th>时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${adminJobs.map((job) => {
          const user = job.user || {};
          const prompt = job.promptPreview || job.payload?.prompt || '-';
          const running = job.status === 'running' || job.status === 'queued';
          return `
            <tr data-admin-job-id="${escapeHtml(job.id)}">
              <td><span class="chip ${statusChipClass(job.status)}">${statusText(job.status)}</span></td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || userLabel(job.userId))}</strong>
                  <small>${escapeHtml(shortId(job.userId))}</small>
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong title="${escapeHtml(prompt)}">${escapeHtml(String(prompt).slice(0, 80))}</strong>
                  <small>${escapeHtml(job.model || '-')} · n=${job.n || 1} · ${escapeHtml(job.profileName || '-')}</small>
                  ${job.error ? `<small class="queue-error-line">${escapeHtml(job.error)}</small>` : ''}
                </div>
              </td>
              <td>
                <input class="admin-job-priority" type="number" step="1" value="${Number(job.priority) || 0}" />
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(formatTime(job.createdAt))}</strong>
                  <small>${job.startedAt && job.finishedAt ? fmtDuration(job.finishedAt - job.startedAt) : (job.startedAt ? `已运行 ${fmtDuration(Date.now() - job.startedAt)}` : '-')}</small>
                </div>
              </td>
              <td class="users-actions-cell"><div class="actions-wrap">
                <button class="danger ghost small" data-admin-job-act="cancel" ${running ? '' : 'disabled'}>取消</button>
              </div></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

export async function refreshAdminJobs({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/admin/jobs');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    adminJobs = Array.isArray(data.items) ? data.items : [];
    adminJobSettings = data.settings || adminJobSettings;
    adminJobStats = data.stats || adminJobStats;
    adminJobsLoaded = true;
    renderAdminJobsSummary();
    renderAdminJobSettings();
    renderAdminJobsTable();
    if (!silent) setStatus(`队列已刷新 · ${adminJobs.length} 条`, 'ok', 1400);
  } catch (err) {
    setStatus(`加载队列失败：${err?.message || err}`, 'err', 2400);
    const wrap = $('adminJobsTableWrap');
    if (wrap) wrap.innerHTML = `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`;
  }
}

function parseNullableIntInput(id, multiplier = 1) {
  const raw = $(id)?.value;
  if (raw === '' || raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${id} 必须是非负数字`);
  return Math.floor(n * multiplier);
}

async function saveAdminJobSettings() {
  let rolePriorities;
  try {
    rolePriorities = JSON.parse($('queueRolePriorities')?.value || '{}');
  } catch {
    setStatus('角色优先级 JSON 格式不正确', 'err', 2200);
    return;
  }
  let body;
  try {
    body = {
      maintenance_mode: Boolean($('queueMaintenanceMode')?.checked),
      global_concurrency: parseNullableIntInput('queueGlobalConcurrency'),
      max_pending_per_user: parseNullableIntInput('queueMaxPendingUser'),
      max_pending_global: parseNullableIntInput('queueMaxPendingGlobal'),
      max_wait_ms: parseNullableIntInput('queueMaxWaitMin', 60_000),
      execution_timeout_ms: parseNullableIntInput('queueExecutionTimeoutMin', 60_000),
      max_retries: parseNullableIntInput('queueMaxRetries'),
      role_priorities: rolePriorities
    };
  } catch (err) {
    setStatus(err.message, 'err', 2200);
    return;
  }
  try {
    const resp = await apiFetch('/api/admin/jobs/settings', { method: 'PUT', body });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    adminJobSettings = data.settings || adminJobSettings;
    renderAdminJobSettings();
    setStatus('队列设置已保存', 'ok', 1600);
    refreshAdminJobs({ silent: true });
  } catch (err) {
    setStatus(`保存队列设置失败：${err?.message || err}`, 'err', 2400);
  }
}

async function cancelAdminJob(jobId) {
  const ok = await dialog.confirm({
    title: '取消生成任务',
    message: `将取消任务 ${shortId(jobId)}。如果任务已请求上游，可能会记录一次失败用量。继续？`,
    confirmText: '取消任务',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('任务已请求取消', 'ok', 1400);
    refreshAdminJobs({ silent: true });
  } catch (err) {
    setStatus(`取消失败：${err?.message || err}`, 'err', 2200);
  }
}

async function saveAdminJobPriority(jobId, priority) {
  try {
    const resp = await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/priority`, {
      method: 'PATCH',
      body: { priority: Number(priority) || 0 }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const idx = adminJobs.findIndex((item) => item.id === jobId);
    if (idx >= 0 && data.job) adminJobs[idx] = data.job;
    setStatus('任务优先级已更新', 'ok', 1000);
    renderAdminJobsTable();
  } catch (err) {
    setStatus(`更新优先级失败：${err?.message || err}`, 'err', 2200);
    refreshAdminJobs({ silent: true });
  }
}

export function bindAdminJobsPanel() {
  $('adminJobsRefresh')?.addEventListener('click', () => refreshAdminJobs());
  $('adminJobsSaveSettings')?.addEventListener('click', saveAdminJobSettings);
  $('adminJobsTableWrap')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-admin-job-act="cancel"]');
    if (!btn) return;
    const tr = btn.closest('tr[data-admin-job-id]');
    if (tr?.dataset.adminJobId) cancelAdminJob(tr.dataset.adminJobId);
  });
  $('adminJobsTableWrap')?.addEventListener('change', (ev) => {
    const input = ev.target.closest('.admin-job-priority');
    if (!input) return;
    const tr = input.closest('tr[data-admin-job-id]');
    if (tr?.dataset.adminJobId) saveAdminJobPriority(tr.dataset.adminJobId, input.value);
  });
}
