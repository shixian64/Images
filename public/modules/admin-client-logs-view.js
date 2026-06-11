import { escapeHtml } from './dom.js';

export function formatAdminClientLogTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
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
  return '<option value="">全部用户</option>' + rows.map((user) => {
    const label = `${user?.username || user?.email || '-'} (${adminClientLogShortId(user?.id)})`;
    return `<option value="${escapeHtml(user?.id || '')}" ${current === user?.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function adminClientLogsSummaryText(logs = []) {
  return `显示 ${Array.isArray(logs) ? logs.length : 0} 条`;
}

export function adminClientLogsErrorHtml(message = '加载失败') {
  return `<div class="error-banner">${escapeHtml(message || '加载失败')}</div>`;
}

export function adminClientLogsTableView(logs = [], { users = [] } = {}) {
  const rows = Array.isArray(logs) ? logs : [];
  if (!rows.length) {
    return {
      empty: true,
      html: '<div class="empty-state"><div class="empty-icon" aria-hidden="true">▤</div><p>暂无匹配的客户端日志。</p></div>'
    };
  }
  return {
    empty: false,
    html: `
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
                  ${log.clientTs ? `<small>客户端：${escapeHtml(formatAdminClientLogTime(log.clientTs))}</small>` : ''}
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
