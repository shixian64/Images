// ??????????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as drawer from './drawer.js';
import * as dialog from './dialog.js';
import {
  adminGalleryFilterSummaryText,
  adminGalleryImageDetailView,
  adminGalleryModelFilterOptionsHtml,
  adminGalleryOrphanScanHtml,
  adminGalleryPagerView,
  adminGalleryShortId,
  adminGalleryStatsHtml,
  adminGallerySummaryHtml,
  adminGalleryTableView,
  adminGalleryUserFilterOptionsHtml,
  adminGalleryUserLabel
} from './admin-gallery-view.js';

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

function shortId(id) {
  return adminGalleryShortId(id);
}

function userLabel(userId) {
  return adminGalleryUserLabel(userId, adminGalleryUsers);
}

function renderAdminGalleryStats() {
  const host = $('adminGalleryStats');
  if (!host) return;
  host.innerHTML = adminGalleryStatsHtml(galleryStats, { users: adminGalleryUsers });
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
    summary.innerHTML = adminGallerySummaryHtml({
      total,
      totalAll,
      itemCount: items.length,
      storage: galleryStorage
    });
  }
  if (filterSummary) {
    filterSummary.textContent = adminGalleryFilterSummaryText({
      total,
      page: galleryFilter.page,
      pageSize: galleryFilter.pageSize
    });
  }

  renderAdminGalleryPager();

  const table = adminGalleryTableView(items, {
    selectedIds: gallerySelected,
    users: adminGalleryUsers
  });
  wrap.innerHTML = table.html;
  if (table.empty) {
    syncBulkBar();
    return;
  }

  // 同步全选 checkbox
  const allChecked = items.every((it) => gallerySelected.has(it.id));
  const toggle = wrap.querySelector('[data-bulk-toggle]');
  if (toggle) toggle.checked = allChecked && items.length > 0;
  syncBulkBar();
}

function renderAdminGalleryPager() {
  const pager = $('adminGalleryPager');
  if (!pager) return;
  const view = adminGalleryPagerView({
    total: galleryView.total,
    pageSize: galleryFilter.pageSize,
    page: galleryFilter.page
  });
  pager.hidden = view.hidden;
  pager.innerHTML = view.html;
}

function syncFilterOptions() {
  const userSel = $('adminGalleryUserFilter');
  const modelSel = $('adminGalleryModelFilter');
  if (userSel) {
    const current = galleryFilter.userId;
    userSel.innerHTML = adminGalleryUserFilterOptionsHtml(adminGalleryUsers, current);
  }
  if (modelSel) {
    const current = galleryFilter.model;
    const models = new Set();
    galleryView.items.forEach((it) => { if (it.model) models.add(it.model); });
    galleryItems.forEach((it) => { if (it.model) models.add(it.model); });
    modelSel.innerHTML = adminGalleryModelFilterOptionsHtml(models, current);
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
  const detail = adminGalleryImageDetailView(item, { users: adminGalleryUsers });
  drawer.open({ eyebrow: '图库详情', title: detail.title, body: detail.html, unsafeHtml: true });
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

    const html = adminGalleryOrphanScanHtml({ missing, dangling }, { users: adminGalleryUsers });
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
