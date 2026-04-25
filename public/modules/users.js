// 管理员管理面板：用户管理 + 额度管理入口 + 图库管理概览。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import { apiFetch, getCurrentUserId } from './auth.js';

let users = [];
let galleryItems = [];
let galleryStorage = '';
let galleryLoaded = false;
let mounted = false;

const MANAGEMENT_TABS = new Set(['usersManagement', 'quotaManagement', 'galleryManagement']);

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(bytes) {
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

function shortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

function roleLabel(role) {
  return role === 'admin' ? '管理员' : '普通用户';
}

function statusLabel(status) {
  return status === 'active' ? '启用' : '停用';
}

function userLabel(userId) {
  const user = users.find((item) => item.id === userId);
  if (!user) return shortId(userId);
  return user.username || user.email || shortId(userId);
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

function renderQuotaTable() {
  const wrap = $('quotaTableWrap');
  if (!wrap) return;
  if (!users.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无用户数据</p></div>`;
    return;
  }

  const activeUsers = users.filter((user) => user.status === 'active').length;
  const admins = users.filter((user) => user.role === 'admin').length;

  wrap.innerHTML = `
    <div class="management-summary" aria-live="polite">
      <span class="chip">用户 ${users.length} 人</span>
      <span class="chip info">启用 ${activeUsers} 人</span>
      <span class="chip">管理员 ${admins} 人</span>
    </div>
    <p class="hint management-hint">当前为 BYOK 模式，服务端暂未接入独立额度字段；这里先提供额度管理菜单入口，默认展示“不限”。</p>
    <table class="users-table management-table">
      <thead>
        <tr>
          <th>用户</th>
          <th>角色</th>
          <th>状态</th>
          <th>日额度</th>
          <th>月额度</th>
          <th>策略</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((user) => `
          <tr>
            <td>
              <div class="management-user-cell">
                <strong>${escapeHtml(user.username || '-')}</strong>
                <small>${escapeHtml(user.email || '-')}</small>
              </div>
            </td>
            <td>${roleLabel(user.role)}</td>
            <td><span class="chip ${user.status === 'active' ? 'ok' : 'err'}">${statusLabel(user.status)}</span></td>
            <td>不限</td>
            <td>不限</td>
            <td><span class="chip info">BYOK</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAdminGallery(data = {}) {
  const summary = $('adminGallerySummary');
  const wrap = $('adminGalleryTableWrap');
  if (!wrap) return;

  const items = Array.isArray(data.items) ? data.items : galleryItems;
  const storage = data.storage || galleryStorage;
  const totalBytes = items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const savedToday = items.filter((item) => String(item.createdAt || '').startsWith(today)).length;

  if (summary) {
    summary.innerHTML = `
      <span class="chip">本地共 ${items.length} 张</span>
      <span class="chip info">今日新增 ${savedToday} 张</span>
      <span class="chip">容量 ${formatBytes(totalBytes)}</span>
      <span class="chip">目录 ${escapeHtml(storage || 'generated/users/*')}</span>
    `;
  }

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无图库数据</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="users-table management-table admin-gallery-table">
      <thead>
        <tr>
          <th>缩略图</th>
          <th>用户</th>
          <th>文件</th>
          <th>模型 / 尺寸</th>
          <th>大小</th>
          <th>创建时间</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => {
          const src = item.url || item.downloadUrl || '';
          const prompt = item.revisedPrompt || item.prompt || item.filename || '图库图片';
          return `
            <tr>
              <td>
                ${src ? `<img class="admin-gallery-thumb" src="${escapeHtml(src)}" alt="${escapeHtml(String(prompt).slice(0, 80))}" loading="lazy" />` : '-'}
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(userLabel(item.userId))}</strong>
                  <small>${escapeHtml(shortId(item.userId))}</small>
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(item.filename || '-')}</strong>
                  <small>${escapeHtml(item.path || '')}</small>
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(item.model || '-')}</strong>
                  <small>${escapeHtml([item.size, item.quality, item.outputFormat].filter(Boolean).join(' · ') || '-')}</small>
                </div>
              </td>
              <td>${formatBytes(item.bytes)}</td>
              <td>${escapeHtml(formatTime(item.createdAt))}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function refresh({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/users');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    users = Array.isArray(data.items) ? data.items : [];
    renderTable();
    renderQuotaTable();
    if (galleryLoaded) renderAdminGallery();
    if (!silent) setStatus(`用户列表已刷新 · ${users.length} 人`, 'ok', 1400);
  } catch (err) {
    const message = err?.message || String(err);
    const wrap = $('usersTableWrap');
    if (wrap) {
      wrap.innerHTML = `<div class="error-banner">加载用户失败：${escapeHtml(message)}</div>`;
    }
    setStatus('加载用户失败', 'err', 2000);
  }
}

async function refreshAdminGallery({ silent = false } = {}) {
  const summary = $('adminGallerySummary');
  const wrap = $('adminGalleryTableWrap');
  if (summary) summary.innerHTML = '<span class="chip">正在加载图库…</span>';
  if (wrap) wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">▧</div><p>正在加载图库…</p></div>`;

  try {
    const resp = await apiFetch('/api/gallery?limit=1000', { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    galleryItems = Array.isArray(data.items) ? data.items : [];
    galleryStorage = data.storage || '';
    galleryLoaded = true;
    renderAdminGallery({ items: galleryItems, storage: galleryStorage });
    if (!silent) setStatus(`图库列表已刷新 · ${galleryItems.length} 张`, 'ok', 1400);
  } catch (err) {
    const message = err?.message || String(err);
    if (summary) summary.innerHTML = `<span class="chip error">加载失败：${escapeHtml(message)}</span>`;
    if (wrap) wrap.innerHTML = `<div class="error-banner">加载图库失败：${escapeHtml(message)}</div>`;
    setStatus('加载图库失败', 'err', 2000);
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
      renderQuotaTable();
      if (galleryLoaded) renderAdminGallery();
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

function switchManagementTab(tabId) {
  const nextTab = MANAGEMENT_TABS.has(tabId) ? tabId : 'usersManagement';
  $$('.management-tab').forEach((btn) => {
    const active = btn.dataset.managementTab === nextTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.management-pane').forEach((pane) => {
    const active = pane.id === nextTab;
    pane.classList.toggle('active', active);
    pane.hidden = !active;
  });

  if (nextTab === 'quotaManagement') {
    renderQuotaTable();
  } else if (nextTab === 'galleryManagement' && !galleryLoaded) {
    refreshAdminGallery({ silent: true });
  }
}

export function mountUsersPanel() {
  if (mounted) return;
  mounted = true;
  const refreshBtn = $('usersRefresh');
  const quotaRefreshBtn = $('quotaRefresh');
  const adminGalleryRefreshBtn = $('adminGalleryRefresh');
  const wrap = $('usersTableWrap');

  $$('.management-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchManagementTab(btn.dataset.managementTab));
  });
  refreshBtn?.addEventListener('click', () => refresh());
  quotaRefreshBtn?.addEventListener('click', async () => {
    await refresh({ silent: true });
    renderQuotaTable();
    setStatus('额度列表已刷新', 'ok', 1400);
  });
  adminGalleryRefreshBtn?.addEventListener('click', () => refreshAdminGallery());
  wrap?.addEventListener('click', onTableClick);
  wrap?.addEventListener('change', onTableChange);
  switchManagementTab('usersManagement');
  refresh();
}
