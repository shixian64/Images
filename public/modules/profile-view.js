import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

export function avatarInitial(user) {
  const s = (user?.username || user?.email || '?').trim();
  return s.slice(0, 1).toUpperCase();
}

export function displayAvatarUrl(user) {
  const value = String(user?.avatar_url || user?.avatarUrl || '').trim();
  return /^https:\/\//i.test(value) ? value : '';
}

export function profileMenuHtml(user = {}) {
  const avatarUrl = displayAvatarUrl(user);
  return `
    <button class="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
      ${avatarUrl
        ? `<img class="user-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="user-avatar user-avatar-text">${escapeHtml(avatarInitial(user))}</span>`}
      <span class="user-name">${escapeHtml(user.username || user.email || t('profile.menu.userFallback'))}</span>
      <span class="user-caret" aria-hidden="true">▾</span>
    </button>
    <div class="user-menu-dropdown" role="menu" hidden>
      <button role="menuitem" data-action="profile" type="button">${escapeHtml(t('profile.menu.profile'))}</button>
      <button role="menuitem" data-action="password" type="button">${escapeHtml(t('profile.menu.password'))}</button>
      <button role="menuitem" data-action="usage" type="button">${escapeHtml(t('profile.menu.usage'))}</button>
      ${user.role === 'admin' ? `
        <div class="user-menu-divider" role="separator"></div>
        <button role="menuitem" data-action="admin" type="button">${escapeHtml(t('profile.menu.admin'))}</button>
      ` : ''}
      <button role="menuitem" data-action="logout" type="button">${escapeHtml(t('profile.menu.logout'))}</button>
    </div>
  `;
}

export function profileDialogHtml() {
  return `
    <form method="dialog" class="app-dialog-form" data-profile-form>
      <h3>${escapeHtml(t('profile.dialog.profile.title'))}</h3>
      <div class="error-banner" data-err hidden></div>
      <label class="field"><span>${escapeHtml(t('profile.dialog.username'))}</span>
        <input name="username" required pattern="[a-zA-Z0-9_\\-]{3,32}" />
      </label>
      <label class="field"><span>${escapeHtml(t('profile.dialog.email'))}</span>
        <input name="email" type="email" required />
      </label>
      <label class="field"><span>${escapeHtml(t('profile.dialog.avatarUrl'))}</span>
        <input name="avatarUrl" type="url" placeholder="https://example.com/avatar.png" />
      </label>
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit">${escapeHtml(t('profile.dialog.cancel'))}</button>
        <button value="confirm" class="primary" type="submit" data-confirm>${escapeHtml(t('profile.dialog.save'))}</button>
      </div>
    </form>
  `;
}

export function passwordDialogHtml() {
  return `
    <form method="dialog" class="app-dialog-form" data-password-form>
      <h3>${escapeHtml(t('profile.password.title'))}</h3>
      <p class="hint" data-reset-required hidden>${escapeHtml(t('profile.password.resetRequired'))}</p>
      <div class="error-banner" data-err hidden></div>
      <label class="field"><span>${escapeHtml(t('profile.password.current'))}</span>
        <input name="oldPassword" type="password" required />
      </label>
      <label class="field"><span>${escapeHtml(t('profile.password.new'))}</span>
        <input name="newPassword" type="password" required minlength="8" />
      </label>
      <label class="field"><span>${escapeHtml(t('profile.password.confirm'))}</span>
        <input name="confirmPassword" type="password" required minlength="8" />
      </label>
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit" data-cancel>${escapeHtml(t('profile.dialog.cancel'))}</button>
        <button value="confirm" class="primary" type="submit" data-confirm>${escapeHtml(t('profile.dialog.submit'))}</button>
      </div>
    </form>
  `;
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function countValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function formatUsageBytes(bytes) {
  const v = numberValue(bytes);
  if (!v) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = v;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i += 1; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function usageProgressHtml(used, limit, label) {
  const safeUsed = countValue(used);
  const safeLimit = countValue(limit);
  const safeLabel = escapeHtml(label);
  if (!safeLimit) {
    return `<div class="usage-row"><span>${safeLabel}</span><strong>${safeUsed} / ${escapeHtml(t('profile.usage.unlimited'))}</strong></div>`;
  }
  const p = Math.min(100, Math.round(safeUsed / safeLimit * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="usage-row">
      <span>${safeLabel}</span>
      <strong>${safeUsed} / ${safeLimit} (${p}%)</strong>
    </div>
    <progress class="quota-progress ${cls}" value="${p}" max="100" aria-label="${safeLabel}"></progress>
  `;
}

export function usageStorageHtml(usedBytes, limitMb) {
  const safeUsedBytes = numberValue(usedBytes);
  const safeLimitMb = countValue(limitMb);
  const usedMb = safeUsedBytes / (1024 * 1024);
  const display = formatUsageBytes(safeUsedBytes);
  const label = t('profile.usage.storage');
  if (!safeLimitMb) {
    return `<div class="usage-row"><span>${escapeHtml(label)}</span><strong>${display} / ${escapeHtml(t('profile.usage.unlimited'))}</strong></div>`;
  }
  const p = Math.min(100, Math.round(usedMb / safeLimitMb * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="usage-row">
      <span>${escapeHtml(label)}</span>
      <strong>${display} / ${safeLimitMb} MB (${p}%)</strong>
    </div>
    <progress class="quota-progress ${cls}" value="${p}" max="100" aria-label="${escapeHtml(label)}"></progress>
  `;
}

export function usageLoadingHtml() {
  return `<div class="empty-state"><p>${escapeHtml(t('profile.usage.loading'))}</p></div>`;
}

export function usageErrorHtml(message) {
  return `<div class="error-banner">${escapeHtml(message || t('common.loadFailed'))}</div>`;
}

export function usageDrawerHtml({ quota = {}, usage = {} } = {}) {
  const today = usage.today || {};
  const month = usage.month || {};
  const storage = usage.storage || {};

  return `
      <div class="user-detail">
        <section class="user-detail-block">
          <h3>${escapeHtml(t('profile.usage.today'))}</h3>
          ${usageProgressHtml(today.calls || 0, quota.daily_limit, t('profile.usage.callQuota'))}
          <p class="hint">${escapeHtml(t('profile.usage.periodHint', { promptOptimizations: countValue(today.promptOptimizations), fails: countValue(today.fails), images: countValue(today.images) }))}</p>
        </section>
        <section class="user-detail-block">
          <h3>${escapeHtml(t('profile.usage.month'))}</h3>
          ${usageProgressHtml(month.calls || 0, quota.monthly_limit, t('profile.usage.callQuota'))}
          <p class="hint">${escapeHtml(t('profile.usage.periodHint', { promptOptimizations: countValue(month.promptOptimizations), fails: countValue(month.fails), images: countValue(month.images) }))}</p>
        </section>
        <section class="user-detail-block">
          <h3>${escapeHtml(t('profile.usage.storage'))}</h3>
          ${usageStorageHtml(storage.bytes || 0, quota.storage_limit_mb)}
          <p class="hint">${escapeHtml(t('profile.usage.storageHint', { images: countValue(storage.images) }))}</p>
        </section>
        <p class="hint">${escapeHtml(t('profile.usage.footer'))}</p>
      </div>
    `;
}
