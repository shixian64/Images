// ??????????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as drawer from './drawer.js';
import * as dialog from './dialog.js';

let galleryItems = [];
let galleryStorage = '';
let galleryStats = null;
let galleryLoaded = false;
let adminGalleryUsers = [];

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

export function isAdminGalleryLoaded() {
  return galleryLoaded;
}

export function setAdminGalleryUsers(users = []) {
  adminGalleryUsers = Array.isArray(users) ? users : [];
  syncFilterOptions();
}

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

function userLabel(userId) {
  const user = adminGalleryUsers.find((item) => item.id === userId);
  if (!user) return shortId(userId);
  return user.username || user.email || shortId(userId);
}

function knownUsers() {
  return [...adminGalleryUsers].sort((a, b) => {
    const left = String(a?.username || a?.email || a?.id || '');
    const right = String(b?.username || b?.email || b?.id || '');
    return left.localeCompare(right, 'zh-CN');
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

export function renderAdminGallery() {
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
          const missing = item.fileMissing === true;
          const src = missing ? '' : (item.thumbnailUrl || item.previewUrl || item.url || item.downloadUrl || '');
          const prompt = item.revisedPrompt || item.prompt || item.filename || '图库图片';
          const isChecked = gallerySelected.has(item.id);
          return `
            <tr data-image-id="${escapeHtml(item.id || '')}" class="${[isChecked ? 'selected' : '', missing ? 'is-missing-file' : ''].filter(Boolean).join(' ')}">
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
                  ${missing ? `<small class="muted-text">missing: ${escapeHtml(item.missingReason || 'missing_file')}</small>` : ''}
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
              <td class="users-actions-cell"><div class="actions-wrap">
                <button class="ghost small" data-act="view">查看</button>
                <button class="danger ghost small" data-act="delete">删除</button>
              </div></td>
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
    userSel.innerHTML = `<option value="">全部用户</option>` + knownUsers().map((u) => {
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

export async function refreshAdminGallery({ silent = false } = {}) {
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
  const src = item.fileMissing === true ? '' : (item.previewUrl || item.url || item.downloadUrl || '');
  const originalSrc = item.fileMissing === true ? '' : (item.downloadUrl || item.url || src);
  const html = `
    <div class="image-detail">
      ${src ? `<a href="${escapeHtml(originalSrc)}" target="_blank" rel="noreferrer"><img class="image-detail-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.filename || '')}" /></a>` : ''}
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
  drawer.open({ eyebrow: '图库详情', title: item.filename || '图片', body: html, unsafeHtml: true });
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
    drawer.open({ eyebrow: '图库管理', title: '孤儿扫描', body: html, unsafeHtml: true });
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

export function bindAdminGalleryToolbar() {
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

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-orphan-act]')) onOrphanAction(ev);
  });

  $('adminGalleryPager')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pager]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.pager === 'prev') galleryFilter.page = Math.max(1, galleryFilter.page - 1);
    else if (btn.dataset.pager === 'next') galleryFilter.page += 1;
    refreshAdminGallery({ silent: true });
  });
}
