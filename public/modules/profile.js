// 个人资料下拉菜单 + 修改资料/修改密码对话框 + 我的用量。
// 注意：此文件的"profile"指"用户个人资料"，与 profiles.js（接口配置）同名不同义。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch, logout, setCurrentUser } from './auth.js';
import * as drawer from './drawer.js';
import { switchTab } from './nav.js';

let menuMounted = false;
let profileDialog = null;
let passwordDialog = null;
let currentUser = null;
let passwordResetNoticeShown = false;

function avatarInitial(user) {
  const s = (user?.username || user?.email || '?').trim();
  return s.slice(0, 1).toUpperCase();
}

function displayAvatarUrl(user) {
  const value = String(user?.avatar_url || user?.avatarUrl || '').trim();
  return /^https:\/\//i.test(value) ? value : '';
}

function renderMenu() {
  const host = $('userMenu');
  if (!host || !currentUser) return;
  const avatarUrl = displayAvatarUrl(currentUser);
  host.innerHTML = `
    <button class="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
      ${avatarUrl
        ? `<img class="user-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="user-avatar user-avatar-text">${escapeHtml(avatarInitial(currentUser))}</span>`}
      <span class="user-name">${escapeHtml(currentUser.username || currentUser.email || '用户')}</span>
      <span class="user-caret" aria-hidden="true">▾</span>
    </button>
    <div class="user-menu-dropdown" role="menu" hidden>
      <button role="menuitem" data-action="profile" type="button">个人资料</button>
      <button role="menuitem" data-action="password" type="button">修改密码</button>
      <button role="menuitem" data-action="usage" type="button">我的用量</button>
      ${currentUser.role === 'admin' ? `
        <div class="user-menu-divider" role="separator"></div>
        <button role="menuitem" data-action="admin" type="button">管理后台</button>
      ` : ''}
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
      <label class="field"><span>头像 URL（可选，仅 HTTPS）</span>
        <input name="avatarUrl" type="url" placeholder="https://example.com/avatar.png" />
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
  form.avatarUrl.value = displayAvatarUrl(currentUser);
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
      <p class="hint" data-reset-required hidden>管理员已重置你的密码。继续使用前，请先设置一个新的个人密码。</p>
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
        <button value="cancel" class="ghost" type="submit" data-cancel>取消</button>
        <button value="confirm" class="primary" type="submit" data-confirm>提交</button>
      </div>
    </form>
  `;
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

function fmtUsageBytes(bytes) {
  const v = Number(bytes) || 0;
  if (!v) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = v;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i += 1; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function progressBar(used, limit, label) {
  if (!limit) {
    return `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${used} / 不限</strong></div>`;
  }
  const p = Math.min(100, Math.round((Number(used) || 0) / limit * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="usage-row">
      <span>${escapeHtml(label)}</span>
      <strong>${used} / ${limit} (${p}%)</strong>
    </div>
    <progress class="quota-progress ${cls}" value="${p}" max="100" aria-label="${escapeHtml(label)}"></progress>
  `;
}

function storageBar(usedBytes, limitMb) {
  const usedMb = (Number(usedBytes) || 0) / (1024 * 1024);
  const display = fmtUsageBytes(usedBytes);
  if (!limitMb) {
    return `<div class="usage-row"><span>存储</span><strong>${display} / 不限</strong></div>`;
  }
  const p = Math.min(100, Math.round(usedMb / limitMb * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="usage-row">
      <span>存储</span>
      <strong>${display} / ${limitMb} MB (${p}%)</strong>
    </div>
    <progress class="quota-progress ${cls}" value="${p}" max="100" aria-label="存储"></progress>
  `;
}

async function openUsageDrawer() {
  drawer.open({
    eyebrow: '我的用量',
    title: '使用情况',
    body: '<div class="empty-state"><p>正在加载…</p></div>',
    unsafeHtml: true
  });
  try {
    const resp = await apiFetch('/api/quota/me');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const q = data.quota || {};
    const u = data.usage || {};
    const today = u.today || {};
    const month = u.month || {};
    const storage = u.storage || {};

    const html = `
      <div class="user-detail">
        <section class="user-detail-block">
          <h3>今日</h3>
          ${progressBar(today.calls || 0, q.daily_limit, '额度调用次数（系统默认接口）')}
          <p class="hint">提示词优化 ${today.promptOptimizations || 0} 次 · 失败 ${today.fails || 0} 次 · 入库 ${today.images || 0} 张</p>
        </section>
        <section class="user-detail-block">
          <h3>本月</h3>
          ${progressBar(month.calls || 0, q.monthly_limit, '额度调用次数（系统默认接口）')}
          <p class="hint">提示词优化 ${month.promptOptimizations || 0} 次 · 失败 ${month.fails || 0} 次 · 入库 ${month.images || 0} 张</p>
        </section>
        <section class="user-detail-block">
          <h3>存储</h3>
          ${storageBar(storage.bytes || 0, q.storage_limit_mb)}
          <p class="hint">本地图库共 ${storage.images || 0} 张</p>
        </section>
        <p class="hint">额度由管理员维护；日/月次数统计系统默认接口调用（含生图与提示词优化），存储与并发对系统默认和个人自定义接口都生效。</p>
      </div>
    `;
    drawer.update({ body: html, unsafeHtml: true });
  } catch (err) {
    drawer.update({ body: `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`, unsafeHtml: true });
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
