import { escapeHtml } from './dom.js';

export function formatAdminGalleryTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
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
    <div class="stat-card"><span>总图数</span><strong>${safeCount(stats.total)}</strong></div>
    <div class="stat-card"><span>今日新增</span><strong>${safeCount(stats.savedToday)}</strong></div>
    <div class="stat-card"><span>总容量</span><strong>${escapeHtml(formatAdminGalleryBytes(stats.totalBytes))}</strong></div>
    <div class="stat-card stat-card-list">
      <span>用户容量 Top</span>
      <ul>
        ${topUsers.length ? topUsers.map((userStat) => `
          <li><span>${escapeHtml(adminGalleryUserLabel(userStat.userId, users))}</span><strong>${escapeHtml(formatAdminGalleryBytes(userStat.bytes))}</strong></li>
        `).join('') : '<li class="hint">无数据</li>'}
      </ul>
    </div>
    <div class="stat-card stat-card-list">
      <span>模型分布 Top</span>
      <ul>
        ${topModels.length ? topModels.map((modelStat) => `
          <li><span>${escapeHtml(modelStat.model || '-')}</span><strong>${safeCount(modelStat.count)}</strong></li>
        `).join('') : '<li class="hint">无数据</li>'}
      </ul>
    </div>
  `;
}

export function adminGallerySummaryHtml({ total = 0, totalAll = 0, itemCount = 0, storage = '' } = {}) {
  return `
      <span class="chip">命中 ${safeCount(total)} / ${safeCount(totalAll) || safeCount(itemCount)} 张</span>
      <span class="chip">目录 ${escapeHtml(storage || 'generated/users/*')}</span>
    `;
}

export function adminGalleryLoadingSummaryHtml() {
  return '<span class="chip">正在加载图库…</span>';
}

export function adminGalleryLoadingTableHtml() {
  return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">▧</div><p>正在加载图库…</p></div>';
}

export function adminGalleryErrorSummaryHtml(message = '加载失败') {
  return `<span class="chip error">加载失败：${escapeHtml(message || '加载失败')}</span>`;
}

export function adminGalleryErrorTableHtml(message = '加载失败') {
  return `<div class="error-banner">加载图库失败：${escapeHtml(message || '加载失败')}</div>`;
}

export function adminGalleryFilterSummaryText({ total = 0, page = 1, pageSize = 50 } = {}) {
  return safeCount(total) ? `第 ${safeCount(page)} 页 · 每页 ${safeCount(pageSize)}` : '';
}

export function adminGalleryTableView(items = [], { selectedIds = new Set(), users = [] } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (!rows.length) {
    return {
      empty: true,
      html: '<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无符合条件的图片</p></div>'
    };
  }
  return {
    empty: false,
    html: `
    <table class="users-table management-table admin-gallery-table">
      <thead>
        <tr>
          <th class="admin-gallery-check"><input type="checkbox" data-bulk-toggle aria-label="全选" /></th>
          <th>缩略图</th>
          <th>用户</th>
          <th>文件</th>
          <th>模型 / 尺寸</th>
          <th>大小</th>
          <th>创建时间</th>
          <th>操作</th>
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
  const prompt = item.revisedPrompt || item.prompt || item.filename || '图库图片';
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
                  ${missing ? `<small class="muted-text">missing: ${escapeHtml(item.missingReason || 'missing_file')}</small>` : ''}
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
                <button class="ghost small" data-act="view">查看</button>
                <button class="danger ghost small" data-act="delete">删除</button>
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
    <button class="ghost small" data-pager="prev" ${pageValue <= 1 ? 'disabled' : ''}>上一页</button>
    <span>第 ${pageValue} / ${totalPages} 页</span>
    <button class="ghost small" data-pager="next" ${pageValue >= totalPages ? 'disabled' : ''}>下一页</button>
  `
  };
}

export function adminGalleryUserFilterOptionsHtml(users = [], current = '') {
  return '<option value="">全部用户</option>' + adminGalleryKnownUsers(users).map((user) => {
    const label = `${user?.username || '-'} (${adminGalleryShortId(user?.id)})`;
    return `<option value="${escapeHtml(user?.id || '')}" ${current === user?.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function adminGalleryModelFilterOptionsHtml(models = [], current = '') {
  return '<option value="">全部模型</option>' + [...models].sort().map((model) => `
      <option value="${escapeHtml(model)}" ${current === model ? 'selected' : ''}>${escapeHtml(model)}</option>
    `).join('');
}

export function adminGalleryImageDetailView(item = {}, { users = [] } = {}) {
  const src = item.fileMissing === true ? '' : (item.previewUrl || item.url || item.downloadUrl || '');
  const originalSrc = item.fileMissing === true ? '' : (item.downloadUrl || item.url || src);
  return {
    title: item.filename || '图片',
    html: `
    <div class="image-detail">
      ${src ? `<a href="${escapeHtml(originalSrc)}" target="_blank" rel="noreferrer"><img class="image-detail-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.filename || '')}" /></a>` : ''}
      <dl class="user-detail-grid">
        <dt>用户</dt><dd>${escapeHtml(adminGalleryUserLabel(item.userId, users))}</dd>
        <dt>文件</dt><dd><code>${escapeHtml(item.path || '')}</code></dd>
        <dt>模型</dt><dd>${escapeHtml(item.model || '-')}</dd>
        <dt>尺寸</dt><dd>${escapeHtml(item.size || '-')}</dd>
        <dt>质量</dt><dd>${escapeHtml(item.quality || '-')}</dd>
        <dt>格式</dt><dd>${escapeHtml(item.outputFormat || '-')}</dd>
        <dt>大小</dt><dd>${escapeHtml(formatAdminGalleryBytes(item.bytes))}</dd>
        <dt>来源</dt><dd>${escapeHtml(item.profileName || '-')}</dd>
        <dt>创建时间</dt><dd>${escapeHtml(formatAdminGalleryTime(item.createdAt))}</dd>
      </dl>
      <section class="user-detail-block">
        <h3>提示词</h3>
        <p class="prompt-preview-detail">${escapeHtml(item.prompt || '-')}</p>
      </section>
      ${item.revisedPrompt ? `
        <section class="user-detail-block">
          <h3>Revised Prompt</h3>
          <p class="prompt-preview-detail">${escapeHtml(item.revisedPrompt)}</p>
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
        <p class="hint">missingFiles：DB 行存在但磁盘文件缺失。danglingFiles：磁盘有文件但 DB 没记录。</p>

        <section class="user-detail-block">
          <h3>缺失文件 · ${missingRows.length}</h3>
          ${missingRows.length ? `
            <ul class="orphan-list">
              ${missingRows.map((item) => `
                <li>
                  <div><strong>${escapeHtml(item.path)}</strong></div>
                  <small>用户：${escapeHtml(adminGalleryUserLabel(item.userId, users))} · ID：${escapeHtml(adminGalleryShortId(item.id))} · ${escapeHtml(formatAdminGalleryTime(item.createdAt))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-row" data-id="${escapeHtml(item.id)}">删除 DB 行</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="hint">无</p>'}
        </section>

        <section class="user-detail-block">
          <h3>未挂接文件 · ${danglingRows.length}</h3>
          ${danglingRows.length ? `
            <ul class="orphan-list">
              ${danglingRows.map((item) => `
                <li>
                  <div><strong>${escapeHtml(item.path)}</strong></div>
                  <small>用户：${escapeHtml(adminGalleryUserLabel(item.userId, users))} · ${escapeHtml(formatAdminGalleryBytes(item.bytes))} · ${escapeHtml(formatAdminGalleryTime(item.mtime))}</small>
                  <div class="orphan-actions">
                    <button class="danger ghost small" data-orphan-act="delete-file" data-path="${escapeHtml(item.path)}">删除磁盘文件</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="hint">无</p>'}
        </section>
      </div>
    `;
}
