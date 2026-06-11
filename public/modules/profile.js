// 个人资料下拉菜单 + 修改资料/修改密码对话框 + 我的用量。
// 注意：此文件的"profile"指"用户个人资料"，与 profiles.js（接口配置）同名不同义。

import { $, setStatus } from './dom.js';
import { apiFetch, logout, setCurrentUser } from './auth.js';
import * as drawer from './drawer.js';
import { switchTab } from './nav.js';
import {
  displayAvatarUrl,
  passwordDialogHtml,
  profileDialogHtml,
  profileMenuHtml,
  usageDrawerHtml,
  usageErrorHtml,
  usageLoadingHtml
} from './profile-view.js';

let menuMounted = false;
let profileDialog = null;
let passwordDialog = null;
let currentUser = null;
let passwordResetNoticeShown = false;

function renderMenu() {
  const host = $('userMenu');
  if (!host || !currentUser) return;
  host.innerHTML = profileMenuHtml(currentUser);
}

function toggleDropdown(open) {
  const host = $('userMenu');
  if (!host) return;
  const trigger = host.querySelector('.user-menu-trigger');
  const dropdown = host.querySelector('.user-menu-dropdown');
  if (!trigger || !dropdown) return;
  const next = typeof open === 'boolean' ? open : dropdown.hidden;
  dropdown.hidden = !next;
  trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
}

function ensureProfileDialog() {
  if (profileDialog) return profileDialog;
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = profileDialogHtml();
  document.body.appendChild(dlg);
  profileDialog = dlg;

  const form = dlg.querySelector('[data-profile-form]');
  form.addEventListener('submit', async (ev) => {
    const submitter = ev.submitter;
    if (!submitter || submitter.value !== 'confirm') return; // 取消不做事
    ev.preventDefault();
    const err = dlg.querySelector('[data-err]');
    err.hidden = true; err.textContent = '';
    const fd = new FormData(form);
    const body = {
      username: String(fd.get('username') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      avatarUrl: String(fd.get('avatarUrl') || '').trim()
    };
    const confirmBtn = dlg.querySelector('[data-confirm]');
    confirmBtn.disabled = true;
    try {
      const resp = await apiFetch('/api/profile', { method: 'PATCH', body });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      const user = data?.user;
      if (user) {
        currentUser = { ...currentUser, ...user };
        setCurrentUser(currentUser);
        renderMenu();
      }
      dlg.close('confirm');
      setStatus('个人资料已更新', 'ok', 1600);
    } catch (e) {
      err.textContent = e?.message || '更新失败';
      err.hidden = false;
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return dlg;
}

function openProfileDialog() {
  const dlg = ensureProfileDialog();
  const form = dlg.querySelector('[data-profile-form]');
  form.username.value = currentUser?.username || '';
  form.email.value = currentUser?.email || '';
  form.avatarUrl.value = displayAvatarUrl(currentUser);
  dlg.querySelector('[data-err]').hidden = true;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function ensurePasswordDialog() {
  if (passwordDialog) return passwordDialog;
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = passwordDialogHtml();
  document.body.appendChild(dlg);
  passwordDialog = dlg;

  const form = dlg.querySelector('[data-password-form]');
  dlg.addEventListener('cancel', (ev) => {
    if (dlg.dataset.forced === 'true') ev.preventDefault();
  });
  form.addEventListener('submit', async (ev) => {
    const submitter = ev.submitter;
    if (!submitter || submitter.value !== 'confirm') return;
    ev.preventDefault();
    const err = dlg.querySelector('[data-err]');
    err.hidden = true; err.textContent = '';
    const fd = new FormData(form);
    const oldPassword = String(fd.get('oldPassword') || '');
    const newPassword = String(fd.get('newPassword') || '');
    const confirmPassword = String(fd.get('confirmPassword') || '');
    if (newPassword.length < 8) {
      err.textContent = '新密码至少 8 位'; err.hidden = false; return;
    }
    if (newPassword !== confirmPassword) {
      err.textContent = '两次密码不一致'; err.hidden = false; return;
    }

    const confirmBtn = dlg.querySelector('[data-confirm]');
    confirmBtn.disabled = true;
    try {
      const resp = await apiFetch('/api/profile/password', {
        method: 'POST',
        body: { oldPassword, newPassword }
      });
      if (resp.status !== 204 && !resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      dlg.close('confirm');
      alert('密码已更新，请重新登录');
      location.reload();
    } catch (e) {
      err.textContent = e?.message || '修改失败';
      err.hidden = false;
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return dlg;
}

function openPasswordDialog({ forced = false } = {}) {
  const dlg = ensurePasswordDialog();
  const form = dlg.querySelector('[data-password-form]');
  form.reset();
  dlg.dataset.forced = forced ? 'true' : 'false';
  const resetHint = dlg.querySelector('[data-reset-required]');
  if (resetHint) resetHint.hidden = !forced;
  const cancelBtn = dlg.querySelector('[data-cancel]');
  if (cancelBtn) {
    cancelBtn.hidden = forced;
    cancelBtn.disabled = forced;
  }
  dlg.querySelector('[data-err]').hidden = true;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

async function openUsageDrawer() {
  drawer.open({
    eyebrow: '我的用量',
    title: '使用情况',
    body: usageLoadingHtml(),
    unsafeHtml: true
  });
  try {
    const resp = await apiFetch('/api/quota/me');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    drawer.update({ body: usageDrawerHtml(data), unsafeHtml: true });
  } catch (err) {
    drawer.update({ body: usageErrorHtml(err?.message || '加载失败'), unsafeHtml: true });
  }
}

function needsPasswordReset(user = currentUser) {
  return Boolean(user?.passwordResetRequired || user?.password_reset_required);
}

export function mountProfileMenu(user) {
  currentUser = user || null;
  setCurrentUser(currentUser);
  renderMenu();
  if (needsPasswordReset(currentUser) && !passwordResetNoticeShown) {
    passwordResetNoticeShown = true;
    setStatus('管理员已重置你的密码，请先修改密码后继续使用。', 'warn', 6000);
    setTimeout(() => openPasswordDialog({ forced: true }), 0);
  }
  if (menuMounted) return;
  menuMounted = true;

  // why：点击 trigger 打开下拉；外部点击自动收起。
  document.addEventListener('click', (ev) => {
    const host = $('userMenu');
    if (!host) return;
    const trigger = host.querySelector('.user-menu-trigger');
    const dropdown = host.querySelector('.user-menu-dropdown');
    if (!trigger || !dropdown) return;
    if (trigger.contains(ev.target)) {
      toggleDropdown();
      return;
    }
    const item = ev.target.closest('[role="menuitem"]');
    if (item && dropdown.contains(item)) {
      toggleDropdown(false);
      const action = item.dataset.action;
      if (action === 'profile') openProfileDialog();
      else if (action === 'password') openPasswordDialog();
      else if (action === 'usage') openUsageDrawer();
      else if (action === 'admin') switchTab('usersPanel');
      else if (action === 'logout') logout();
      return;
    }
    if (!dropdown.hidden && !host.contains(ev.target)) toggleDropdown(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') toggleDropdown(false);
  });
}
