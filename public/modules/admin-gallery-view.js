import { escapeHtml } from './dom.js';
import { formatDateTime, t } from './i18n.js';

function galleryText(key, params = {}) {
  return t(`admin.gallery.${key}`, params);
}

export function formatAdminGalleryTime(iso) {
  return formatDateTime(iso);
}

export function formatAdminGalleryBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function adminGalleryShortId(id) {
  const text = String(id || '');
  return text ? text.slice(0, 8) : '-';
}

export function adminGalleryUserLabel(userId, users = []) {
  const user = users.find((item) => item?.id === userId);
  if (!user) return adminGalleryShortId(userId);
  return user.username || user.email || adminGalleryShortId(userId);
}

export function adminGalleryKnownUsers(users = []) {
  return [...(Array.isArray(users) ? users : [])].sort((a, b) => {
    const left = String(a?.username || a?.email || a?.id || '');
    const right = String(b?.username || b?.email || b?.id || '');
    return left.localeCompare(right, 'zh-CN');
  });
}

function safeCount(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function adminGalleryStatsHtml(stats = null, { users = [] } = {}) {
  if (!stats) return '';
  const topUsers = (Array.isArray(stats.topUsers) ? stats.topUsers : []).slice(0, 3);
  const topModels = (Array.isArray(stats.topModels) ? stats.topModels : []).slice(0, 3);
  return `
    <div class="stat-card"><span>${escapeHtml(galleryText('stats.total'))}</span><strong>${safeCount(stats.total)}</strong></div>
    <div class="stat-card"><span>${escapeHtml(galleryText('stats.savedToday'))}</span><strong>${safeCount(stats.savedToday)}</strong></div>
    <div class="stat-card"><span>${escapeHtml(galleryText('stats.totalBytes'))}</span><strong>${escapeHtml(formatAdminGalleryBytes(stats.totalBytes))}</strong></div>
    <div class="stat-card stat-card-list">
      <span>${escapeHtml(galleryText('stats.topUsers'))}</span>
      <ul>
        ${topUsers.length ? topUsers.map((userStat) => `
          <li><span>${escapeHtml(adminGalleryUserLabel(userStat.userId, users))}</span><strong>${escapeHtml(formatAdminGalleryBytes(userStat.bytes))}</strong></li>
        `).join('') : `<li class="hint">${escapeHtml(galleryText('stats.noData'))}</li>`}
      </ul>
    </div>
    <div class="stat-card stat-card-list">
      <span>${escapeHtml(galleryText('stats.topModels'))}</span>
      <ul>
        ${topModels.length ? topModels.map((modelStat) => `
          <li><span>${escapeHtml(modelStat.model || '-')}</span><strong>${safeCount(modelStat.count)}</strong></li>
        `).join('') : `<li class="hint">${escapeHtml(galleryText('stats.noData'))}</li>`}
      </ul>
    </div>
  `;
}

export function adminGallerySummaryHtml({ total = 0, totalAll = 0, itemCount = 0, storage = '' } = {}) {
  return `
      <span class="chip">${escapeHtml(galleryText('summary.hits', { total: safeCount(total), totalAll: safeCount(totalAll) || safeCount(itemCount) }))}</span>
      <span class="chip">${escapeHtml(galleryText('summary.storage', { storage: storage || 'generated/users/*' }))}</span>
    `;
}

export function adminGalleryLoadingSummaryHtml() {
  return `<span class="chip">${escapeHtml(galleryText('loading'))}</span>`;
}

export function adminGalleryLoadingTableHtml() {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">▧</div><p>${escapeHtml(galleryText('loading'))}</p></div>`;
}

export function adminGalleryErrorSummaryHtml(message = t('common.loadFailed')) {
  return `<span class="chip error">${escapeHtml(galleryText('error.summary', { error: message || t('common.loadFailed') }))}</span>`;
}

export function adminGalleryErrorTableHtml(message = t('common.loadFailed')) {
  return `<div class="error-banner">${escapeHtml(galleryText('error.table', { error: message || t('common.loadFailed') }))}</div>`;
}

export function adminGalleryFilterSummaryText({ total = 0, page = 1, pageSize = 50 } = {}) {
  return safeCount(total) ? galleryText('filter.pageSummary', { page: safeCount(page), pageSize: safeCount(pageSize) }) : '';
}

export function adminGalleryTableView(items = [], { selectedIds = new Set(), users = [] } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (!rows.length) {
    return {
      empty: true,
      html: `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(galleryText('empty.noImages'))}</p></div>`
    };
  }
  return {
    empty: false,
    html: `
    <table class="users-table management-table admin-gallery-table">
      <thead>
        <tr>
          <th class="admin-gallery-check"><input type="checkbox" data-bulk-toggle aria-label="${escapeHtml(galleryText('table.selectAll'))}" /></th>
          <th>${escapeHtml(galleryText('table.thumbnail'))}</th>
          <th>${escapeHtml(galleryText('table.user'))}</th>
          <th>${escapeHtml(galleryText('table.file'))}</th>
          <th>${escapeHtml(galleryText('table.modelSize'))}</th>
          <th>${escapeHtml(galleryText('table.bytes'))}</th>
          <th>${escapeHtml(galleryText('table.createdAt'))}</th>
          <th>${escapeHtml(galleryText('table.actions'))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item) => adminGalleryTableRowHtml(item, { selectedIds: selected, users })).join('')}
      </tbody>
    </table>
  `
  };
}

export function adminGalleryTableRowHtml(item = {}, { selectedIds = new Set(), users = [] } = {}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const missing = item.fileMissing === true;
  const src = missing ? '' : (item.thumbnailUrl || item.previewUrl || item.url || item.downloadUrl || '');
  const prompt = item.revisedPrompt || item.prompt || item.filename || galleryText('image.fallback');
  const isChecked = selected.has(item.id);
  return `
            <tr data-image-id="${escapeHtml(item.id || '')}" class="${[isChecked ? 'selected' : '', missing ? 'is-missing-file' : ''].filter(Boolean).join(' ')}">
              <td class="admin-gallery-check">
                <input type="checkbox" data-row-check ${isChecked ? 'checked' : ''} />
              </td>
              <td>
                ${src ? `<img class="admin-gallery-thumb" src="${escapeHtml(src)}" alt="${escapeHtml(String(prompt).slice(0, 80))}" loading="lazy" />` : '-'}
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(adminGalleryUserLabel(item.userId, users))}</strong>
                  <small>${escapeHtml(adminGalleryShortId(item.userId))}</small>
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(item.filename || '-')}</strong>
                  <small>${escapeHtml(item.path || '')}</small>
                  ${missing ? `<small class="muted-text">${escapeHtml(galleryText('missing.reason', { reason: item.missingReason || 'missing_file' }))}</small>` : ''}
                </div>
              </td>
              <td>
                <div class="management-file-cell">
                  <strong>${escapeHtml(item.model || '-')}</strong>
                  <small>${escapeHtml([item.size, item.quality, item.outputFormat].filter(Boolean).join(' · ') || '-')}</small>
                </div>
              </td>
              <td>${escapeHtml(formatAdminGalleryBytes(item.bytes))}</td>
              <td>${escapeHtml(formatAdminGalleryTime(item.createdAt))}</td>
              <td class="users-actions-cell"><div class="actions-wrap">
                <button class="ghost small" data-act="view">${escapeHtml(galleryText('action.view'))}</button>
                <button class="danger ghost small" data-act="delete">${escapeHtml(galleryText('action.delete'))}</button>
              </div></td>
            </tr>
          `;
}

export function adminGalleryPagerView({ total = 0, pageSize = 50, page = 1 } = {}) {
  const totalValue = safeCount(total);
  const pageSizeValue = Math.max(1, safeCount(pageSize) || 1);
  const pageValue = Math.max(1, safeCount(page) || 1);
  const totalPages = Math.max(1, Math.ceil(totalValue / pageSizeValue));
  if (totalValue <= pageSizeValue) {
    return { hidden: true, html: '', totalPages };
  }
  return {
    hidden: false,
    totalPages,
    html: `
    <button class="ghost small" data-pager="prev" ${pageValue <= 1 ? 'disabled' : ''}>${escapeHtml(galleryText('pager.prev'))}</button>
    <span>${escapeHtml(galleryText('pager.info', { page: pageValue, totalPages }))}</span>
    <button class="ghost small" data-pager="next" ${pageValue >= totalPages ? 'disabled' : ''}>${escapeHtml(galleryText('pager.next'))}</button>
  `
  };
}

export function adminGalleryUserFilterOptionsHtml(users = [], current = '') {
  return `<option value="">${escapeHtml(galleryText('filter.allUsers'))}</option>` + adminGalleryKnownUsers(users).map((user) => {
    const label = `${user?.username || '-'} (${adminGalleryShortId(user?.id)})`;
    return `<option value="${escapeHtml(user?.id || '')}" ${current === user?.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function adminGalleryModelFilterOptionsHtml(models = [], current = '') {
  return `<option value="">${escapeHtml(galleryText('filter.allModels'))}</option>` + [...models].sort().map((model) => `
      <option value="${escapeHtml(model)}" ${current === model ? 'selected' : ''}>${escapeHtml(model)}</option>
    `).join('');
}

export function adminGalleryImageDetailView(item = {}, { users = [] } = {}) {
  const src = item.fileMissing === true ? '' : (item.previewUrl || item.url || item.downloadUrl || '');
  const originalSrc = item.fileMissing === true ? '' : (item.downloadUrl || item.url || src);
  const promptTruncated = item.promptTruncated === true;
  const revisedPromptTruncated = item.revisedPromptTruncated === true;
  return {
    title: item.filename || galleryText('detail.title.default'),
    html: `
    <div class="image-detail">
      ${src ? `<a href="${escapeHtml(originalSrc)}" target="_blank" rel="noreferrer"><img class="image-detail-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.filename || '')}" /></a>` : ''}
      <dl class="user-detail-grid">
        <dt>${escapeHtml(galleryText('detail.user'))}</dt><dd>${escapeHtml(adminGalleryUserLabel(item.userId, users))}</dd>
        <dt>${escapeHtml(galleryText('detail.file'))}</dt><dd><code>${escapeHtml(item.path || '')}</code></dd>
        <dt>${escapeHtml(galleryText('detail.model'))}</dt><dd>${escapeHtml(item.model || '-')}</dd>
        <dt>${escapeHtml(galleryText('detail.size'))}</dt><dd>${escapeHtml(item.size || '-')}</dd>
        <dt>${escapeHtml(galleryText('detail.quality'))}</dt><dd>${escapeHtml(item.quality || '-')}</dd>
        <dt>${escapeHtml(galleryText('detail.format'))}</dt><dd>${escapeHtml(item.outputFormat || '-')}</dd>
        <dt>${escapeHtml(galleryText('detail.bytes'))}</dt><dd>${escapeHtml(formatAdminGalleryBytes(item.bytes))}</dd>
        <dt>${escapeHtml(galleryText('detail.source'))}</dt><dd>${escapeHtml(item.profileName || '-')}</dd>
        <dt>${escapeHtml(galleryText('detail.createdAt'))}</dt><dd>${escapeHtml(formatAdminGalleryTime(item.createdAt))}</dd>
      </dl>
      <section class="user-detail-block">
        <h3>${escapeHtml(galleryText('detail.prompt'))}</h3>
        <p class="prompt-preview-detail">${escapeHtml(item.prompt || '-')}</p>
        ${promptTruncated ? `<p class="hint">${escapeHtml(galleryText('detail.promptTruncated'))}</p>` : ''}
      </section>
      ${item.revisedPrompt ? `
        <section class="user-detail-block">
          <h3>Revised Prompt</h3>
          <p class="prompt-preview-detail">${escapeHtml(item.revisedPrompt)}</p>
          ${revisedPromptTruncated ? `<p class="hint">${escapeHtml(galleryText('detail.revisedPromptTruncated'))}</p>` : ''}
        </section>
      ` : ''}
    </div>
  `
  };
}

export function adminGalleryOrphanScanHtml({ missing = [], dangling = [] } = {}, { users = [] } = {}) {
  const missingRows = Array.isArray(missing) ? missing : [];
  const danglingRows = Array.isArray(dangling) ? dangling : [];
  return `
      <div class="orphan-detail">
        <p class="hint">${escapeHtml(galleryText('orphan.hint'))}</p>

        <section class="user-detail-block">
          <h3>${escapeHtml(galleryText('orphan.missingTitle', { count: missingRows.length }))}</h3>
          ${missingRows.length ? `
            <ul class="orphan-list">
              ${missingRows.map((item) => `
                <li>
                  <div><strong>${escapeHtml(item.path)}</strong></div>
                  <small>${escapeHtml(galleryText('orphan.missingMeta', {
                    user: adminGalleryUserLabel(item.userId, users),
                    id: adminGalleryShortId(item.id),
                    time: formatAdminGalleryTime(item.createdAt)
                  }))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-row" data-id="${escapeHtml(item.id)}">${escapeHtml(galleryText('orphan.deleteRow'))}</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : `<p class="hint">${escapeHtml(galleryText('orphan.none'))}</p>`}
        </section>

        <section class="user-detail-block">
          <h3>${escapeHtml(galleryText('orphan.danglingTitle', { count: danglingRows.length }))}</h3>
          ${danglingRows.length ? `
            <ul class="orphan-list">
              ${danglingRows.map((item) => `
                <li>
                  <div><strong>${escapeHtml(item.path)}</strong></div>
                  <small>${escapeHtml(galleryText('orphan.danglingMeta', {
                    user: adminGalleryUserLabel(item.userId, users),
                    bytes: formatAdminGalleryBytes(item.bytes),
                    time: formatAdminGalleryTime(item.mtime)
                  }))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-file" data-path="${escapeHtml(item.path)}">${escapeHtml(galleryText('orphan.deleteFile'))}</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : `<p class="hint">${escapeHtml(galleryText('orphan.none'))}</p>`}
        </section>
      </div>
    `;
}
