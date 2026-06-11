import { escapeHtml } from './dom.js';
import { formatDateTime, formatDuration, t } from './i18n.js';

export function formatAdminJobTime(iso) {
  return formatDateTime(iso);
}

export function adminJobShortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

export function adminJobUserLabel(userId, users = []) {
  const user = users.find((item) => item?.id === userId);
  if (!user) return adminJobShortId(userId);
  return user.username || user.email || adminJobShortId(userId);
}

export function adminJobStatusText(status) {
  return t(`job.status.${status}`, {}, status || t('common.empty'));
}

export function adminJobStatusChipClass(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'running') return 'info';
  if (status === 'cancelled') return '';
  return 'info';
}

export function adminJobLogLevelChipClass(level) {
  if (level === 'error') return 'err';
  if (level === 'warn') return 'warn';
  if (level === 'info') return 'info';
  return '';
}

export function formatAdminJobDuration(ms) {
  return formatDuration(ms);
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function settingValue(settings = {}, key) {
  const value = settings?.[key];
  return value === null || value === undefined ? '' : String(value);
}

export function adminJobsSummaryHtml(stats = null) {
  const by = stats?.byStatus || {};
  const successRate = stats?.successRate == null ? '-' : `${safeNumber(stats.successRate)}%`;
  return `
    <span class="chip info">${escapeHtml(t('admin.jobs.summary.queued', { count: safeNumber(by.queued) }))}</span>
    <span class="chip info">${escapeHtml(t('admin.jobs.summary.running', { count: safeNumber(by.running) }))}</span>
    <span class="chip ok">${escapeHtml(t('admin.jobs.summary.succeeded', { count: safeNumber(by.succeeded) }))}</span>
    <span class="chip error">${escapeHtml(t('admin.jobs.summary.failed', { count: safeNumber(by.failed) + safeNumber(by.timeout) }))}</span>
    <span class="chip">${escapeHtml(t('admin.jobs.summary.successRate', { rate: successRate }))}</span>
    <span class="chip">${escapeHtml(t('admin.jobs.summary.avgDuration', { duration: formatAdminJobDuration(stats?.avgSuccessDurationMs) }))}</span>
  `;
}

export function adminJobSettingsHtml(settings = null) {
  if (!settings) return `<p class="hint">${escapeHtml(t('admin.jobs.settings.notLoaded'))}</p>`;
  return `
    <label class="field switch-field">
      <span>${escapeHtml(t('admin.jobs.settings.maintenanceMode'))}</span>
      <label class="switch-row">
        <input id="queueMaintenanceMode" type="checkbox" ${settings.maintenance_mode ? 'checked' : ''} />
        <span>${escapeHtml(t('admin.jobs.settings.maintenanceHint'))}</span>
      </label>
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.globalConcurrency'))}</span>
      <input id="queueGlobalConcurrency" type="number" min="0" placeholder="${escapeHtml(t('admin.jobs.settings.globalConcurrencyPlaceholder'))}" value="${escapeHtml(settingValue(settings, 'global_concurrency'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.maxPendingPerUser'))}</span>
      <input id="queueMaxPendingUser" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_pending_per_user'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.maxPendingGlobal'))}</span>
      <input id="queueMaxPendingGlobal" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_pending_global'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.maxWaitMinutes'))}</span>
      <input id="queueMaxWaitMin" type="number" min="0" value="${settings.max_wait_ms ? Math.round(Number(settings.max_wait_ms) / 60000) : ''}" placeholder="${escapeHtml(t('admin.jobs.settings.maxWaitPlaceholder'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.executionTimeoutMinutes'))}</span>
      <input id="queueExecutionTimeoutMin" type="number" min="0" value="${settings.execution_timeout_ms ? Math.round(Number(settings.execution_timeout_ms) / 60000) : ''}" placeholder="${escapeHtml(t('admin.jobs.settings.executionTimeoutPlaceholder'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.maxRetries'))}</span>
      <input id="queueMaxRetries" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_retries'))}" />
    </label>
    <label class="field"><span>${escapeHtml(t('admin.jobs.settings.rolePrioritiesJson'))}</span>
      <textarea id="queueRolePriorities" rows="3">${escapeHtml(JSON.stringify(settings.role_priorities || { admin: 100, user: 0 }, null, 2))}</textarea>
    </label>
  `;
}

export function adminJobsErrorHtml(message) {
  return `<div class="error-banner">${escapeHtml(message || t('common.loadFailed'))}</div>`;
}

export function adminJobsTableView(jobs = [], { users = [], nowMs = Date.now() } = {}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  if (!rows.length) {
    return {
      empty: true,
      html: `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.jobs.empty'))}</p></div>`
    };
  }
  return {
    empty: false,
    html: `
    <table class="users-table management-table admin-jobs-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('admin.jobs.header.status'))}</th>
          <th>${escapeHtml(t('admin.jobs.header.user'))}</th>
          <th>${escapeHtml(t('admin.jobs.header.task'))}</th>
          <th>${escapeHtml(t('admin.jobs.header.priority'))}</th>
          <th>${escapeHtml(t('admin.jobs.header.time'))}</th>
          <th>${escapeHtml(t('admin.jobs.header.actions'))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((job) => adminJobRowHtml(job, { users, nowMs })).join('')}
      </tbody>
    </table>
  `
  };
}

export function adminJobRowHtml(job = {}, { users = [], nowMs = Date.now() } = {}) {
  const user = job.user || {};
  const prompt = job.promptPreview || job.payload?.prompt || '-';
  const running = job.status === 'running' || job.status === 'queued';
  const durationText = job.startedAt && job.finishedAt
    ? formatAdminJobDuration(job.finishedAt - job.startedAt)
    : (job.startedAt ? t('admin.jobs.runningDuration', { duration: formatAdminJobDuration(nowMs - job.startedAt) }) : t('common.empty'));
  return `
            <tr data-admin-job-id="${escapeHtml(job.id)}">
              <td><span class="chip ${adminJobStatusChipClass(job.status)}">${escapeHtml(adminJobStatusText(job.status))}</span></td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || adminJobUserLabel(job.userId, users))}</strong>
                  <small>${escapeHtml(adminJobShortId(job.userId))}</small>
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong title="${escapeHtml(prompt)}">${escapeHtml(String(prompt).slice(0, 80))}</strong>
                  <small>${escapeHtml(job.model || '-')} · n=${escapeHtml(job.n || 1)} · ${escapeHtml(job.profileName || '-')}</small>
                  ${job.error ? `<small class="queue-error-line">${escapeHtml(job.error)}</small>` : ''}
                </div>
              </td>
              <td>
                <input class="admin-job-priority" type="number" step="1" value="${safeNumber(job.priority)}" />
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(formatAdminJobTime(job.createdAt))}</strong>
                  <small>${escapeHtml(durationText)}</small>
                </div>
              </td>
              <td class="users-actions-cell"><div class="actions-wrap">
                <button class="danger ghost small" data-admin-job-act="cancel" ${running ? '' : 'disabled'}>${escapeHtml(t('admin.jobs.action.cancel'))}</button>
              </div></td>
            </tr>
          `;
}
