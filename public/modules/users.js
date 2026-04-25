// 管理员用户管理面板：列表 + 角色切换 + 启停。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch, getCurrentUserId } from './auth.js';

let users = [];
let mounted = false;

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function roleLabel(role) {
  return role === 'admin' ? '管理员' : '普通用户';
}

function statusLabel(status) {
  return status === 'active' ? '启用' : '停用';
}

function renderRow(user) {
  const isSelf = user.id === getCurrentUserId();
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
    <td>
      <button class="${statusBtnClass} users-status-btn"${selfTip}>${statusBtnLabel}</button>
    </td>
  </tr>`;
}

function renderTable() {
  const wrap = $('usersTableWrap');
  if (!wrap) return;
  if (!users.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无用户数据</p></div>`;
    return;
  }
  wrap.innerHTML = `
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
      <tbody>${users.map(renderRow).join('')}</tbody>
    </table>
  `;
}

async function refresh() {
  try {
    const resp = await apiFetch('/api/users');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    users = Array.isArray(data.items) ? data.items : [];
    renderTable();
    setStatus(`用户列表已刷新 · ${users.length} 人`, 'ok', 1400);
  } catch (err) {
    const message = err?.message || String(err);
    const wrap = $('usersTableWrap');
    if (wrap) {
      wrap.innerHTML = `<div class="error-banner">加载用户失败：${escapeHtml(message)}</div>`;
    }
    setStatus('加载用户失败', 'err', 2000);
  }
}

async function patchUser(userId, patch) {
  try {
    const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: patch
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const updated = data?.user;
    if (updated) {
      const index = users.findIndex((u) => u.id === userId);
      if (index >= 0) users[index] = { ...users[index], ...updated };
      renderTable();
    }
    setStatus('用户已更新', 'ok', 1400);
  } catch (err) {
    setStatus(`更新失败：${err?.message || err}`, 'err', 2400);
    // 失败时回滚到服务端真值。
    refresh();
  }
}

function onTableClick(ev) {
  const btn = ev.target.closest('.users-status-btn');
  if (!btn || btn.disabled) return;
  const row = btn.closest('tr');
  const userId = row?.dataset.userId;
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  const nextStatus = user.status === 'active' ? 'disabled' : 'active';
  patchUser(userId, { status: nextStatus });
}

function onTableChange(ev) {
  const sel = ev.target.closest('.users-role-select');
  if (!sel || sel.disabled) return;
  const row = sel.closest('tr');
  const userId = row?.dataset.userId;
  if (!userId) return;
  patchUser(userId, { role: sel.value });
}

export function mountUsersPanel() {
  if (mounted) return;
  mounted = true;
  const refreshBtn = $('usersRefresh');
  const wrap = $('usersTableWrap');
  refreshBtn?.addEventListener('click', () => refresh());
  wrap?.addEventListener('click', onTableClick);
  wrap?.addEventListener('change', onTableChange);
  refresh();
}
