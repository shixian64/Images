import { escapeHtml } from './dom.js';

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
      <span class="user-name">${escapeHtml(user.username || user.email || '用户')}</span>
      <span class="user-caret" aria-hidden="true">▾</span>
    </button>
    <div class="user-menu-dropdown" role="menu" hidden>
      <button role="menuitem" data-action="profile" type="button">个人资料</button>
      <button role="menuitem" data-action="password" type="button">修改密码</button>
      <button role="menuitem" data-action="usage" type="button">我的用量</button>
      ${user.role === 'admin' ? `
        <div class="user-menu-divider" role="separator"></div>
        <button role="menuitem" data-action="admin" type="button">管理后台</button>
      ` : ''}
      <button role="menuitem" data-action="logout" type="button">退出登录</button>
    </div>
  `;
}

export function profileDialogHtml() {
  return `
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
}

export function passwordDialogHtml() {
  return `
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
    return `<div class="usage-row"><span>${safeLabel}</span><strong>${safeUsed} / 不限</strong></div>`;
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
  if (!safeLimitMb) {
    return `<div class="usage-row"><span>存储</span><strong>${display} / 不限</strong></div>`;
  }
  const p = Math.min(100, Math.round(usedMb / safeLimitMb * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `
    <div class="usage-row">
      <span>存储</span>
      <strong>${display} / ${safeLimitMb} MB (${p}%)</strong>
    </div>
    <progress class="quota-progress ${cls}" value="${p}" max="100" aria-label="存储"></progress>
  `;
}

export function usageLoadingHtml() {
  return '<div class="empty-state"><p>正在加载…</p></div>';
}

export function usageErrorHtml(message) {
  return `<div class="error-banner">${escapeHtml(message || '加载失败')}</div>`;
}

export function usageDrawerHtml({ quota = {}, usage = {} } = {}) {
  const today = usage.today || {};
  const month = usage.month || {};
  const storage = usage.storage || {};

  return `
      <div class="user-detail">
        <section class="user-detail-block">
          <h3>今日</h3>
          ${usageProgressHtml(today.calls || 0, quota.daily_limit, '额度调用次数（系统默认接口）')}
          <p class="hint">提示词优化 ${countValue(today.promptOptimizations)} 次 · 失败 ${countValue(today.fails)} 次 · 入库 ${countValue(today.images)} 张</p>
        </section>
        <section class="user-detail-block">
          <h3>本月</h3>
          ${usageProgressHtml(month.calls || 0, quota.monthly_limit, '额度调用次数（系统默认接口）')}
          <p class="hint">提示词优化 ${countValue(month.promptOptimizations)} 次 · 失败 ${countValue(month.fails)} 次 · 入库 ${countValue(month.images)} 张</p>
        </section>
        <section class="user-detail-block">
          <h3>存储</h3>
          ${usageStorageHtml(storage.bytes || 0, quota.storage_limit_mb)}
          <p class="hint">本地图库共 ${countValue(storage.images)} 张</p>
        </section>
        <p class="hint">额度由管理员维护；日/月次数统计系统默认接口调用（含生图与提示词优化），存储与并发对系统默认和个人自定义接口都生效。</p>
      </div>
    `;
}

