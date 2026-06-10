// Admin quota management panel.

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';

function statusLabel(status) {
  return status === 'active' ? '启用' : '停用';
}

// ---------- 额度管理 ----------

let quotaItems = [];
let quotaDefaults = null;
let quotaLoaded = false;
const quotaSelected = new Set();
let openQuotaMenu = null;

export function isQuotaLoaded() {
  return quotaLoaded;
}

const QUOTA_FIELDS = ['daily_limit', 'monthly_limit', 'storage_limit_mb', 'concurrent_limit'];
const QUOTA_FIELD_LABEL = {
  daily_limit: '日额度',
  monthly_limit: '月额度',
  storage_limit_mb: '存储上限',
  concurrent_limit: '并发上限'
};

function fmtLimit(value) {
  if (value === null || value === undefined) return '不限';
  return String(value);
}

function fmtMb(bytes) {
  const v = Number(bytes) || 0;
  if (!v) return '0 MB';
  const mb = v / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function pct(used, limit) {
  if (!limit) return null;
  return Math.min(100, Math.round((Number(used) || 0) / limit * 100));
}

function miniBar(used, limit) {
  const p = pct(used, limit);
  if (p === null) return '<span class="quota-mini quota-mini-unlim" aria-hidden="true"></span>';
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `<progress class="quota-mini ${cls}" value="${p}" max="100" aria-hidden="true"></progress>`;
}

function miniStorageBar(usedBytes, limitMb) {
  if (!limitMb) return '<span class="quota-mini quota-mini-unlim" aria-hidden="true"></span>';
  const usedMb = (Number(usedBytes) || 0) / (1024 * 1024);
  const p = Math.min(100, Math.round(usedMb / limitMb * 100));
  const cls = p >= 90 ? 'high' : p >= 70 ? 'mid' : '';
  return `<progress class="quota-mini ${cls}" value="${p}" max="100" aria-hidden="true"></progress>`;
}

export function renderDefaultsCard() {
  const host = $('quotaDefaultsCard');
  if (!host) return;
  if (!quotaDefaults) { host.innerHTML = ''; return; }
  const card = (key, label, suffix) => {
    const v = quotaDefaults[key];
    return `
      <div class="stat-card quota-default-card">
        <span>${label}</span>
        <div class="quota-default-input">
          <input type="number" min="0" step="1"
            data-default-key="${key}"
            value="${v === null || v === undefined ? '' : v}"
            placeholder="不限" />
          <em>${suffix}</em>
        </div>
      </div>
    `;
  };
  host.innerHTML = `
    ${card('daily_limit', '系统默认每日调用上限', '次/天')}
    ${card('monthly_limit', '系统默认每月调用上限', '次/月')}
    ${card('storage_limit_mb', '存储上限', 'MB')}
    ${card('concurrent_limit', '并发上限', '次')}
  `;
}

function inlineQuotaCell(userId, field, value) {
  const overridden = value !== null && value !== undefined;
  return `
    <td class="quota-inline-cell ${overridden ? 'overridden' : ''}">
      <input type="number" min="0" step="1"
        class="quota-inline-input ${overridden ? 'overridden' : ''}"
        data-quota-field="${field}"
        data-user-id="${escapeHtml(userId)}"
        value="${overridden ? value : ''}"
        placeholder="跟随" />
    </td>
  `;
}

export function renderQuotaTable() {
  const wrap = $('quotaTableWrap');
  if (!wrap) return;
  if (!quotaItems.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无数据</p></div>`;
    syncQuotaBulkBar();
    return;
  }

  wrap.innerHTML = `
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
        ${quotaItems.map((row) => {
          const u = row.user || {};
          const q = row.quota || {};
          const raw = q.raw || {};
          const usage = row.usage || {};
          const today = usage.today || {};
          const month = usage.month || {};
          const storage = usage.storage || {};
          const todayPromptOptimizations = Number(today.promptOptimizations || 0);
          const monthPromptOptimizations = Number(month.promptOptimizations || 0);
          const id = u.id || '';
          const isChecked = quotaSelected.has(id);
          const promptOptimizeChip = (todayPromptOptimizations || monthPromptOptimizations)
            ? `<small class="quota-extra-chip" title="提示词优化今日 ${todayPromptOptimizations} / 本月 ${monthPromptOptimizations}">优化 ${todayPromptOptimizations}/${monthPromptOptimizations}</small>`
            : '';
          const failChip = (today.fails || month.fails)
            ? `<small class="quota-fail-chip" title="今日失败 ${today.fails || 0} / 本月失败 ${month.fails || 0}">失败 ${today.fails || 0}/${month.fails || 0}</small>`
            : '';
          return `
            <tr data-quota-user-id="${escapeHtml(id)}" class="${isChecked ? 'selected' : ''}">
              <td class="quota-check">
                <input type="checkbox" data-quota-row-check ${isChecked ? 'checked' : ''} aria-label="选中 ${escapeHtml(u.username || '')}" />
              </td>
              <td>
                <div class="management-user-cell">
                  <strong>${escapeHtml(u.username || '-')}</strong>
                  <small>${escapeHtml(u.email || '-')}</small>
                </div>
              </td>
              <td>
                <span class="chip ${u.status === 'active' ? 'ok' : 'err'}">${statusLabel(u.status)}</span>
                ${u.role === 'admin' ? '<span class="chip info">管理员</span>' : ''}
              </td>
              ${inlineQuotaCell(id, 'daily_limit', raw.daily_limit ?? null)}
              ${inlineQuotaCell(id, 'monthly_limit', raw.monthly_limit ?? null)}
              ${inlineQuotaCell(id, 'storage_limit_mb', raw.storage_limit_mb ?? null)}
              ${inlineQuotaCell(id, 'concurrent_limit', raw.concurrent_limit ?? null)}
              <td class="quota-usage-summary">
                <div class="quota-usage-line">
                  <span>今</span>${miniBar(today.calls || 0, q.daily_limit)}
                  <small title="今日系统默认接口调用总数（含生图与提示词优化）">${today.calls || 0}/${fmtLimit(q.daily_limit)}</small>
                </div>
                <div class="quota-usage-line">
                  <span>月</span>${miniBar(month.calls || 0, q.monthly_limit)}
                  <small title="本月系统默认接口调用总数（含生图与提示词优化）">${month.calls || 0}/${fmtLimit(q.monthly_limit)}</small>
                </div>
                <div class="quota-usage-line">
                  <span>存</span>${miniStorageBar(storage.bytes || 0, q.storage_limit_mb)}
                  <small>${fmtMb(storage.bytes || 0)}${q.storage_limit_mb ? ` / ${q.storage_limit_mb}MB` : ''}</small>
                </div>
                ${promptOptimizeChip}
                ${failChip}
              </td>
              <td class="quota-row-action">
                <button class="ghost small icon-only" data-quota-act="menu" aria-label="更多操作" title="更多操作">⋯</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const allChecked = quotaItems.every((r) => quotaSelected.has(r.user?.id));
  const toggle = wrap.querySelector('[data-quota-bulk-toggle]');
  if (toggle) toggle.checked = allChecked && quotaItems.length > 0;
  syncQuotaBulkBar();
}

function syncQuotaBulkBar() {
  const bar = $('quotaBulkBar');
  const count = $('quotaBulkCount');
  if (!bar) return;
  if (quotaSelected.size === 0) { bar.hidden = true; return; }
  bar.hidden = false;
  if (count) count.textContent = `已选 ${quotaSelected.size} 人`;
}

export async function refreshQuota({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/admin/quota/users');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    quotaItems = Array.isArray(data.items) ? data.items : [];
    quotaDefaults = data.defaults || quotaDefaults;
    quotaLoaded = true;
    for (const id of [...quotaSelected]) {
      if (!quotaItems.find((r) => r.user?.id === id)) quotaSelected.delete(id);
    }
    renderDefaultsCard();
    renderQuotaTable();
    if (!silent) setStatus(`额度列表已刷新 · ${quotaItems.length} 人`, 'ok', 1400);
  } catch (err) {
    setStatus(`加载额度失败：${err?.message || err}`, 'err', 2400);
    const wrap = $('quotaTableWrap');
    if (wrap) wrap.innerHTML = `<div class="error-banner">${escapeHtml(err?.message || '加载失败')}</div>`;
  }
}

function parseQuotaInput(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error('必须是非负整数');
  return Math.floor(n);
}

async function saveDefaultField(key, rawValue, inputEl) {
  let value;
  try { value = parseQuotaInput(rawValue); }
  catch (err) {
    setStatus(`默认值无效：${err.message}`, 'err', 2000);
    if (inputEl) {
      const old = quotaDefaults?.[key];
      inputEl.value = old === null || old === undefined ? '' : String(old);
    }
    return;
  }
  if ((quotaDefaults?.[key] ?? null) === value) return;
  try {
    const resp = await apiFetch('/api/admin/quota/defaults', {
      method: 'PUT',
      body: { [key]: value }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    quotaDefaults = data.defaults || quotaDefaults;
    setStatus(`默认值已更新：${QUOTA_FIELD_LABEL[key]}`, 'ok', 1200);
    renderQuotaTable();
  } catch (err) {
    setStatus(`保存失败：${err?.message || err}`, 'err', 2400);
    if (inputEl) {
      const old = quotaDefaults?.[key];
      inputEl.value = old === null || old === undefined ? '' : String(old);
    }
  }
}

async function saveUserQuotaField(userId, field, rawValue, inputEl) {
  const item = quotaItems.find((r) => r.user?.id === userId);
  if (!item) return;
  let value;
  try { value = parseQuotaInput(rawValue); }
  catch (err) {
    setStatus(`字段无效：${err.message}`, 'err', 2000);
    const old = item.quota?.raw?.[field];
    if (inputEl) inputEl.value = old === null || old === undefined ? '' : String(old);
    return;
  }
  const oldVal = item.quota?.raw?.[field] ?? null;
  if (oldVal === value) return;
  try {
    const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: { [field]: value }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    item.quota = data.quota || item.quota;
    item.usage = data.usage || item.usage;
    setStatus(`已更新 ${item.user.username || item.user.email} · ${QUOTA_FIELD_LABEL[field]}`, 'ok', 1200);
    renderQuotaTable();
  } catch (err) {
    setStatus(`保存失败：${err?.message || err}`, 'err', 2400);
    if (inputEl) {
      inputEl.value = oldVal === null || oldVal === undefined ? '' : String(oldVal);
    }
  }
}

async function restoreUserDefault(userId) {
  const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function resetUserUsage(userId, scope) {
  const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}/reset`, {
    method: 'POST',
    body: { scope }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

function quotaFields(values = {}) {
  return [
    { name: 'daily_limit', label: '每日系统默认接口调用上限（含提示词优化，次，留空=不限）', type: 'number', value: values.daily_limit ?? '' },
    { name: 'monthly_limit', label: '每月系统默认接口调用上限（含提示词优化，次，留空=不限）', type: 'number', value: values.monthly_limit ?? '' },
    { name: 'storage_limit_mb', label: '存储上限（MB，留空=不限）', type: 'number', value: values.storage_limit_mb ?? '' },
    { name: 'concurrent_limit', label: '并发上限（次，留空=不限）', type: 'number', value: values.concurrent_limit ?? '' }
  ];
}

function normalizeQuotaPayload(values) {
  const out = {};
  for (const k of QUOTA_FIELDS) {
    const raw = values[k];
    if (raw === '' || raw === undefined) out[k] = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`字段 ${k} 必须是非负数字`);
      out[k] = Math.floor(n);
    }
  }
  return out;
}

async function openUserQuotaDialog(userId) {
  const item = quotaItems.find((r) => r.user?.id === userId);
  if (!item) return;
  const cur = item.quota?.raw || {};
  const result = await dialog.form({
    title: `编辑额度 · ${item.user.username || item.user.email}`,
    fields: quotaFields({
      daily_limit: cur.daily_limit ?? '',
      monthly_limit: cur.monthly_limit ?? '',
      storage_limit_mb: cur.storage_limit_mb ?? '',
      concurrent_limit: cur.concurrent_limit ?? ''
    }),
    confirmText: '保存',
    validate: (v) => {
      try { normalizeQuotaPayload(v); return null; } catch (e) { return e.message; }
    }
  });
  if (!result.ok) return;
  try {
    const body = normalizeQuotaPayload(result.values);
    const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('额度已更新', 'ok', 1400);
    refreshQuota({ silent: true });
  } catch (err) {
    await dialog.info({ title: '保存失败', message: err?.message || '未知错误' });
  }
}

function closeQuotaMenu() {
  if (openQuotaMenu) {
    openQuotaMenu.close();
    openQuotaMenu = null;
  }
}

function openRowMenu(userId, anchor) {
  closeQuotaMenu();
  const item = quotaItems.find((r) => r.user?.id === userId);
  if (!item) return;
  const menu = document.createElement('div');
  menu.className = 'quota-row-menu';
  menu.innerHTML = `
    <button data-act="edit-all">编辑全部字段…</button>
    <button data-act="reset-today">重置今日用量</button>
    <button data-act="reset-month">重置本月用量</button>
    <button data-act="restore" class="danger">恢复为默认</button>
  `;
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

  const close = () => {
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onResize, true);
    try { menu.remove(); } catch { /* ignore */ }
  };
  const onDocClick = (ev) => {
    if (menu.contains(ev.target)) return;
    close();
    openQuotaMenu = null;
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { close(); openQuotaMenu = null; }
  };
  const onResize = () => { close(); openQuotaMenu = null; };
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
  }, 0);

  menu.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    close();
    openQuotaMenu = null;
    if (act === 'edit-all') {
      openUserQuotaDialog(userId);
    } else if (act === 'reset-today' || act === 'reset-month') {
      const scope = act === 'reset-today' ? 'today' : 'month';
      const ok = await dialog.confirm({
        title: '重置用量',
        message: `将清空「${item.user.username || item.user.email}」的「${scope === 'month' ? '本月' : '今日'}」调用计数（不影响存储）。继续？`,
        confirmText: '重置',
        danger: true
      });
      if (!ok) return;
      try {
        await resetUserUsage(userId, scope);
        setStatus('用量已重置', 'ok', 1400);
        refreshQuota({ silent: true });
      } catch (err) {
        setStatus(`重置失败：${err?.message || err}`, 'err', 2000);
      }
    } else if (act === 'restore') {
      const ok = await dialog.confirm({
        title: '恢复为默认',
        message: `将清空「${item.user.username || item.user.email}」的全部额度覆盖，恢复为默认值。继续？`,
        confirmText: '恢复',
        danger: true
      });
      if (!ok) return;
      try {
        await restoreUserDefault(userId);
        setStatus('已恢复默认', 'ok', 1400);
        refreshQuota({ silent: true });
      } catch (err) {
        setStatus(`恢复失败：${err?.message || err}`, 'err', 2000);
      }
    }
  });

  openQuotaMenu = { close };
}

async function runBulk(userIds, op) {
  let okCount = 0, failCount = 0;
  for (const id of userIds) {
    try { await op(id); okCount += 1; }
    catch { failCount += 1; }
  }
  return { okCount, failCount };
}

async function bulkResetUsage(scope) {
  if (quotaSelected.size === 0) return;
  const ids = [...quotaSelected];
  const ok = await dialog.confirm({
    title: '批量重置',
    message: `将清空选中 ${ids.length} 个用户的「${scope === 'month' ? '本月' : '今日'}」调用计数。继续？`,
    confirmText: '重置',
    danger: true
  });
  if (!ok) return;
  setStatus(`正在批量重置 ${ids.length} 人…`, 'ok', 0);
  const res = await runBulk(ids, (id) => resetUserUsage(id, scope));
  setStatus(`批量重置完成：成功 ${res.okCount} / 失败 ${res.failCount}`, res.failCount ? 'err' : 'ok', 2400);
  refreshQuota({ silent: true });
}

async function bulkRestoreDefault() {
  if (quotaSelected.size === 0) return;
  const ids = [...quotaSelected];
  const ok = await dialog.confirm({
    title: '批量恢复默认',
    message: `将清空选中 ${ids.length} 个用户的全部额度覆盖。继续？`,
    confirmText: '恢复',
    danger: true
  });
  if (!ok) return;
  setStatus(`正在批量恢复 ${ids.length} 人…`, 'ok', 0);
  const res = await runBulk(ids, (id) => restoreUserDefault(id));
  setStatus(`批量恢复完成：成功 ${res.okCount} / 失败 ${res.failCount}`, res.failCount ? 'err' : 'ok', 2400);
  quotaSelected.clear();
  refreshQuota({ silent: true });
}

async function bulkEditQuota() {
  if (quotaSelected.size === 0) return;
  const ids = [...quotaSelected];
  const result = await dialog.form({
    title: `批量编辑额度 · ${ids.length} 人`,
    fields: quotaFields({}).map((f) => ({ ...f, label: f.label + '【留空=该字段不变】' })),
    confirmText: '应用到所选',
    validate: (v) => {
      if (QUOTA_FIELDS.every((k) => v[k] === '' || v[k] === undefined)) return '请至少填写一个字段';
      try {
        for (const k of QUOTA_FIELDS) {
          if (v[k] === '' || v[k] === undefined) continue;
          const n = Number(v[k]);
          if (!Number.isFinite(n) || n < 0) throw new Error(`字段 ${k} 必须是非负数字`);
        }
        return null;
      } catch (e) { return e.message; }
    }
  });
  if (!result.ok) return;
  const body = {};
  for (const k of QUOTA_FIELDS) {
    const raw = result.values[k];
    if (raw === '' || raw === undefined) continue;
    body[k] = parseQuotaInput(raw);
  }
  setStatus(`正在批量更新 ${ids.length} 人…`, 'ok', 0);
  const res = await runBulk(ids, async (id) => {
    const resp = await apiFetch(`/api/admin/quota/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  });
  setStatus(`批量更新完成：成功 ${res.okCount} / 失败 ${res.failCount}`, res.failCount ? 'err' : 'ok', 2400);
  refreshQuota({ silent: true });
}

export function bindQuotaPanel() {
  $('quotaDefaultsCard')?.addEventListener('change', (ev) => {
    const inp = ev.target.closest('input[data-default-key]');
    if (!inp) return;
    saveDefaultField(inp.dataset.defaultKey, inp.value, inp);
  });

  const wrap = $('quotaTableWrap');
  if (wrap) {
    wrap.addEventListener('change', (ev) => {
      const inp = ev.target.closest('input.quota-inline-input');
      if (inp) {
        saveUserQuotaField(inp.dataset.userId, inp.dataset.quotaField, inp.value, inp);
        return;
      }
      const toggle = ev.target.closest('input[data-quota-bulk-toggle]');
      if (toggle) {
        if (toggle.checked) quotaItems.forEach((r) => { if (r.user?.id) quotaSelected.add(r.user.id); });
        else quotaItems.forEach((r) => { if (r.user?.id) quotaSelected.delete(r.user.id); });
        renderQuotaTable();
        return;
      }
      const rowCheck = ev.target.closest('input[data-quota-row-check]');
      if (rowCheck) {
        const tr = rowCheck.closest('tr[data-quota-user-id]');
        const id = tr?.dataset.quotaUserId;
        if (!id) return;
        if (rowCheck.checked) quotaSelected.add(id);
        else quotaSelected.delete(id);
        tr.classList.toggle('selected', rowCheck.checked);
        syncQuotaBulkBar();
        const allChecked = quotaItems.every((r) => quotaSelected.has(r.user?.id));
        const head = wrap.querySelector('[data-quota-bulk-toggle]');
        if (head) head.checked = allChecked && quotaItems.length > 0;
      }
    });

    wrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-quota-act="menu"]');
      if (!btn) return;
      const tr = btn.closest('tr[data-quota-user-id]');
      const id = tr?.dataset.quotaUserId;
      if (!id) return;
      ev.stopPropagation();
      openRowMenu(id, btn);
    });
  }

  $('quotaBulkClear')?.addEventListener('click', () => {
    quotaSelected.clear();
    renderQuotaTable();
  });
  $('quotaBulkEdit')?.addEventListener('click', bulkEditQuota);
  $('quotaBulkResetToday')?.addEventListener('click', () => bulkResetUsage('today'));
  $('quotaBulkResetMonth')?.addEventListener('click', () => bulkResetUsage('month'));
  $('quotaBulkRestore')?.addEventListener('click', bulkRestoreDefault);
}

