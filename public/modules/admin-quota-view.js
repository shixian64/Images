import { escapeHtml } from './dom.js';

export function quotaStatusLabel(status) {
  return status === 'active' ? '启用' : '停用';
}

export function formatQuotaLimit(value) {
  if (value === null || value === undefined) return '不限';
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
            placeholder="不限" />
          <em>${suffix}</em>
        </div>
      </div>
    `;
}

export function quotaDefaultsCardHtml(defaults = null) {
  if (!defaults) return '';
  return `
    ${defaultQuotaCardHtml(defaults, 'daily_limit', '系统默认每日调用上限', '次/天')}
    ${defaultQuotaCardHtml(defaults, 'monthly_limit', '系统默认每月调用上限', '次/月')}
    ${defaultQuotaCardHtml(defaults, 'storage_limit_mb', '存储上限', 'MB')}
    ${defaultQuotaCardHtml(defaults, 'concurrent_limit', '并发上限', '次')}
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
        placeholder="跟随" />
    </td>
  `;
}

export function quotaTableView(items = [], { selectedIds = new Set() } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (!rows.length) {
    return {
      empty: true,
      html: '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无数据</p></div>'
    };
  }

  return {
    empty: false,
    html: `
    <table class="users-table management-table quota-table">
      <thead>
        <tr>
          <th class="quota-check"><input type="checkbox" data-quota-bulk-toggle aria-label="全选" /></th>
          <th>用户</th>
          <th>状态</th>
          <th>日额度</th>
          <th>月额度</th>
          <th>存储 (MB)</th>
          <th>并发</th>
          <th>用量（今 / 月 / 存储）</th>
          <th aria-label="操作"></th>
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
  const promptOptimizeChip = (todayPromptOptimizations || monthPromptOptimizations)
    ? `<small class="quota-extra-chip" title="提示词优化今日 ${todayPromptOptimizations} / 本月 ${monthPromptOptimizations}">优化 ${todayPromptOptimizations}/${monthPromptOptimizations}</small>`
    : '';
  const failChip = (todayFails || monthFails)
    ? `<small class="quota-fail-chip" title="今日失败 ${todayFails} / 本月失败 ${monthFails}">失败 ${todayFails}/${monthFails}</small>`
    : '';
  return `
            <tr data-quota-user-id="${escapeHtml(id)}" class="${isChecked ? 'selected' : ''}">
              <td class="quota-check">
                <input type="checkbox" data-quota-row-check ${isChecked ? 'checked' : ''} aria-label="选中 ${escapeHtml(user.username || '')}" />
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(user.username || '-')}</strong>
                  <small>${escapeHtml(user.email || '-')}</small>
                </div>
              </td>
              <td>
                <span class="chip ${user.status === 'active' ? 'ok' : 'err'}">${quotaStatusLabel(user.status)}</span>
                ${user.role === 'admin' ? '<span class="chip info">管理员</span>' : ''}
              </td>
              ${inlineQuotaCellHtml(id, 'daily_limit', raw.daily_limit ?? null)}
              ${inlineQuotaCellHtml(id, 'monthly_limit', raw.monthly_limit ?? null)}
              ${inlineQuotaCellHtml(id, 'storage_limit_mb', raw.storage_limit_mb ?? null)}
              ${inlineQuotaCellHtml(id, 'concurrent_limit', raw.concurrent_limit ?? null)}
              <td class="quota-usage-summary">
                <div class="quota-usage-line">
                  <span>今</span>${quotaMiniBar(todayCalls, quota.daily_limit)}
                  <small title="今日系统默认接口调用总数（含生图与提示词优化）">${todayCalls}/${escapeHtml(formatQuotaLimit(quota.daily_limit))}</small>
                </div>
                <div class="quota-usage-line">
                  <span>月</span>${quotaMiniBar(monthCalls, quota.monthly_limit)}
                  <small title="本月系统默认接口调用总数（含生图与提示词优化）">${monthCalls}/${escapeHtml(formatQuotaLimit(quota.monthly_limit))}</small>
                </div>
                <div class="quota-usage-line">
                  <span>存</span>${quotaStorageMiniBar(storage.bytes || 0, quota.storage_limit_mb)}
                  <small>${escapeHtml(formatQuotaStorageMb(storage.bytes || 0))}${quota.storage_limit_mb ? ` / ${escapeHtml(quota.storage_limit_mb)}MB` : ''}</small>
                </div>
                ${promptOptimizeChip}
                ${failChip}
              </td>
              <td class="quota-row-action">
                <button class="ghost small icon-only" data-quota-act="menu" aria-label="更多操作" title="更多操作">⋯</button>
              </td>
            </tr>
          `;
}
