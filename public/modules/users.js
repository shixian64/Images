// 管理员管理面板：用户管理 + 额度管理入口 + 图库管理概览。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import { apiFetch, getCurrentUserId } from './auth.js';
import * as drawer from './drawer.js';
import * as dialog from './dialog.js';

let users = [];
let galleryItems = [];
let galleryStorage = '';
let galleryStats = null;
let galleryLoaded = false;
let mounted = false;

let filterState = { search: '', role: 'all', status: 'all' };
let openDetailUserId = null;

let galleryFilter = {
  userId: '',
  model: '',
  search: '',
  from: '',
  to: '',
  sort: 'createdAt',
  order: 'desc',
  page: 1,
  pageSize: 50
};
let galleryView = { items: [], total: 0, totalAll: 0, pageInfo: null };
const gallerySelected = new Set();

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

function applyFilters(list) {
  const search = filterState.search.trim().toLowerCase();
  return list.filter((u) => {
    if (filterState.role !== 'all' && u.role !== filterState.role) return false;
    if (filterState.status !== 'all' && u.status !== filterState.status) return false;
    if (search) {
      const blob = `${u.username || ''}\n${u.email || ''}\n${u.id || ''}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
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
    <td class="users-actions-cell">
      <button class="ghost small" data-act="detail">详情</button>
      <button class="${statusBtnClass} users-status-btn"${selfTip}>${statusBtnLabel}</button>
    </td>
  </tr>`;
}

function renderTable() {
  const wrap = $('usersTableWrap');
  const summary = $('usersSummary');
  if (!wrap) return;

  const filtered = applyFilters(users);

  if (summary) {
    if (users.length === filtered.length) {
      summary.textContent = `共 ${users.length} 人`;
    } else {
      summary.textContent = `${filtered.length} / ${users.length} 人`;
    }
  }

  if (!users.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无用户数据</p></div>`;
    return;
  }
  if (!filtered.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>没有匹配的用户。换个搜索条件试试。</p></div>`;
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
      <tbody>${filtered.map(renderRow).join('')}</tbody>
    </table>
  `;
}

// ---------- 额度管理 ----------

let quotaItems = [];
let quotaDefaults = null;
let quotaLoaded = false;

function fmtLimit(value) {
  if (value === null || value === undefined) return '不限';
  return String(value);
}

function fmtMb(bytes) {
  const v = Number(bytes) || 0;
  if (!v) return '0 MB';
  const mb = v / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function pct(used, limit) {
  if (!limit) return null;
  const v = Math.min(100, Math.round((Number(used) || 0) / limit * 100));
  return v;
}

function progressCell(used, limit) {
  const p = pct(used, limit);
  if (p === null) return `<small class="quota-cell-meta">${used} / 不限</small>`;
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="quota-progress ${cls}">
      <span style="width:${p}%"></span>
    </div>
    <small class="quota-cell-meta">${used} / ${limit} (${p}%)</small>
  `;
}

function storageCell(usedBytes, limitMb) {
  const usedMb = (Number(usedBytes) || 0) / (1024 * 1024);
  const usedDisp = usedMb >= 100 ? usedMb.toFixed(0) : usedMb.toFixed(1);
  if (!limitMb) return `<small class="quota-cell-meta">${usedDisp} MB / 不限</small>`;
  const p = Math.min(100, Math.round(usedMb / limitMb * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="quota-progress ${cls}">
      <span style="width:${p}%"></span>
    </div>
    <small class="quota-cell-meta">${usedDisp} / ${limitMb} MB (${p}%)</small>
  `;
}

function renderDefaultsCard() {
  const host = $('quotaDefaultsCard');
  if (!host) return;
  if (!quotaDefaults) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div class="stat-card"><span>每日生成上限</span><strong>${escapeHtml(fmtLimit(quotaDefaults.daily_limit))}</strong></div>
    <div class="stat-card"><span>每月生成上限</span><strong>${escapeHtml(fmtLimit(quotaDefaults.monthly_limit))}</strong></div>
    <div class="stat-card"><span>存储上限</span><strong>${quotaDefaults.storage_limit_mb ? `${quotaDefaults.storage_limit_mb} MB` : '不限'}</strong></div>
    <div class="stat-card"><span>并发上限</span><strong>${escapeHtml(fmtLimit(quotaDefaults.concurrent_limit))}</strong></div>
  `;
}

function renderQuotaTable() {
  const wrap = $('quotaTableWrap');
  if (!wrap) return;
  if (!quotaItems.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无数据</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="users-table management-table quota-table">
      <thead>
        <tr>
          <th>用户</th>
          <th>状态</th>
          <th>今日调用</th>
          <th>本月调用</th>
          <th>存储</th>
          <th>失败 (今/月)</th>
          <th>覆盖</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${quotaItems.map((row) => {
          const u = row.user || {};
          const q = row.quota || {};
          const usage = row.usage || {};
          const today = usage.today || {};
          const month = usage.month || {};
          const storage = usage.storage || {};
          const overridden = q.overridden;

          return `
            <tr data-quota-user-id="${escapeHtml(u.id || '')}">
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(u.username || '-')}</strong>
                  <small>${escapeHtml(u.email || '-')}</small>
                </div>
              </td>
              <td>
                <span class="chip ${u.status === 'active' ? 'ok' : 'err'}">${statusLabel(u.status)}</span>
                ${u.role === 'admin' ? '<span class="chip info">管理员</span>' : ''}
              </td>
              <td class="quota-usage-cell">${progressCell(today.calls || 0, q.daily_limit)}</td>
              <td class="quota-usage-cell">${progressCell(month.calls || 0, q.monthly_limit)}</td>
              <td class="quota-usage-cell">${storageCell(storage.bytes || 0, q.storage_limit_mb)}</td>
              <td><small>${today.fails || 0} / ${month.fails || 0}</small></td>
              <td>${overridden ? '<span class="chip info">已覆盖</span>' : '<span class="chip">默认</span>'}</td>
              <td class="users-actions-cell">
                <button class="ghost small" data-quota-act="edit">编辑</button>
                <button class="ghost small" data-quota-act="reset-today">重置今日</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function refreshQuota({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/admin/quota/users');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    quotaItems = Array.isArray(data.items) ? data.items : [];
    quotaDefaults = data.defaults || quotaDefaults;
    quotaLoaded = true;
    renderDefaultsCard();
    renderQuotaTable();
    if (!silent) setStatus(`额度列表已刷新 · ${quotaItems.length} 人`, 'ok', 1400);
  } catch (err) {
    setStatus(`加载额度失败：${err?.message || err}`, 'err', 2400);
    const wrap = $('quotaTableWrap');
    if (wrap) wrap.innerHTML = `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`;
  }
}

function quotaFields(values = {}) {
  return [
    { name: 'daily_limit', label: '每日生成上限（次，留空=不限）', type: 'number', value: values.daily_limit ?? '' },
    { name: 'monthly_limit', label: '每月生成上限（次，留空=不限）', type: 'number', value: values.monthly_limit ?? '' },
    { name: 'storage_limit_mb', label: '存储上限（MB，留空=不限）', type: 'number', value: values.storage_limit_mb ?? '' },
    { name: 'concurrent_limit', label: '并发上限（次，留空=不限）', type: 'number', value: values.concurrent_limit ?? '' }
  ];
}

function normalizeQuotaPayload(values) {
  const out = {};
  for (const k of ['daily_limit', 'monthly_limit', 'storage_limit_mb', 'concurrent_limit']) {
    const raw = values[k];
    if (raw === '' || raw === undefined) out[k] = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`字段 ${k} 必须是非负数字`);
      out[k] = Math.floor(n);
    }
  }
  return out;
}

async function openDefaultsDialog() {
  if (!quotaDefaults) await refreshQuota({ silent: true });
  const result = await dialog.form({
    title: '编辑默认额度',
    fields: quotaFields(quotaDefaults || {}),
    confirmText: '保存',
    validate: (v) => {
      try { normalizeQuotaPayload(v); return null; } catch (e) { return e.message; }
    }
  });
  if (!result.ok) return;
  try {
    const body = normalizeQuotaPayload(result.values);
    const resp = await apiFetch('/api/admin/quota/defaults', { method: 'PUT', body });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    quotaDefaults = data.defaults || quotaDefaults;
    setStatus('默认额度已更新', 'ok', 1400);
    refreshQuota({ silent: true });
  } catch (err) {
    await dialog.info({ title: '保存失败', message: err?.message || '未知错误' });
  }
}

async function openUserQuotaDialog(userId) {
  const item = quotaItems.find((r) => r.user?.id === userId);
  if (!item) return;
  const cur = item.quota?.raw || {};
  const result = await dialog.form({
    title: `编辑额度 · ${item.user.username || item.user.email}`,
    fields: quotaFields({
      daily_limit: cur.daily_limit ?? '',
      monthly_limit: cur.monthly_limit ?? '',
      storage_limit_mb: cur.storage_limit_mb ?? '',
      concurrent_limit: cur.concurrent_limit ?? ''
    }),
    confirmText: '保存',
    validate: (v) => {
      try { normalizeQuotaPayload(v); return null; } catch (e) { return e.message; }
    }
  });
  if (!result.ok) return;
  try {
    const body = normalizeQuotaPayload(result.values);
    const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('额度已更新', 'ok', 1400);
    refreshQuota({ silent: true });
  } catch (err) {
    await dialog.info({ title: '保存失败', message: err?.message || '未知错误' });
  }
}

async function resetUserQuota(userId, scope = 'today') {
  const ok = await dialog.confirm({
    title: '重置用量',
    message: `将清空该用户「${scope === 'month' ? '本月' : '今日'}」的调用计数（不影响存储）。继续？`,
    confirmText: '重置',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}/reset`, {
      method: 'POST',
      body: { scope }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('用量已重置', 'ok', 1400);
    refreshQuota({ silent: true });
  } catch (err) {
    setStatus(`重置失败：${err?.message || err}`, 'err', 2000);
  }
}

function bindQuotaPanel() {
  $('quotaEditDefaults')?.addEventListener('click', () => openDefaultsDialog());

  const wrap = $('quotaTableWrap');
  wrap?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-quota-act]');
    if (!btn) return;
    const row = btn.closest('tr[data-quota-user-id]');
    const id = row?.dataset.quotaUserId;
    if (!id) return;
    if (btn.dataset.quotaAct === 'edit') openUserQuotaDialog(id);
    else if (btn.dataset.quotaAct === 'reset-today') resetUserQuota(id, 'today');
  });
}

function renderAdminGalleryStats() {
  const host = $('adminGalleryStats');
  if (!host) return;
  if (!galleryStats) {
    host.innerHTML = '';
    return;
  }
  const topUsers = (galleryStats.topUsers || []).slice(0, 3);
  const topModels = (galleryStats.topModels || []).slice(0, 3);
  host.innerHTML = `
    <div class="stat-card"><span>总图数</span><strong>${galleryStats.total || 0}</strong></div>
    <div class="stat-card"><span>今日新增</span><strong>${galleryStats.savedToday || 0}</strong></div>
    <div class="stat-card"><span>总容量</span><strong>${formatBytes(galleryStats.totalBytes)}</strong></div>
    <div class="stat-card stat-card-list">
      <span>用户容量 Top</span>
      <ul>
        ${topUsers.length ? topUsers.map((u) => `
          <li><span>${escapeHtml(userLabel(u.userId))}</span><strong>${formatBytes(u.bytes)}</strong></li>
        `).join('') : '<li class="hint">无数据</li>'}
      </ul>
    </div>
    <div class="stat-card stat-card-list">
      <span>模型分布 Top</span>
      <ul>
        ${topModels.length ? topModels.map((m) => `
          <li><span>${escapeHtml(m.model || '-')}</span><strong>${m.count}</strong></li>
        `).join('') : '<li class="hint">无数据</li>'}
      </ul>
    </div>
  `;
}

function syncBulkBar() {
  const bar = $('adminGalleryBulkBar');
  const count = $('adminGalleryBulkCount');
  if (!bar) return;
  if (gallerySelected.size === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  if (count) count.textContent = `已选 ${gallerySelected.size} 张`;
}

function renderAdminGallery() {
  const summary = $('adminGallerySummary');
  const filterSummary = $('adminGalleryFilterSummary');
  const wrap = $('adminGalleryTableWrap');
  if (!wrap) return;

  const items = galleryView.items;
  const total = galleryView.total;
  const totalAll = galleryView.totalAll;

  if (summary) {
    summary.innerHTML = `
      <span class="chip">命中 ${total} / ${totalAll || items.length} 张</span>
      <span class="chip">目录 ${escapeHtml(galleryStorage || 'generated/users/*')}</span>
    `;
  }
  if (filterSummary) {
    filterSummary.textContent = total ? `第 ${galleryFilter.page} 页 · 每页 ${galleryFilter.pageSize}` : '';
  }

  renderAdminGalleryPager();

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无符合条件的图片</p></div>`;
    syncBulkBar();
    return;
  }

  wrap.innerHTML = `
    <table class="users-table management-table admin-gallery-table">
      <thead>
        <tr>
          <th class="admin-gallery-check"><input type="checkbox" data-bulk-toggle aria-label="全选" /></th>
          <th>缩略图</th>
          <th>用户</th>
          <th>文件</th>
          <th>模型 / 尺寸</th>
          <th>大小</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => {
          const src = item.url || item.downloadUrl || '';
          const prompt = item.revisedPrompt || item.prompt || item.filename || '图库图片';
          const isChecked = gallerySelected.has(item.id);
          return `
            <tr data-image-id="${escapeHtml(item.id || '')}" class="${isChecked ? 'selected' : ''}">
              <td class="admin-gallery-check">
                <input type="checkbox" data-row-check ${isChecked ? 'checked' : ''} />
              </td>
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
              <td class="users-actions-cell">
                <button class="ghost small" data-act="view">查看</button>
                <button class="danger ghost small" data-act="delete">删除</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // 同步全选 checkbox
  const allChecked = items.every((it) => gallerySelected.has(it.id));
  const toggle = wrap.querySelector('[data-bulk-toggle]');
  if (toggle) toggle.checked = allChecked && items.length > 0;
  syncBulkBar();
}

function renderAdminGalleryPager() {
  const pager = $('adminGalleryPager');
  if (!pager) return;
  const total = galleryView.total;
  const pageSize = galleryFilter.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }
  pager.hidden = false;
  pager.innerHTML = `
    <button class="ghost small" data-pager="prev" ${galleryFilter.page <= 1 ? 'disabled' : ''}>上一页</button>
    <span>第 ${galleryFilter.page} / ${totalPages} 页</span>
    <button class="ghost small" data-pager="next" ${galleryFilter.page >= totalPages ? 'disabled' : ''}>下一页</button>
  `;
}

function syncFilterOptions() {
  const userSel = $('adminGalleryUserFilter');
  const modelSel = $('adminGalleryModelFilter');
  if (userSel) {
    const current = galleryFilter.userId;
    userSel.innerHTML = `<option value="">全部用户</option>` + users.map((u) => {
      const label = `${u.username || '-'} (${shortId(u.id)})`;
      return `<option value="${escapeHtml(u.id)}" ${current === u.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }
  if (modelSel) {
    const current = galleryFilter.model;
    const models = new Set();
    galleryView.items.forEach((it) => { if (it.model) models.add(it.model); });
    galleryItems.forEach((it) => { if (it.model) models.add(it.model); });
    modelSel.innerHTML = `<option value="">全部模型</option>` + [...models].sort().map((m) => `
      <option value="${escapeHtml(m)}" ${current === m ? 'selected' : ''}>${escapeHtml(m)}</option>
    `).join('');
  }
}

async function refresh({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/users');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    users = Array.isArray(data.items) ? data.items : [];
    renderTable();
    if (galleryLoaded) renderAdminGallery();
    if (openDetailUserId) refreshOpenDetail();
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

function buildAdminGalleryQuery() {
  const params = new URLSearchParams();
  if (galleryFilter.userId) params.set('userId', galleryFilter.userId);
  if (galleryFilter.model) params.set('model', galleryFilter.model);
  if (galleryFilter.search) params.set('search', galleryFilter.search);
  if (galleryFilter.from) params.set('from', galleryFilter.from);
  if (galleryFilter.to) params.set('to', galleryFilter.to);
  params.set('sort', galleryFilter.sort);
  params.set('order', galleryFilter.order);
  params.set('page', String(galleryFilter.page));
  params.set('size', String(galleryFilter.pageSize));
  return params.toString();
}

async function fetchAdminGalleryStats() {
  try {
    const resp = await apiFetch('/api/admin/gallery/stats', { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) galleryStats = data;
  } catch {
    galleryStats = null;
  }
  renderAdminGalleryStats();
}

async function refreshAdminGallery({ silent = false } = {}) {
  const summary = $('adminGallerySummary');
  const wrap = $('adminGalleryTableWrap');
  if (summary) summary.innerHTML = '<span class="chip">正在加载图库…</span>';
  if (wrap && !silent) wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">▧</div><p>正在加载图库…</p></div>`;

  try {
    const qs = buildAdminGalleryQuery();
    const resp = await apiFetch(`/api/admin/gallery?${qs}`, { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    galleryItems = Array.isArray(data.items) ? data.items : [];
    galleryView = {
      items: galleryItems,
      total: Number(data.total) || 0,
      totalAll: Number(data.totalAll) || 0,
      pageInfo: { page: data.page, size: data.pageSize }
    };
    galleryStorage = data.storage || '';
    galleryLoaded = true;
    // 删除已不在视图的选中项（避免漂浮）
    for (const id of [...gallerySelected]) {
      if (!galleryItems.find((it) => it.id === id)) gallerySelected.delete(id);
    }
    syncFilterOptions();
    renderAdminGallery();
    fetchAdminGalleryStats();
    if (!silent) setStatus(`图库列表已刷新 · ${galleryView.total} 张命中`, 'ok', 1400);
  } catch (err) {
    const message = err?.message || String(err);
    if (summary) summary.innerHTML = `<span class="chip error">加载失败：${escapeHtml(message)}</span>`;
    if (wrap) wrap.innerHTML = `<div class="error-banner">加载图库失败：${escapeHtml(message)}</div>`;
    setStatus('加载图库失败', 'err', 2000);
  }
}

async function deleteOneImage(id) {
  const item = galleryItems.find((it) => it.id === id);
  const ok = await dialog.confirm({
    title: '删除图片',
    message: `将永久删除「${item?.filename || id}」（用户：${userLabel(item?.userId)}）。继续？`,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/admin/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    gallerySelected.delete(id);
    setStatus('图片已删除', 'ok', 1400);
    refreshAdminGallery({ silent: true });
  } catch (err) {
    setStatus(`删除失败：${err?.message || err}`, 'err', 2000);
  }
}

async function bulkDeleteImages() {
  if (gallerySelected.size === 0) return;
  const ok = await dialog.confirm({
    title: '批量删除',
    message: `将永久删除选中的 ${gallerySelected.size} 张图片，且不可恢复。继续？`,
    confirmText: '永久删除',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch('/api/admin/gallery/bulk-delete', {
      method: 'POST',
      body: { ids: [...gallerySelected] }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const okCount = Array.isArray(data.ok) ? data.ok.length : 0;
    const failCount = Array.isArray(data.failed) ? data.failed.length : 0;
    setStatus(`已删除 ${okCount} 张${failCount ? `，失败 ${failCount} 张` : ''}`, failCount ? 'err' : 'ok', 2000);
    gallerySelected.clear();
    refreshAdminGallery({ silent: true });
  } catch (err) {
    setStatus(`批量删除失败：${err?.message || err}`, 'err', 2400);
  }
}

function openImageDetail(item) {
  const src = item.url || item.downloadUrl || '';
  const html = `
    <div class="image-detail">
      ${src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"><img class="image-detail-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.filename || '')}" /></a>` : ''}
      <dl class="user-detail-grid">
        <dt>用户</dt><dd>${escapeHtml(userLabel(item.userId))}</dd>
        <dt>文件</dt><dd><code>${escapeHtml(item.path || '')}</code></dd>
        <dt>模型</dt><dd>${escapeHtml(item.model || '-')}</dd>
        <dt>尺寸</dt><dd>${escapeHtml(item.size || '-')}</dd>
        <dt>质量</dt><dd>${escapeHtml(item.quality || '-')}</dd>
        <dt>格式</dt><dd>${escapeHtml(item.outputFormat || '-')}</dd>
        <dt>大小</dt><dd>${escapeHtml(formatBytes(item.bytes))}</dd>
        <dt>来源</dt><dd>${escapeHtml(item.profileName || '-')}</dd>
        <dt>创建时间</dt><dd>${escapeHtml(formatTime(item.createdAt))}</dd>
      </dl>
      <section class="user-detail-block">
        <h3>提示词</h3>
        <p class="prompt-preview-detail">${escapeHtml(item.prompt || '-')}</p>
      </section>
      ${item.revisedPrompt ? `
        <section class="user-detail-block">
          <h3>Revised Prompt</h3>
          <p class="prompt-preview-detail">${escapeHtml(item.revisedPrompt)}</p>
        </section>
      ` : ''}
    </div>
  `;
  drawer.open({ eyebrow: '图库详情', title: item.filename || '图片', body: html });
}

async function runOrphanScan() {
  setStatus('正在扫描孤儿…', 'busy');
  try {
    const resp = await apiFetch('/api/admin/gallery/orphans');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const missing = Array.isArray(data.missingFiles) ? data.missingFiles : [];
    const dangling = Array.isArray(data.danglingFiles) ? data.danglingFiles : [];
    setStatus('孤儿扫描完成', 'ok', 1400);

    const html = `
      <div class="orphan-detail">
        <p class="hint">missingFiles：DB 行存在但磁盘文件缺失。danglingFiles：磁盘有文件但 DB 没记录。</p>

        <section class="user-detail-block">
          <h3>缺失文件 · ${missing.length}</h3>
          ${missing.length ? `
            <ul class="orphan-list">
              ${missing.map((m) => `
                <li>
                  <div><strong>${escapeHtml(m.path)}</strong></div>
                  <small>用户：${escapeHtml(userLabel(m.userId))} · ID：${escapeHtml(shortId(m.id))} · ${escapeHtml(formatTime(m.createdAt))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-row" data-id="${escapeHtml(m.id)}">删除 DB 行</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="hint">无</p>'}
        </section>

        <section class="user-detail-block">
          <h3>未挂接文件 · ${dangling.length}</h3>
          ${dangling.length ? `
            <ul class="orphan-list">
              ${dangling.map((d) => `
                <li>
                  <div><strong>${escapeHtml(d.path)}</strong></div>
                  <small>用户：${escapeHtml(userLabel(d.userId))} · ${escapeHtml(formatBytes(d.bytes))} · ${escapeHtml(formatTime(d.mtime))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-file" data-path="${escapeHtml(d.path)}">删除磁盘文件</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="hint">无</p>'}
        </section>
      </div>
    `;
    drawer.open({ eyebrow: '图库管理', title: '孤儿扫描', body: html });
  } catch (err) {
    setStatus(`孤儿扫描失败：${err?.message || err}`, 'err', 2400);
  }
}

async function onOrphanAction(ev) {
  const btn = ev.target.closest('[data-orphan-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.orphanAct;
  if (act === 'delete-row') {
    const id = btn.dataset.id;
    const ok = await dialog.confirm({
      title: '删除 DB 行',
      message: `将删除指向缺失文件的图库行（${shortId(id)}）。继续？`,
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      const resp = await apiFetch(`/api/admin/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      setStatus('已删除 DB 行', 'ok', 1400);
      runOrphanScan();
    } catch (err) {
      setStatus(`删除失败：${err?.message || err}`, 'err', 2000);
    }
    return;
  }
  if (act === 'delete-file') {
    const path = btn.dataset.path;
    const ok = await dialog.confirm({
      title: '删除磁盘文件',
      message: `将物理删除 ${path}。继续？`,
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      const resp = await apiFetch('/api/admin/gallery/orphans', {
        method: 'DELETE',
        body: { path }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      setStatus('已删除磁盘文件', 'ok', 1400);
      runOrphanScan();
    } catch (err) {
      setStatus(`删除失败：${err?.message || err}`, 'err', 2000);
    }
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
      if (quotaLoaded) refreshQuota({ silent: true });
      if (galleryLoaded) renderAdminGallery();
    }
    setStatus('用户已更新', 'ok', 1400);
  } catch (err) {
    setStatus(`更新失败：${err?.message || err}`, 'err', 2400);
    refresh();
  }
}

function onTableClick(ev) {
  const row = ev.target.closest('tr[data-user-id]');
  if (!row) return;
  const userId = row.dataset.userId;
  const detailBtn = ev.target.closest('[data-act="detail"]');
  if (detailBtn) {
    openUserDetail(userId);
    return;
  }
  const statusBtn = ev.target.closest('.users-status-btn');
  if (!statusBtn || statusBtn.disabled) return;
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
    if (!quotaLoaded) refreshQuota({ silent: true });
    else { renderDefaultsCard(); renderQuotaTable(); }
  } else if (nextTab === 'galleryManagement' && !galleryLoaded) {
    refreshAdminGallery({ silent: true });
  }
}

// ---------- 详情抽屉 ----------

function renderDetailBody(detail) {
  const u = detail?.user || {};
  const stats = detail?.stats || {};
  const sessionsList = Array.isArray(detail?.sessions) ? detail.sessions : [];
  const audits = Array.isArray(detail?.audits) ? detail.audits : [];
  const isSelf = u.id === getCurrentUserId();

  return `
    <div class="user-detail">
      <section class="user-detail-block">
        <h3>基本资料</h3>
        <dl class="user-detail-grid">
          <dt>用户名</dt><dd>${escapeHtml(u.username || '-')}</dd>
          <dt>邮箱</dt><dd>${escapeHtml(u.email || '-')}</dd>
          <dt>ID</dt><dd><code>${escapeHtml(u.id || '-')}</code></dd>
          <dt>角色</dt><dd>${escapeHtml(roleLabel(u.role))}</dd>
          <dt>状态</dt><dd><span class="chip ${u.status === 'active' ? 'ok' : 'err'}">${statusLabel(u.status)}</span></dd>
          <dt>注册时间</dt><dd>${escapeHtml(formatTime(u.created_at || u.createdAt))}</dd>
          <dt>最后登录</dt><dd>${escapeHtml(formatTime(u.last_login_at || u.lastLoginAt))}</dd>
        </dl>
      </section>

      <section class="user-detail-block">
        <h3>资产统计</h3>
        <div class="user-detail-stats">
          <div><span>图片数</span><strong>${stats.imageCount || 0}</strong></div>
          <div><span>占用容量</span><strong>${formatBytes(stats.imageBytes)}</strong></div>
          <div><span>最近一张</span><strong>${escapeHtml(formatTime(stats.lastImageAt))}</strong></div>
          <div><span>活跃会话</span><strong>${stats.activeSessions || 0}</strong></div>
        </div>
      </section>

      <section class="user-detail-block">
        <h3>操作</h3>
        <div class="user-detail-actions">
          <button class="ghost small" data-detail-act="reset-password"${isSelf ? ' disabled title="不能在自己详情页重置密码"' : ''}>重置密码</button>
          <button class="ghost small" data-detail-act="logout"${isSelf ? ' disabled title="不能强制下线自己"' : ''}>强制下线</button>
          <button class="danger ghost small" data-detail-act="delete"${isSelf ? ' disabled title="不能删除自己"' : ''}>删除用户</button>
        </div>
        <p class="hint">删除用户将一并清理其图片目录与会话；不可恢复。</p>
      </section>

      <section class="user-detail-block">
        <h3>活跃会话 (${sessionsList.length})</h3>
        ${sessionsList.length ? `
          <ul class="user-session-list">
            ${sessionsList.map((s) => `
              <li>
                <div><strong>${escapeHtml(s.ip || '-')}</strong> <small>${escapeHtml(formatTime(s.createdAt))}</small></div>
                <small class="user-session-ua">${escapeHtml(String(s.userAgent || '').slice(0, 96))}</small>
              </li>
            `).join('')}
          </ul>
        ` : '<p class="hint">无活跃会话</p>'}
      </section>

      <section class="user-detail-block">
        <h3>审计记录 (${audits.length})</h3>
        ${audits.length ? `
          <ul class="user-audit-list">
            ${audits.slice(0, 30).map((a) => `
              <li>
                <span class="chip">${escapeHtml(a.action)}</span>
                <small>${escapeHtml(formatTime(a.createdAt))}</small>
                <small>${escapeHtml(a.actorName || a.actorId || '-')}</small>
                ${a.meta ? `<code class="user-audit-meta">${escapeHtml(JSON.stringify(a.meta))}</code>` : ''}
              </li>
            `).join('')}
          </ul>
        ` : '<p class="hint">暂无操作记录</p>'}
      </section>
    </div>
  `;
}

async function fetchUserDetail(userId) {
  const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function refreshOpenDetail() {
  if (!openDetailUserId) return;
  try {
    const detail = await fetchUserDetail(openDetailUserId);
    drawer.update({ body: renderDetailBody(detail) });
  } catch (err) {
    drawer.update({ body: `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>` });
  }
}

async function openUserDetail(userId) {
  openDetailUserId = userId;
  drawer.open({
    eyebrow: '用户管理',
    title: userLabel(userId),
    body: '<div class="empty-state"><p>正在加载…</p></div>',
    onClose: () => { openDetailUserId = null; }
  });
  await refreshOpenDetail();
}

async function onDetailAction(ev) {
  const btn = ev.target.closest('[data-detail-act]');
  if (!btn || btn.disabled) return;
  const userId = openDetailUserId;
  if (!userId) return;
  const act = btn.dataset.detailAct;
  const user = users.find((u) => u.id === userId);
  const label = user?.username || user?.email || userId;

  if (act === 'reset-password') {
    const ok = await dialog.confirm({
      title: '重置密码',
      message: `将为「${label}」生成一个新临时密码并强制其所有会话下线。继续？`,
      confirmText: '重置并生成',
      danger: true
    });
    if (!ok) return;
    try {
      const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        body: {}
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      if (data.generated && data.password) {
        await dialog.showSecret({
          title: '临时密码已生成',
          message: '此密码仅显示一次，请尽快通知用户登录后修改。',
          secret: data.password
        });
      }
      setStatus('密码已重置', 'ok', 1600);
      refreshOpenDetail();
    } catch (err) {
      setStatus(`重置失败：${err?.message || err}`, 'err', 2400);
    }
    return;
  }

  if (act === 'logout') {
    const ok = await dialog.confirm({
      title: '强制下线',
      message: `将立即销毁「${label}」的所有会话。继续？`,
      confirmText: '下线',
      danger: true
    });
    if (!ok) return;
    try {
      const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}/logout`, {
        method: 'POST',
        body: {}
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      setStatus('已强制下线', 'ok', 1600);
      refreshOpenDetail();
    } catch (err) {
      setStatus(`下线失败：${err?.message || err}`, 'err', 2400);
    }
    return;
  }

  if (act === 'delete') {
    const ok = await dialog.confirm({
      title: '删除用户',
      message: `「${label}」及其所有图片、会话将被永久删除，且不可恢复。继续？`,
      confirmText: '永久删除',
      danger: true
    });
    if (!ok) return;
    try {
      const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      const removed = data?.removed?.removedImages || 0;
      setStatus(`用户已删除（清理 ${removed} 张图片）`, 'ok', 2000);
      drawer.close();
      refresh({ silent: true });
      if (galleryLoaded) refreshAdminGallery({ silent: true });
    } catch (err) {
      setStatus(`删除失败：${err?.message || err}`, 'err', 2400);
    }
    return;
  }
}

async function openCreateDialog() {
  const result = await dialog.form({
    title: '新建用户',
    fields: [
      { name: 'username', label: '用户名', required: true, placeholder: '3-32 位字母/数字/_-', pattern: '[a-zA-Z0-9_\\-]{3,32}' },
      { name: 'email', label: '邮箱', type: 'email', required: true },
      { name: 'password', label: '初始密码（≥ 8 位）', type: 'password', required: true, minlength: 8 },
      { name: 'role', label: '角色', type: 'select', value: 'user', options: [
        { value: 'user', label: '普通用户' },
        { value: 'admin', label: '管理员' }
      ]}
    ],
    confirmText: '创建',
    validate: (v) => {
      if (!v.username || !v.email || !v.password) return '所有字段都需要填写';
      if (v.password.length < 8) return '密码至少 8 位';
      return null;
    }
  });
  if (!result.ok) return;

  try {
    const resp = await apiFetch('/api/users', { method: 'POST', body: result.values });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('用户已创建', 'ok', 1600);
    refresh({ silent: true });
  } catch (err) {
    await dialog.info({
      title: '创建失败',
      message: err?.message || '未知错误'
    });
  }
}

function bindToolbar() {
  const search = $('usersSearch');
  const roleSel = $('usersRoleFilter');
  const statusSel = $('usersStatusFilter');
  const createBtn = $('usersCreate');

  search?.addEventListener('input', () => {
    filterState.search = search.value || '';
    renderTable();
  });
  roleSel?.addEventListener('change', () => {
    filterState.role = roleSel.value || 'all';
    renderTable();
  });
  statusSel?.addEventListener('change', () => {
    filterState.status = statusSel.value || 'all';
    renderTable();
  });
  createBtn?.addEventListener('click', () => openCreateDialog());

  // 详情抽屉中的操作（用户 + 孤儿）
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-detail-act]') && openDetailUserId) {
      onDetailAction(ev);
      return;
    }
    if (ev.target.closest('[data-orphan-act]')) {
      onOrphanAction(ev);
    }
  });
}

function bindAdminGalleryToolbar() {
  let searchTimer = null;
  const queueRefresh = () => {
    galleryFilter.page = 1;
    refreshAdminGallery({ silent: true });
  };

  $('adminGalleryUserFilter')?.addEventListener('change', (ev) => {
    galleryFilter.userId = ev.target.value || '';
    queueRefresh();
  });
  $('adminGalleryModelFilter')?.addEventListener('change', (ev) => {
    galleryFilter.model = ev.target.value || '';
    queueRefresh();
  });
  $('adminGallerySearch')?.addEventListener('input', (ev) => {
    galleryFilter.search = ev.target.value || '';
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(queueRefresh, 240);
  });
  $('adminGalleryFrom')?.addEventListener('change', (ev) => {
    galleryFilter.from = ev.target.value || '';
    queueRefresh();
  });
  $('adminGalleryTo')?.addEventListener('change', (ev) => {
    galleryFilter.to = ev.target.value || '';
    queueRefresh();
  });
  $('adminGallerySort')?.addEventListener('change', (ev) => {
    const [field, dir] = String(ev.target.value || 'createdAt:desc').split(':');
    galleryFilter.sort = field || 'createdAt';
    galleryFilter.order = dir === 'asc' ? 'asc' : 'desc';
    queueRefresh();
  });

  $('adminGalleryBulkClear')?.addEventListener('click', () => {
    gallerySelected.clear();
    renderAdminGallery();
  });
  $('adminGalleryBulkDelete')?.addEventListener('click', () => bulkDeleteImages());
  $('adminGalleryOrphans')?.addEventListener('click', () => runOrphanScan());

  // 表格内事件
  const wrap = $('adminGalleryTableWrap');
  wrap?.addEventListener('click', (ev) => {
    const toggle = ev.target.closest('[data-bulk-toggle]');
    if (toggle) {
      if (toggle.checked) {
        galleryView.items.forEach((it) => gallerySelected.add(it.id));
      } else {
        galleryView.items.forEach((it) => gallerySelected.delete(it.id));
      }
      renderAdminGallery();
      return;
    }
    const rowCheck = ev.target.closest('[data-row-check]');
    if (rowCheck) {
      const row = rowCheck.closest('tr[data-image-id]');
      const id = row?.dataset.imageId;
      if (!id) return;
      if (rowCheck.checked) gallerySelected.add(id);
      else gallerySelected.delete(id);
      row.classList.toggle('selected', rowCheck.checked);
      syncBulkBar();
      const allChecked = galleryView.items.every((it) => gallerySelected.has(it.id));
      const head = wrap.querySelector('[data-bulk-toggle]');
      if (head) head.checked = allChecked && galleryView.items.length > 0;
      return;
    }
    const actionBtn = ev.target.closest('[data-act]');
    if (actionBtn) {
      const row = actionBtn.closest('tr[data-image-id]');
      const id = row?.dataset.imageId;
      if (!id) return;
      const item = galleryItems.find((it) => it.id === id);
      if (actionBtn.dataset.act === 'delete') deleteOneImage(id);
      else if (actionBtn.dataset.act === 'view' && item) openImageDetail(item);
    }
  });

  $('adminGalleryPager')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pager]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.pager === 'prev') galleryFilter.page = Math.max(1, galleryFilter.page - 1);
    else if (btn.dataset.pager === 'next') galleryFilter.page += 1;
    refreshAdminGallery({ silent: true });
  });
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
  quotaRefreshBtn?.addEventListener('click', () => refreshQuota());
  adminGalleryRefreshBtn?.addEventListener('click', () => refreshAdminGallery());
  wrap?.addEventListener('click', onTableClick);
  wrap?.addEventListener('change', onTableChange);
  bindToolbar();
  bindAdminGalleryToolbar();
  bindQuotaPanel();
  switchManagementTab('usersManagement');
  refresh();
}
