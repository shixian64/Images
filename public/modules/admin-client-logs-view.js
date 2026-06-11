import { escapeHtml } from './dom.js';
import { formatDateTime, formatNumber, t } from './i18n.js';

export function formatAdminClientLogTime(iso) {
  return formatDateTime(iso);
}

export function adminClientLogShortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

export function adminClientLogUserLabel(userId, users = []) {
  const user = users.find((item) => item?.id === userId);
  if (!user) return adminClientLogShortId(userId);
  return user.username || user.email || adminClientLogShortId(userId);
}

export function adminClientLogLevelChipClass(level) {
  const value = String(level || '').toLowerCase();
  if (value === 'error' || value === 'fatal') return 'err';
  if (value === 'warn' || value === 'warning') return 'warn';
  if (value === 'info') return 'ok';
  return '';
}

export function adminClientLogUserOptionsHtml(users = [], current = '') {
  const rows = Array.isArray(users) ? users : [];
  return `<option value="">${escapeHtml(t('admin.clientLogs.filter.allUsers'))}</option>` + rows.map((user) => {
    const label = `${user?.username || user?.email || t('common.empty')} (${adminClientLogShortId(user?.id)})`;
    return `<option value="${escapeHtml(user?.id || '')}" ${current === user?.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function adminClientLogsSummaryText(logs = []) {
  return t('admin.clientLogs.summary.count', { count: formatNumber(Array.isArray(logs) ? logs.length : 0) });
}

export function adminClientLogsErrorHtml(message = t('common.loadFailed')) {
  return `<div class="error-banner">${escapeHtml(message || t('common.loadFailed'))}</div>`;
}

export function adminClientLogsTableView(logs = [], { users = [] } = {}) {
  const rows = Array.isArray(logs) ? logs : [];
  if (!rows.length) {
    return {
      empty: true,
      html: `<div class="empty-state"><div class="empty-icon" aria-hidden="true">▤</div><p>${escapeHtml(t('admin.clientLogs.empty'))}</p></div>`
    };
  }
  return {
    empty: false,
    html: `
    <table class="users-table admin-client-log-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('admin.clientLogs.header.time'))}</th>
          <th>${escapeHtml(t('admin.clientLogs.header.user'))}</th>
          <th>${escapeHtml(t('admin.clientLogs.header.level'))}</th>
          <th>${escapeHtml(t('admin.clientLogs.header.messageContext'))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((log) => adminClientLogRowHtml(log, { users })).join('')}
      </tbody>
    </table>
  `
  };
}

export function adminClientLogRowHtml(log = {}, { users = [] } = {}) {
  const user = log.user || {};
  const meta = log.meta ? JSON.stringify(log.meta) : '';
  return `
            <tr>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(formatAdminClientLogTime(log.receivedAt))}</strong>
                  ${log.clientTs ? `<small>${escapeHtml(t('admin.clientLogs.clientTs', { time: formatAdminClientLogTime(log.clientTs) }))}</small>` : ''}
                </div>
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || adminClientLogUserLabel(log.userId, users))}</strong>
                  <small>${escapeHtml(adminClientLogShortId(log.userId))}</small>
                </div>
              </td>
              <td><span class="chip ${adminClientLogLevelChipClass(log.level)}">${escapeHtml(log.level || '-')}</span></td>
              <td>
                <div class="client-log-message">
                  <strong>${escapeHtml(log.message || '-')}</strong>
                  ${log.pageUrl ? `<small>${escapeHtml(log.pageUrl)}</small>` : ''}
                  ${meta ? `<code>${escapeHtml(meta)}</code>` : ''}
                </div>
              </td>
            </tr>
          `;
}
