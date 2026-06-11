import { escapeHtml } from './dom.js';
import { formatDateTime, formatNumber, t } from './i18n.js';

export function formatRegistrationTime(iso) {
  return formatDateTime(iso);
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
    return settings.allowInviteRegistration
      ? t('admin.registration.mode.publicInvite')
      : t('admin.registration.mode.public');
  }
  if (settings.allowInviteRegistration) return t('admin.registration.mode.inviteOnly');
  return t('admin.registration.mode.closed');
}

export function registrationInviteStatus(item = {}) {
  if (item?.disabledAt) return { className: 'err', label: t('admin.registration.invite.status.disabled') };
  if (item?.expired) return { className: 'err', label: t('admin.registration.invite.status.expired') };
  if (safeNumber(item?.remainingUses) <= 0) return { className: '', label: t('admin.registration.invite.status.exhausted') };
  return { className: 'ok', label: t('admin.registration.invite.status.available') };
}

export function formatRegistrationInviteExpiry(item = {}) {
  return item?.expiresAt ? formatRegistrationTime(item.expiresAt) : t('admin.registration.invite.expiry.never');
}

export function registrationRedemptionUserLabel(item = {}) {
  const name = item?.username || item?.email || item?.userId || t('admin.registration.unknownUser');
  const email = item?.email && item.email !== name ? ` · ${item.email}` : '';
  const deleted = item?.userDeleted ? ` · ${t('admin.registration.userDeleted')}` : '';
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
      ? `<span class="muted">${escapeHtml(t('admin.registration.invite.recordsCleaned'))}</span>`
      : `<span class="muted">${escapeHtml(t('admin.registration.invite.unused'))}</span>`;
  }
  const shown = rows.slice(0, 3).map((item) => `
    <div class="management-user-cell">
      <strong>${escapeHtml(item.username || item.email || item.userId || t('admin.registration.unknownUser'))}</strong>
      <small>${escapeHtml([item.email, formatRegistrationTime(item.usedAt)].filter(Boolean).join(' · '))}</small>
    </div>
  `).join('');
  const more = rows.length > 3
    ? `<small class="muted">${escapeHtml(t('admin.registration.invite.moreRedemptions', { count: formatNumber(rows.length - 3) }))}</small>`
    : '';
  return `${shown}${more}`;
}

export function registrationSummaryHtml(admin = null) {
  if (!admin) return `<span class="chip">${escapeHtml(t('admin.registration.summary.notLoaded'))}</span>`;
  const settings = registrationSettings(admin);
  const invites = Array.isArray(admin.invites) ? admin.invites : [];
  const redemptions = registrationRedemptions(admin);
  const active = invites.filter((item) => item.active).length;
  const disabled = invites.filter((item) => item.disabledAt).length;
  const totalRemaining = invites.reduce((sum, item) => sum + safeNumber(item.remainingUses), 0);
  return `
    <span class="chip ${settings.allowPublicRegistration || settings.allowInviteRegistration ? 'ok' : 'error'}">${escapeHtml(registrationModeLabel(settings))}</span>
    <span class="chip ${settings.allowInviteRegistration ? 'ok' : ''}">${escapeHtml(t('admin.registration.summary.inviteRegistration', { state: settings.allowInviteRegistration ? t('admin.registration.summary.allowed') : t('admin.registration.summary.closed') }))}</span>
    <span class="chip">${escapeHtml(t('admin.registration.summary.defaultUses', { count: formatNumber(safeNumber(settings.defaultInviteUses, 1) || 1) }))}</span>
    <span class="chip">${escapeHtml(t('admin.registration.summary.defaultTtl', { days: formatNumber(safeNumber(settings.defaultInviteTtlDays, 30) || 30) }))}</span>
    <span class="chip info">${escapeHtml(t('admin.registration.summary.availableInvites', { count: formatNumber(active), remaining: formatNumber(totalRemaining) }))}</span>
    <span class="chip">${escapeHtml(t('admin.registration.summary.disabledInvites', { count: formatNumber(disabled) }))}</span>
    <span class="chip">${escapeHtml(t('admin.registration.summary.redemptions', { count: formatNumber(redemptions.length) }))}</span>
    ${settings.source === 'env' ? `<span class="chip">${escapeHtml(t('admin.registration.summary.envSource'))}</span>` : ''}
  `;
}

export function registrationErrorHtml(message) {
  return `<span class="chip error">${escapeHtml(t('admin.registration.error.loadFailed', {
    error: message || t('common.unknownError')
  }))}</span>`;
}

export function registrationInvitesHtml(admin = null) {
  if (!admin) {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.registration.empty.loading'))}</p></div>`;
  }
  const invites = Array.isArray(admin.invites) ? admin.invites : [];
  if (!invites.length) {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.registration.empty.noInvites'))}</p></div>`;
  }
  const byCode = registrationRedemptionsByCode(registrationRedemptions(admin));
  return `
    <h3>${escapeHtml(t('admin.registration.invites.title'))}</h3>
    <table class="users-table management-table registration-invites-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('admin.registration.invites.header.code'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.usage'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.remaining'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.users'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.status'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.createdAt'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.expiresAt'))}</th>
          <th>${escapeHtml(t('admin.registration.invites.header.actions'))}</th>
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
            <td><span class="chip ${status.className}">${escapeHtml(status.label)}</span></td>
            <td>${escapeHtml(formatRegistrationTime(item.createdAt))}</td>
            <td>${escapeHtml(formatRegistrationInviteExpiry(item))}</td>
            <td>${canDisable ? `<button class="danger ghost small" type="button" data-disable-invite="${escapeHtml(code)}" data-invite-label="${escapeHtml(displayCode)}">${escapeHtml(t('admin.registration.invites.action.disable'))}</button>` : `<span class="muted">${escapeHtml(t('common.empty'))}</span>`}</td>
          </tr>`;
}

export function registrationRedemptionsHtml(admin = null) {
  if (!admin) return '';
  const redemptions = registrationRedemptions(admin);
  if (!redemptions.length) {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.registration.empty.noRedemptions'))}</p></div>`;
  }
  return `
    <h3>${escapeHtml(t('admin.registration.redemptions.title'))}</h3>
    <table class="users-table management-table registration-redemptions-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('admin.registration.invites.header.code'))}</th>
          <th>${escapeHtml(t('admin.registration.redemptions.header.user'))}</th>
          <th>${escapeHtml(t('admin.registration.redemptions.header.userId'))}</th>
          <th>${escapeHtml(t('admin.registration.redemptions.header.usedAt'))}</th>
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
