// 个人资料下拉菜单 + 修改资料/修改密码对话框。
// 注意：此文件的"profile"指"用户个人资料"，与 profiles.js（接口配置）同名不同义。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch, logout, setCurrentUser } from './auth.js';

let menuMounted = false;
let profileDialog = null;
let passwordDialog = null;
let currentUser = null;

function avatarInitial(user) {
  const s = (user?.username || user?.email || '?').trim();
  return s.slice(0, 1).toUpperCase();
}

function renderMenu() {
  const host = $('userMenu');
  if (!host || !currentUser) return;
  host.innerHTML = `
    <button class="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
      ${currentUser.avatar_url
        ? `<img class="user-avatar" src="${escapeHtml(currentUser.avatar_url)}" alt="" />`
        : `<span class="user-avatar user-avatar-text">${escapeHtml(avatarInitial(currentUser))}</span>`}
      <span class="user-name">${escapeHtml(currentUser.username || currentUser.email || '用户')}</span>
      <span class="user-caret" aria-hidden="true">▾</span>
    </button>
    <div class="user-menu-dropdown" role="menu" hidden>
      <button role="menuitem" data-action="profile" type="button">个人资料</button>
      <button role="menuitem" data-action="password" type="button">修改密码</button>
      <button role="menuitem" data-action="logout" type="button">退出登录</button>
    </div>
  `;
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
  dlg.innerHTML = `
    <form method="dialog" class="app-dialog-form" data-profile-form>
      <h3>个人资料</h3>
      <div class="error-banner" data-err hidden></div>
      <label class="field"><span>用户名</span>
        <input name="username" required pattern="[a-zA-Z0-9_\\-]{3,32}" />
      </label>
      <label class="field"><span>邮箱</span>
        <input name="email" type="email" required />
      </label>
      <label class="field"><span>头像 URL（可选）</span>
        <input name="avatarUrl" type="url" />
      </label>
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit">取消</button>
        <button value="confirm" class="primary" type="submit" data-confirm>保存</button>
      </div>
    </form>
  `;
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
  form.avatarUrl.value = currentUser?.avatar_url || currentUser?.avatarUrl || '';
  dlg.querySelector('[data-err]').hidden = true;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function ensurePasswordDialog() {
  if (passwordDialog) return passwordDialog;
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = `
    <form method="dialog" class="app-dialog-form" data-password-form>
      <h3>修改密码</h3>
      <div class="error-banner" data-err hidden></div>
      <label class="field"><span>当前密码</span>
        <input name="oldPassword" type="password" required />
      </label>
      <label class="field"><span>新密码（至少 8 位）</span>
        <input name="newPassword" type="password" required minlength="8" />
      </label>
      <label class="field"><span>确认新密码</span>
        <input name="confirmPassword" type="password" required minlength="8" />
      </label>
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit">取消</button>
        <button value="confirm" class="primary" type="submit" data-confirm>提交</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  passwordDialog = dlg;

  const form = dlg.querySelector('[data-password-form]');
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

function openPasswordDialog() {
  const dlg = ensurePasswordDialog();
  const form = dlg.querySelector('[data-password-form]');
  form.reset();
  dlg.querySelector('[data-err]').hidden = true;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

export function mountProfileMenu(user) {
  currentUser = user || null;
  setCurrentUser(currentUser);
  renderMenu();
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
      else if (action === 'logout') logout();
      return;
    }
    if (!dropdown.hidden && !host.contains(ev.target)) toggleDropdown(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') toggleDropdown(false);
  });
}
