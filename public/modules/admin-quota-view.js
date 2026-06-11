import { escapeHtml } from './dom.js';
import { formatNumber, t } from './i18n.js';

export function quotaStatusLabel(status) {
  return status === 'active' ? t('admin.quota.status.active') : t('admin.quota.status.disabled');
}

export function formatQuotaLimit(value) {
  if (value === null || value === undefined) return t('admin.quota.limit.unlimited');
  return String(value);
}

export function formatQuotaStorageMb(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '0 MB';
  const mb = value / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function quotaPct(used, limit) {
  if (!limit) return null;
  const limitValue = Number(limit) || 0;
  if (!limitValue) return null;
  return Math.min(100, Math.round((Number(used) || 0) / limitValue * 100));
}

function safeMetricNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function quotaMiniBar(used, limit) {
  const percent = quotaPct(used, limit);
  if (percent === null) return '<span class="quota-mini quota-mini-unlim" aria-hidden="true"></span>';
  const cls = percent >= 90 ? 'high' : percent >= 70 ? 'mid' : '';
  return `<progress class="quota-mini ${cls}" value="${percent}" max="100" aria-hidden="true"></progress>`;
}

export function quotaStorageMiniBar(usedBytes, limitMb) {
  if (!limitMb) return '<span class="quota-mini quota-mini-unlim" aria-hidden="true"></span>';
  const limitValue = Number(limitMb) || 0;
  if (!limitValue) return '<span class="quota-mini quota-mini-unlim" aria-hidden="true"></span>';
  const usedMb = (Number(usedBytes) || 0) / (1024 * 1024);
  const percent = Math.min(100, Math.round(usedMb / limitValue * 100));
  const cls = percent >= 90 ? 'high' : percent >= 70 ? 'mid' : '';
  return `<progress class="quota-mini ${cls}" value="${percent}" max="100" aria-hidden="true"></progress>`;
}

function defaultQuotaCardHtml(defaults = {}, key, label, suffix) {
  const value = defaults[key];
  return `
      <div class="stat-card quota-default-card">
        <span>${label}</span>
        <div class="quota-default-input">
          <input type="number" min="0" step="1"
            data-default-key="${key}"
            value="${value === null || value === undefined ? '' : escapeHtml(value)}"
            placeholder="${escapeHtml(t('admin.quota.limit.unlimited'))}" />
          <em>${suffix}</em>
        </div>
      </div>
    `;
}

export function quotaDefaultsCardHtml(defaults = null) {
  if (!defaults) return '';
  return `
    ${defaultQuotaCardHtml(defaults, 'daily_limit', t('admin.quota.defaults.daily'), t('admin.quota.suffix.perDay'))}
    ${defaultQuotaCardHtml(defaults, 'monthly_limit', t('admin.quota.defaults.monthly'), t('admin.quota.suffix.perMonth'))}
    ${defaultQuotaCardHtml(defaults, 'storage_limit_mb', t('admin.quota.defaults.storage'), 'MB')}
    ${defaultQuotaCardHtml(defaults, 'concurrent_limit', t('admin.quota.defaults.concurrent'), t('admin.quota.suffix.calls'))}
  `;
}

export function quotaErrorHtml(message = t('admin.quota.error.loadFailed')) {
  return `<div class="error-banner">${escapeHtml(message || t('admin.quota.error.loadFailed'))}</div>`;
}

export function quotaRowMenuHtml() {
  return `
    <button data-act="edit-all">${escapeHtml(t('admin.quota.menu.editAll'))}</button>
    <button data-act="reset-today">${escapeHtml(t('admin.quota.menu.resetToday'))}</button>
    <button data-act="reset-month">${escapeHtml(t('admin.quota.menu.resetMonth'))}</button>
    <button data-act="restore" class="danger">${escapeHtml(t('admin.quota.menu.restore'))}</button>
  `;
}

export function inlineQuotaCellHtml(userId, field, value) {
  const overridden = value !== null && value !== undefined;
  return `
    <td class="quota-inline-cell ${overridden ? 'overridden' : ''}">
      <input type="number" min="0" step="1"
        class="quota-inline-input ${overridden ? 'overridden' : ''}"
        data-quota-field="${escapeHtml(field)}"
        data-user-id="${escapeHtml(userId)}"
        value="${overridden ? escapeHtml(value) : ''}"
        placeholder="${escapeHtml(t('admin.quota.placeholder.inherit'))}" />
    </td>
  `;
}

export function quotaTableView(items = [], { selectedIds = new Set() } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (!rows.length) {
    return {
      empty: true,
      html: `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(t('admin.quota.empty'))}</p></div>`
    };
  }

  return {
    empty: false,
    html: `
    <table class="users-table management-table quota-table">
      <thead>
        <tr>
          <th class="quota-check"><input type="checkbox" data-quota-bulk-toggle aria-label="${escapeHtml(t('admin.quota.selectAll'))}" /></th>
          <th>${escapeHtml(t('admin.quota.header.user'))}</th>
          <th>${escapeHtml(t('admin.quota.header.status'))}</th>
          <th>${escapeHtml(t('admin.quota.header.daily'))}</th>
          <th>${escapeHtml(t('admin.quota.header.monthly'))}</th>
          <th>${escapeHtml(t('admin.quota.header.storage'))}</th>
          <th>${escapeHtml(t('admin.quota.header.concurrent'))}</th>
          <th>${escapeHtml(t('admin.quota.header.usage'))}</th>
          <th aria-label="${escapeHtml(t('admin.quota.header.actions'))}"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => quotaTableRowHtml(row, { selectedIds: selected })).join('')}
      </tbody>
    </table>
  `
  };
}

export function quotaTableRowHtml(row = {}, { selectedIds = new Set() } = {}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const user = row.user || {};
  const quota = row.quota || {};
  const raw = quota.raw || {};
  const usage = row.usage || {};
  const today = usage.today || {};
  const month = usage.month || {};
  const storage = usage.storage || {};
  const todayCalls = safeMetricNumber(today.calls);
  const monthCalls = safeMetricNumber(month.calls);
  const todayPromptOptimizations = safeMetricNumber(today.promptOptimizations);
  const monthPromptOptimizations = safeMetricNumber(month.promptOptimizations);
  const todayFails = safeMetricNumber(today.fails);
  const monthFails = safeMetricNumber(month.fails);
  const id = user.id || '';
  const isChecked = selected.has(id);
  const failChip = (todayFails || monthFails)
    ? `<small class="quota-fail-chip" title="${escapeHtml(t('admin.quota.usage.failTitle', { today: formatNumber(todayFails), month: formatNumber(monthFails) }))}">${escapeHtml(t('admin.quota.usage.failChip', { today: formatNumber(todayFails), month: formatNumber(monthFails) }))}</small>`
    : '';
  const promptOptimizeChip = (todayPromptOptimizations || monthPromptOptimizations)
    ? `<small class="quota-extra-chip" title="${escapeHtml(t('admin.quota.usage.promptTitle', { today: formatNumber(todayPromptOptimizations), month: formatNumber(monthPromptOptimizations) }))}">${escapeHtml(t('admin.quota.usage.promptChip', { today: formatNumber(todayPromptOptimizations), month: formatNumber(monthPromptOptimizations) }))}</small>`
    : '';
  return `
            <tr data-quota-user-id="${escapeHtml(id)}" class="${isChecked ? 'selected' : ''}">
              <td class="quota-check">
                <input type="checkbox" data-quota-row-check ${isChecked ? 'checked' : ''} aria-label="${escapeHtml(t('admin.quota.selectUser', { name: user.username || '' }))}" />
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || '-')}</strong>
                  <small>${escapeHtml(user.email || '-')}</small>
                </div>
              </td>
              <td>
                <span class="chip ${user.status === 'active' ? 'ok' : 'err'}">${quotaStatusLabel(user.status)}</span>
                ${user.role === 'admin' ? `<span class="chip info">${escapeHtml(t('admin.quota.role.admin'))}</span>` : ''}
              </td>
              ${inlineQuotaCellHtml(id, 'daily_limit', raw.daily_limit ?? null)}
              ${inlineQuotaCellHtml(id, 'monthly_limit', raw.monthly_limit ?? null)}
              ${inlineQuotaCellHtml(id, 'storage_limit_mb', raw.storage_limit_mb ?? null)}
              ${inlineQuotaCellHtml(id, 'concurrent_limit', raw.concurrent_limit ?? null)}
              <td class="quota-usage-summary">
                <div class="quota-usage-line">
                  <span>${escapeHtml(t('admin.quota.usage.today'))}</span>${quotaMiniBar(todayCalls, quota.daily_limit)}
                  <small title="${escapeHtml(t('admin.quota.usage.todayTitle'))}">${escapeHtml(formatNumber(todayCalls))}/${escapeHtml(formatQuotaLimit(quota.daily_limit))}</small>
                </div>
                <div class="quota-usage-line">
                  <span>${escapeHtml(t('admin.quota.usage.month'))}</span>${quotaMiniBar(monthCalls, quota.monthly_limit)}
                  <small title="${escapeHtml(t('admin.quota.usage.monthTitle'))}">${escapeHtml(formatNumber(monthCalls))}/${escapeHtml(formatQuotaLimit(quota.monthly_limit))}</small>
                </div>
                <div class="quota-usage-line">
                  <span>${escapeHtml(t('admin.quota.usage.storage'))}</span>${quotaStorageMiniBar(storage.bytes || 0, quota.storage_limit_mb)}
                  <small>${escapeHtml(formatQuotaStorageMb(storage.bytes || 0))}${quota.storage_limit_mb ? ` / ${escapeHtml(quota.storage_limit_mb)}MB` : ''}</small>
                </div>
                ${promptOptimizeChip}
                ${failChip}
              </td>
              <td class="quota-row-action">
                <button class="ghost small icon-only" data-quota-act="menu" aria-label="${escapeHtml(t('admin.quota.moreActions'))}" title="${escapeHtml(t('admin.quota.moreActions'))}">⋯</button>
              </td>
            </tr>
          `;
}
