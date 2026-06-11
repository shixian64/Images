import { escapeHtml } from './dom.js';

export function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
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
  return role === 'admin' ? '管理员' : '普通用户';
}

export function statusLabel(status) {
  return status === 'active' ? '启用' : '停用';
}

export function renderUserRow(user = {}, { currentUserId = '' } = {}) {
  const isSelf = user.id === currentUserId;
  const selfTip = isSelf ? ' title="不能修改自己" disabled' : '';
  const roleOptions = ['admin', 'user'].map((value) => {
    const selected = value === user.role ? ' selected' : '';
    return `<option value="${value}"${selected}>${roleLabel(value)}</option>`;
  }).join('');

  const statusBtnClass = user.status === 'active' ? 'danger ghost small' : 'primary small';
  const statusBtnLabel = user.status === 'active' ? '停用' : '启用';

  return `<tr data-user-id="${escapeHtml(user.id)}">
    <td>${escapeHtml(user.username || '-')}${isSelf ? ' <span class="chip info">你</span>' : ''}</td>
    <td>${escapeHtml(user.email || '-')}</td>
    <td>
      <select class="users-role-select"${selfTip}>${roleOptions}</select>
    </td>
    <td>
      <span class="chip ${user.status === 'active' ? 'ok' : 'err'}">${statusLabel(user.status)}</span>
    </td>
    <td>${escapeHtml(formatTime(user.last_login_at || user.lastLoginAt))}</td>
    <td class="users-actions-cell"><div class="actions-wrap">
      <button class="ghost small" data-act="detail">详情</button>
      <button class="${statusBtnClass} users-status-btn"${selfTip}>${statusBtnLabel}</button>
    </div></td>
  </tr>`;
}

export function usersEmptyHtml() {
  return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无用户数据</p></div>';
}

export function usersTableHtml(items = [], { currentUserId = '' } = {}) {
  const users = Array.isArray(items) ? items : [];
  if (!users.length) return usersEmptyHtml();
  return `
    <table class="users-table">
      <thead>
        <tr>
          <th>用户名</th>
          <th>邮箱</th>
          <th>角色</th>
          <th>状态</th>
          <th>最后登录</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>${users.map((user) => renderUserRow(user, { currentUserId })).join('')}</tbody>
    </table>
  `;
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
    <button class="ghost small" data-users-pager="prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
    <span>第 ${page} / ${totalPages} 页 · 每页 ${pageSize}</span>
    <button class="ghost small" data-users-pager="next" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
  `
  };
}
