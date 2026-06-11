// 管理员管理面板：用户管理 + 额度管理入口 + 图库管理概览。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import { apiFetch, getCurrentUserId } from './auth.js';
import { bindGlobalInterfacePanel, ensureGlobalInterfaceLoaded } from './admin-interfaces.js';
import * as drawer from './drawer.js';
import * as dialog from './dialog.js';
import {
  bindRegistrationPanel,
  isRegistrationLoaded,
  refreshRegistration,
  renderRegistrationForm
} from './admin-registration.js';
import {
  bindAdminClientLogsPanel,
  isAdminClientLogsLoaded,
  refreshAdminClientLogs,
  renderAdminClientLogs,
  setAdminClientLogUsers
} from './admin-client-logs.js';
import {
  bindAdminJobsPanel,
  isAdminJobsLoaded,
  refreshAdminJobs,
  renderAdminJobSettings,
  renderAdminJobsSummary,
  renderAdminJobsTable,
  setAdminJobUsers
} from './admin-jobs.js';
import {
  bindAdminGalleryToolbar,
  isAdminGalleryLoaded,
  refreshAdminGallery,
  renderAdminGallery,
  setAdminGalleryUsers
} from './admin-gallery.js';
import {
  bindQuotaPanel,
  isQuotaLoaded,
  refreshQuota,
  renderDefaultsCard,
  renderQuotaTable
} from './admin-quota.js';
import {
  shortId,
  usersPagerView,
  usersTableHtml
} from './users-view.js';
import { renderUserDetailBody } from './users-detail-view.js';

let users = [];
let mounted = false;
let filterState = { search: '', role: 'all', status: 'all' };
let userView = { total: 0, filtered: 0, page: 1, pageSize: 50 };
const userDirectory = new Map();
let openDetailUserId = null;


const MANAGEMENT_TABS = new Set([
  'usersManagement',
  'registrationManagement',
  'quotaManagement',
  'jobManagement',
  'clientLogManagement',
  'interfaceManagement',
  'galleryManagement'
]);

function userLabel(userId) {
  const user = userDirectory.get(userId) || users.find((item) => item.id === userId);
  if (!user) return shortId(userId);
  return user.username || user.email || shortId(userId);
}

function rememberUsers(items = []) {
  items.forEach((item) => {
    if (item?.id) userDirectory.set(item.id, item);
  });
}

function knownUsers() {
  return Array.from(userDirectory.values()).sort((a, b) => {
    const left = String(a?.username || a?.email || a?.id || '');
    const right = String(b?.username || b?.email || b?.id || '');
    return left.localeCompare(right, 'zh-CN');
  });
}

function renderTable() {
  const wrap = $('usersTableWrap');
  const summary = $('usersSummary');
  if (!wrap) return;

  if (summary) {
    if (userView.total === userView.filtered) {
      summary.textContent = `共 ${userView.total} 人 · 第 ${userView.page} 页`;
    } else {
      summary.textContent = `命中 ${userView.filtered} / ${userView.total} 人 · 第 ${userView.page} 页`;
    }
  }

  renderUsersPager();

  wrap.innerHTML = usersTableHtml(users, { currentUserId: getCurrentUserId() });
}

function renderUsersPager() {
  const pager = $('usersPager');
  if (!pager) return;
  const view = usersPagerView(userView);
  pager.hidden = view.hidden;
  pager.innerHTML = view.html;
}

function buildUsersQuery() {
  const params = new URLSearchParams();
  params.set('page', String(userView.page || 1));
  params.set('size', String(userView.pageSize || 50));
  if (filterState.search) params.set('search', filterState.search);
  if (filterState.role && filterState.role !== 'all') params.set('role', filterState.role);
  if (filterState.status && filterState.status !== 'all') params.set('status', filterState.status);
  return params.toString();
}

async function refresh({ silent = false } = {}) {
  try {
    const resp = await apiFetch(`/api/users?${buildUsersQuery()}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    users = Array.isArray(data.items) ? data.items : [];
    rememberUsers(users);
    userView = {
      total: Number(data.total) || 0,
      filtered: Number(data.filtered) || 0,
      page: Number(data.page) || userView.page || 1,
      pageSize: Number(data.pageSize) || userView.pageSize || 50
    };
    renderTable();
    const known = knownUsers();
    setAdminClientLogUsers(known);
    setAdminJobUsers(known);
    setAdminGalleryUsers(known);
    if (isAdminGalleryLoaded()) renderAdminGallery();
    if (isAdminClientLogsLoaded()) renderAdminClientLogs();
    if (openDetailUserId) refreshOpenDetail();
    if (!silent) setStatus(`用户列表已刷新 · ${userView.filtered} 人命中`, 'ok', 1400);
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
      rememberUsers([updated]);
      const index = users.findIndex((u) => u.id === userId);
      if (index >= 0) users[index] = { ...users[index], ...updated };
      renderTable();
      if (isQuotaLoaded()) refreshQuota({ silent: true });
      if (isAdminGalleryLoaded()) renderAdminGallery();
      refresh({ silent: true });
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

  if (nextTab === 'registrationManagement') {
    if (!isRegistrationLoaded()) refreshRegistration({ silent: true });
    else renderRegistrationForm();
  } else if (nextTab === 'quotaManagement') {
    if (!isQuotaLoaded()) refreshQuota({ silent: true });
    else { renderDefaultsCard(); renderQuotaTable(); }
  } else if (nextTab === 'jobManagement') {
    if (!isAdminJobsLoaded()) refreshAdminJobs({ silent: true });
    else { renderAdminJobsSummary(); renderAdminJobSettings(); renderAdminJobsTable(); }
  } else if (nextTab === 'clientLogManagement') {
    if (!isAdminClientLogsLoaded()) refreshAdminClientLogs({ silent: true });
    else renderAdminClientLogs();
  } else if (nextTab === 'interfaceManagement') {
    ensureGlobalInterfaceLoaded({ silent: true });
  } else if (nextTab === 'galleryManagement' && !isAdminGalleryLoaded()) {
    refreshAdminGallery({ silent: true });
  }
}

// ---------- 详情抽屉 ----------

async function fetchUserDetail(userId, include = '') {
  const qs = include ? `?include=${encodeURIComponent(include)}` : '';
  const resp = await apiFetch(`/api/users/${encodeURIComponent(userId)}${qs}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function refreshOpenDetail() {
  if (!openDetailUserId) return;
  const userId = openDetailUserId;
  const sections = ['jobs', 'clientLogs', 'audits', 'activityLogs'];
  try {
    const detail = await fetchUserDetail(userId);
    if (openDetailUserId !== userId) return;
    const loadingDetail = { ...detail, loadingSections: sections };
    drawer.update({ body: renderUserDetailBody(loadingDetail, { currentUserId: getCurrentUserId() }), unsafeHtml: true });

    const results = await Promise.allSettled(
      sections.map(async (section) => {
        try {
          return { section, data: await fetchUserDetail(userId, section) };
        } catch (err) {
          err.section = section;
          throw err;
        }
      })
    );
    if (openDetailUserId !== userId) return;
    const sectionErrors = {};
    const fullDetail = { ...detail };
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        Object.assign(fullDetail, result.value.data);
      } else {
        const section = result.reason?.section || 'unknown';
        sectionErrors[section] = result.reason?.message || String(result.reason || '加载失败');
      }
    });
    drawer.update({ body: renderUserDetailBody({ ...fullDetail, sectionErrors }, { currentUserId: getCurrentUserId() }), unsafeHtml: true });
  } catch (err) {
    drawer.update({ body: `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`, unsafeHtml: true });
  }
}

async function openUserDetail(userId) {
  openDetailUserId = userId;
  drawer.open({
    eyebrow: '用户管理',
    title: userLabel(userId),
    body: '<div class="empty-state"><p>正在加载…</p></div>',
    unsafeHtml: true,
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
      if (isAdminGalleryLoaded()) refreshAdminGallery({ silent: true });
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
  const pager = $('usersPager');
  let searchTimer = null;
  const queueRefresh = () => {
    userView.page = 1;
    refresh({ silent: true });
  };

  search?.addEventListener('input', () => {
    filterState.search = search.value || '';
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(queueRefresh, 240);
  });
  roleSel?.addEventListener('change', () => {
    filterState.role = roleSel.value || 'all';
    queueRefresh();
  });
  statusSel?.addEventListener('change', () => {
    filterState.status = statusSel.value || 'all';
    queueRefresh();
  });
  createBtn?.addEventListener('click', () => openCreateDialog());
  pager?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-users-pager]');
    if (!btn || btn.disabled) return;
    const totalPages = Math.max(1, Math.ceil((Number(userView.filtered) || 0) / (Number(userView.pageSize) || 50)));
    if (btn.dataset.usersPager === 'prev') userView.page = Math.max(1, userView.page - 1);
    else if (btn.dataset.usersPager === 'next') userView.page = Math.min(totalPages, userView.page + 1);
    refresh({ silent: true });
  });

  // 详情抽屉中的操作（用户 + 孤儿）
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-detail-act]') && openDetailUserId) {
      onDetailAction(ev);
      return;
    }
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
  bindAdminJobsPanel();
  bindAdminClientLogsPanel();
  bindGlobalInterfacePanel();
  bindRegistrationPanel();
  switchManagementTab('usersManagement');
  refresh();
}
