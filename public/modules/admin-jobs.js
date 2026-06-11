// ???????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';
import {
  adminJobSettingsHtml,
  adminJobShortId,
  adminJobsSummaryHtml,
  adminJobsTableView
} from './admin-jobs-view.js';

let adminJobUsers = [];

export function isAdminJobsLoaded() {
  return adminJobsLoaded;
}

export function setAdminJobUsers(users = []) {
  adminJobUsers = Array.isArray(users) ? users : [];
}

function shortId(id) {
  return adminJobShortId(id);
}

// ---------- 生成队列管理 ----------

let adminJobs = [];
let adminJobSettings = null;
let adminJobStats = null;
let adminJobsLoaded = false;

export function renderAdminJobsSummary() {
  const host = $('adminJobsSummary');
  if (!host) return;
  host.innerHTML = adminJobsSummaryHtml(adminJobStats);
}

export function renderAdminJobSettings() {
  const host = $('adminJobsSettings');
  if (!host) return;
  host.innerHTML = adminJobSettingsHtml(adminJobSettings);
}

export function renderAdminJobsTable() {
  const wrap = $('adminJobsTableWrap');
  if (!wrap) return;
  wrap.innerHTML = adminJobsTableView(adminJobs, {
    users: adminJobUsers,
    nowMs: Date.now()
  }).html;
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
