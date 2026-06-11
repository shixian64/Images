// Admin quota management panel.

import { $, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';
import {
  quotaDefaultsCardHtml,
  quotaErrorHtml,
  quotaRowMenuHtml,
  quotaTableView
} from './admin-quota-view.js';

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

export function renderDefaultsCard() {
  const host = $('quotaDefaultsCard');
  if (!host) return;
  host.innerHTML = quotaDefaultsCardHtml(quotaDefaults);
}

export function renderQuotaTable() {
  const wrap = $('quotaTableWrap');
  if (!wrap) return;
  const view = quotaTableView(quotaItems, { selectedIds: quotaSelected });
  wrap.innerHTML = view.html;
  if (view.empty) {
    syncQuotaBulkBar();
    return;
  }

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
    if (wrap) wrap.innerHTML = quotaErrorHtml(err?.message || '加载失败');
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
  menu.innerHTML = quotaRowMenuHtml();
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
