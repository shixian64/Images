import { escapeHtml } from './dom.js';
import { formatDateTime, t } from './i18n.js';

export function formatTime(iso) {
  return formatDateTime(iso);
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function shortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

export function roleLabel(role) {
  return role === 'admin' ? t('admin.users.role.admin') : t('admin.users.role.user');
}

export function statusLabel(status) {
  return status === 'active' ? t('admin.users.status.active') : t('admin.users.status.disabled');
}

export function renderUserRow(user = {}, { currentUserId = '' } = {}) {
  const isSelf = user.id === currentUserId;
  const selfTip = isSelf ? ` title="${escapeHtml(t('admin.users.self.disabledTitle'))}" disabled` : '';
  const roleOptions = ['admin', 'user'].map((value) => {
    const selected = value === user.role ? ' selected' : '';
    return `<option value="${value}"${selected}>${escapeHtml(roleLabel(value))}</option>`;
  }).join('');

  const statusBtnClass = user.status === 'active' ? 'danger ghost small' : 'primary small';
  const statusBtnLabel = user.status === 'active' ? t('admin.users.action.disable') : t('admin.users.action.enable');

  return `<tr data-user-id="${escapeHtml(user.id)}">
    <td>${escapeHtml(user.username || '-')}${isSelf ? ` <span class="chip info">${escapeHtml(t('admin.users.self.badge'))}</span>` : ''}</td>
    <td>${escapeHtml(user.email || '-')}</td>
    <td>
      <select class="users-role-select"${selfTip}>${roleOptions}</select>
    </td>
    <td>
      <span class="chip ${user.status === 'active' ? 'ok' : 'err'}">${escapeHtml(statusLabel(user.status))}</span>
    </td>
    <td>${escapeHtml(formatTime(user.last_login_at || user.lastLoginAt))}</td>
    <td class="users-actions-cell"><div class="actions-wrap">
      <button class="ghost small" data-act="detail">${escapeHtml(t('admin.users.action.detail'))}</button>
      <button class="${statusBtnClass} users-status-btn"${selfTip}>${escapeHtml(statusBtnLabel)}</button>
    </div></td>
  </tr>`;
}

export function usersEmptyHtml() {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.users.empty'))}</p></div>`;
}

export function usersTableHtml(items = [], { currentUserId = '' } = {}) {
  const users = Array.isArray(items) ? items : [];
  if (!users.length) return usersEmptyHtml();
  return `
    <table class="users-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('admin.users.header.username'))}</th>
          <th>${escapeHtml(t('admin.users.header.email'))}</th>
          <th>${escapeHtml(t('admin.users.header.role'))}</th>
          <th>${escapeHtml(t('admin.users.header.status'))}</th>
          <th>${escapeHtml(t('admin.users.header.lastLogin'))}</th>
          <th>${escapeHtml(t('admin.users.header.actions'))}</th>
        </tr>
      </thead>
      <tbody>${users.map((user) => renderUserRow(user, { currentUserId })).join('')}</tbody>
    </table>
  `;
}

export function usersErrorHtml(message, { prefix = '' } = {}) {
  return `<div class="error-banner">${escapeHtml(prefix)}${escapeHtml(message || t('common.loadFailed'))}</div>`;
}

export function usersPagerView(view = {}) {
  const total = Number(view.filtered) || 0;
  const pageSize = Number(view.pageSize) || 50;
  const page = Number(view.page) || 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return { hidden: true, html: '' };
  }
  return {
    hidden: false,
    html: `
    <button class="ghost small" data-users-pager="prev" ${page <= 1 ? 'disabled' : ''}>${escapeHtml(t('admin.users.pager.prev'))}</button>
    <span>${escapeHtml(t('admin.users.pager.info', { page, totalPages, pageSize }))}</span>
    <button class="ghost small" data-users-pager="next" ${page >= totalPages ? 'disabled' : ''}>${escapeHtml(t('admin.users.pager.next'))}</button>
  `
  };
}
