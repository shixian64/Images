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
    <span class="chip info">排队 ${safeNumber(by.queued)}</span>
    <span class="chip info">执行中 ${safeNumber(by.running)}</span>
    <span class="chip ok">成功 ${safeNumber(by.succeeded)}</span>
    <span class="chip error">失败 ${safeNumber(by.failed) + safeNumber(by.timeout)}</span>
    <span class="chip">成功率 ${successRate}</span>
    <span class="chip">平均耗时 ${formatAdminJobDuration(stats?.avgSuccessDurationMs)}</span>
  `;
}

export function adminJobSettingsHtml(settings = null) {
  if (!settings) return '<p class="hint">尚未加载设置。</p>';
  return `
    <label class="field switch-field">
      <span>维护模式</span>
      <label class="switch-row">
        <input id="queueMaintenanceMode" type="checkbox" ${settings.maintenance_mode ? 'checked' : ''} />
        <span>开启后不接新任务且暂停调度</span>
      </label>
    </label>
    <label class="field"><span>全局并发</span>
      <input id="queueGlobalConcurrency" type="number" min="0" placeholder="跟随环境变量 / 不限" value="${escapeHtml(settingValue(settings, 'global_concurrency'))}" />
    </label>
    <label class="field"><span>每用户最大排队数</span>
      <input id="queueMaxPendingUser" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_pending_per_user'))}" />
    </label>
    <label class="field"><span>全局最大排队数</span>
      <input id="queueMaxPendingGlobal" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_pending_global'))}" />
    </label>
    <label class="field"><span>最长等待（分钟）</span>
      <input id="queueMaxWaitMin" type="number" min="0" value="${settings.max_wait_ms ? Math.round(Number(settings.max_wait_ms) / 60000) : ''}" placeholder="0 = 不限制" />
    </label>
    <label class="field"><span>执行超时（分钟）</span>
      <input id="queueExecutionTimeoutMin" type="number" min="0" value="${settings.execution_timeout_ms ? Math.round(Number(settings.execution_timeout_ms) / 60000) : ''}" placeholder="留空 = 默认" />
    </label>
    <label class="field"><span>失败重试次数</span>
      <input id="queueMaxRetries" type="number" min="0" value="${escapeHtml(settingValue(settings, 'max_retries'))}" />
    </label>
    <label class="field"><span>角色优先级 JSON</span>
      <textarea id="queueRolePriorities" rows="3">${escapeHtml(JSON.stringify(settings.role_priorities || { admin: 100, user: 0 }, null, 2))}</textarea>
    </label>
  `;
}

export function adminJobsErrorHtml(message) {
  return `<div class="error-banner">${escapeHtml(message || '加载失败')}</div>`;
}

export function adminJobsTableView(jobs = [], { users = [], nowMs = Date.now() } = {}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  if (!rows.length) {
    return {
      empty: true,
      html: '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无队列任务</p></div>'
    };
  }
  return {
    empty: false,
    html: `
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
    : (job.startedAt ? `已运行 ${formatAdminJobDuration(nowMs - job.startedAt)}` : '-');
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
                <button class="danger ghost small" data-admin-job-act="cancel" ${running ? '' : 'disabled'}>取消</button>
              </div></td>
            </tr>
          `;
}
