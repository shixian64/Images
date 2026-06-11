import { escapeHtml } from './dom.js';

export function formatRegistrationTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function registrationSettings(admin = null) {
  return admin?.settings || {};
}

export function registrationRedemptions(admin = null) {
  return Array.isArray(admin?.redemptions) ? admin.redemptions : [];
}

export function registrationModeLabel(settings = {}) {
  if (settings.allowPublicRegistration) {
    return settings.allowInviteRegistration ? '开放注册 + 邀请码注册' : '开放注册';
  }
  if (settings.allowInviteRegistration) return '仅邀请码注册';
  return '关闭注册';
}

export function registrationInviteStatus(item = {}) {
  if (item?.disabledAt) return { className: 'err', label: '已停用' };
  if (item?.expired) return { className: 'err', label: '已过期' };
  if (safeNumber(item?.remainingUses) <= 0) return { className: '', label: '已用完' };
  return { className: 'ok', label: '可用' };
}

export function formatRegistrationInviteExpiry(item = {}) {
  return item?.expiresAt ? formatRegistrationTime(item.expiresAt) : '永不过期';
}

export function registrationRedemptionUserLabel(item = {}) {
  const name = item?.username || item?.email || item?.userId || '未知用户';
  const email = item?.email && item.email !== name ? ` · ${item.email}` : '';
  const deleted = item?.userDeleted ? ' · 用户已删除' : '';
  return `${name}${email}${deleted}`;
}

export function registrationRedemptionsByCode(records = []) {
  const map = new Map();
  for (const item of Array.isArray(records) ? records : []) {
    const code = String(item?.code || '').trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(item);
  }
  return map;
}

export function registrationInviteUsersHtml(code, records = [], usedCount = 0) {
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) {
    return safeNumber(usedCount) > 0
      ? '<span class="muted">兑换记录已清理</span>'
      : '<span class="muted">未使用</span>';
  }
  const shown = rows.slice(0, 3).map((item) => `
    <div class="management-user-cell">
      <strong>${escapeHtml(item.username || item.email || item.userId || '未知用户')}</strong>
      <small>${escapeHtml([item.email, formatRegistrationTime(item.usedAt)].filter(Boolean).join(' · '))}</small>
    </div>
  `).join('');
  const more = rows.length > 3 ? `<small class="muted">另有 ${rows.length - 3} 条兑换记录</small>` : '';
  return `${shown}${more}`;
}

export function registrationSummaryHtml(admin = null) {
  if (!admin) return '<span class="chip">尚未加载</span>';
  const settings = registrationSettings(admin);
  const invites = Array.isArray(admin.invites) ? admin.invites : [];
  const redemptions = registrationRedemptions(admin);
  const active = invites.filter((item) => item.active).length;
  const disabled = invites.filter((item) => item.disabledAt).length;
  const totalRemaining = invites.reduce((sum, item) => sum + safeNumber(item.remainingUses), 0);
  return `
    <span class="chip ${settings.allowPublicRegistration || settings.allowInviteRegistration ? 'ok' : 'error'}">${escapeHtml(registrationModeLabel(settings))}</span>
    <span class="chip ${settings.allowInviteRegistration ? 'ok' : ''}">邀请码注册：${settings.allowInviteRegistration ? '允许' : '关闭'}</span>
    <span class="chip">默认次数：${safeNumber(settings.defaultInviteUses, 1) || 1}</span>
    <span class="chip">默认有效期：${safeNumber(settings.defaultInviteTtlDays, 30) || 30} 天</span>
    <span class="chip info">可用邀请码：${active} 个 / 剩余 ${totalRemaining} 次</span>
    <span class="chip">已停用：${disabled} 个</span>
    <span class="chip">兑换记录：${redemptions.length} 条</span>
    ${settings.source === 'env' ? '<span class="chip">当前来自环境变量；保存后改由 UI 配置接管</span>' : ''}
  `;
}

export function registrationInvitesHtml(admin = null) {
  if (!admin) {
    return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>正在等待注册配置加载。</p></div>';
  }
  const invites = Array.isArray(admin.invites) ? admin.invites : [];
  if (!invites.length) {
    return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>还没有 UI 生成的邀请码。可在上方批量生成。</p></div>';
  }
  const byCode = registrationRedemptionsByCode(registrationRedemptions(admin));
  return `
    <h3>邀请码 / 兑换码</h3>
    <table class="users-table management-table registration-invites-table">
      <thead>
        <tr>
          <th>邀请码</th>
          <th>已用 / 总次数</th>
          <th>剩余</th>
          <th>使用用户</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>过期时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${invites.map((item) => registrationInviteRowHtml(item, byCode)).join('')}
      </tbody>
    </table>
  `;
}

export function registrationInviteRowHtml(item = {}, redemptionsByCode = new Map()) {
  const status = registrationInviteStatus(item);
  const code = item.code || '';
  const displayCode = item.displayCode || code;
  const canDisable = !item.disabledAt;
  return `<tr>
            <td><code>${escapeHtml(displayCode || '-')}</code></td>
            <td>${safeNumber(item.usedCount)} / ${safeNumber(item.maxUses, 1) || 1}</td>
            <td>${safeNumber(item.remainingUses)}</td>
            <td>${registrationInviteUsersHtml(code, redemptionsByCode.get(code) || [], item.usedCount)}</td>
            <td><span class="chip ${status.className}">${status.label}</span></td>
            <td>${escapeHtml(formatRegistrationTime(item.createdAt))}</td>
            <td>${escapeHtml(formatRegistrationInviteExpiry(item))}</td>
            <td>${canDisable ? `<button class="danger ghost small" type="button" data-disable-invite="${escapeHtml(code)}" data-invite-label="${escapeHtml(displayCode)}">停用</button>` : '<span class="muted">-</span>'}</td>
          </tr>`;
}

export function registrationRedemptionsHtml(admin = null) {
  if (!admin) return '';
  const redemptions = registrationRedemptions(admin);
  if (!redemptions.length) {
    return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无兑换记录。</p></div>';
  }
  return `
    <h3>兑换记录</h3>
    <table class="users-table management-table registration-redemptions-table">
      <thead>
        <tr>
          <th>邀请码</th>
          <th>注册用户</th>
          <th>用户 ID</th>
          <th>兑换时间</th>
        </tr>
      </thead>
      <tbody>
        ${redemptions.map((item) => registrationRedemptionRowHtml(item)).join('')}
      </tbody>
    </table>
  `;
}

export function registrationRedemptionRowHtml(item = {}) {
  return `<tr>
          <td><code>${escapeHtml(item.displayCode || item.code || '-')}</code></td>
          <td>${escapeHtml(registrationRedemptionUserLabel(item))}</td>
          <td><code>${escapeHtml(item.userId || '-')}</code></td>
          <td>${escapeHtml(formatRegistrationTime(item.usedAt))}</td>
        </tr>`;
}
