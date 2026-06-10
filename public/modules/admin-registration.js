// ????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';

let registrationAdmin = null;
let registrationLoaded = false;
let lastGeneratedRegistrationCodes = [];

export function isRegistrationLoaded() {
  return registrationLoaded;
}

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

// ---------- 注册管理 ----------

function registrationSettings() {
  return registrationAdmin?.settings || {};
}

function registrationRedemptions() {
  return Array.isArray(registrationAdmin?.redemptions) ? registrationAdmin.redemptions : [];
}

function modeLabel(settings) {
  if (settings.allowPublicRegistration) {
    return settings.allowInviteRegistration ? '开放注册 + 邀请码注册' : '开放注册';
  }
  if (settings.allowInviteRegistration) return '仅邀请码注册';
  return '关闭注册';
}

function inviteStatus(item) {
  if (item?.disabledAt) return { className: 'err', label: '已停用' };
  if (item?.expired) return { className: 'err', label: '已过期' };
  if ((Number(item?.remainingUses) || 0) <= 0) return { className: '', label: '已用完' };
  return { className: 'ok', label: '可用' };
}

function formatInviteExpiry(item) {
  return item?.expiresAt ? formatTime(item.expiresAt) : '永不过期';
}

function redemptionUserLabel(item) {
  const name = item?.username || item?.email || item?.userId || '未知用户';
  const email = item?.email && item.email !== name ? ` · ${item.email}` : '';
  const deleted = item?.userDeleted ? ' · 用户已删除' : '';
  return `${name}${email}${deleted}`;
}

function redemptionsByCode() {
  const map = new Map();
  for (const item of registrationRedemptions()) {
    const code = String(item?.code || '').trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(item);
  }
  return map;
}

function renderInviteUsers(code, records = [], usedCount = 0) {
  if (!records.length) {
    return (Number(usedCount) || 0) > 0
      ? '<span class="muted">兑换记录已清理</span>'
      : '<span class="muted">未使用</span>';
  }
  const shown = records.slice(0, 3).map((item) => `
    <div class="management-user-cell">
      <strong>${escapeHtml(item.username || item.email || item.userId || '未知用户')}</strong>
      <small>${escapeHtml([item.email, formatTime(item.usedAt)].filter(Boolean).join(' · '))}</small>
    </div>
  `).join('');
  const more = records.length > 3 ? `<small class="muted">另有 ${records.length - 3} 条兑换记录</small>` : '';
  return `${shown}${more}`;
}

function renderRegistrationSummary() {
  const host = $('registrationSummary');
  if (!host) return;
  if (!registrationAdmin) {
    host.innerHTML = '<span class="chip">尚未加载</span>';
    return;
  }
  const settings = registrationSettings();
  const invites = Array.isArray(registrationAdmin.invites) ? registrationAdmin.invites : [];
  const redemptions = registrationRedemptions();
  const active = invites.filter((item) => item.active).length;
  const disabled = invites.filter((item) => item.disabledAt).length;
  const totalRemaining = invites.reduce((sum, item) => sum + (Number(item.remainingUses) || 0), 0);
  host.innerHTML = `
    <span class="chip ${settings.allowPublicRegistration || settings.allowInviteRegistration ? 'ok' : 'error'}">${escapeHtml(modeLabel(settings))}</span>
    <span class="chip ${settings.allowInviteRegistration ? 'ok' : ''}">邀请码注册：${settings.allowInviteRegistration ? '允许' : '关闭'}</span>
    <span class="chip">默认次数：${Number(settings.defaultInviteUses) || 1}</span>
    <span class="chip">默认有效期：${Number(settings.defaultInviteTtlDays) || 30} 天</span>
    <span class="chip info">可用邀请码：${active} 个 / 剩余 ${totalRemaining} 次</span>
    <span class="chip">已停用：${disabled} 个</span>
    <span class="chip">兑换记录：${redemptions.length} 条</span>
    ${settings.source === 'env' ? '<span class="chip">当前来自环境变量；保存后改由 UI 配置接管</span>' : ''}
  `;
}

export function renderRegistrationForm() {
  const settings = registrationSettings();
  const allowPublic = $('registrationAllowPublic');
  const allowInvite = $('registrationAllowInvite');
  const defaultUses = $('registrationDefaultInviteUses');
  const defaultTtlDays = $('registrationDefaultInviteTtlDays');
  if (allowPublic) allowPublic.checked = Boolean(settings.allowPublicRegistration);
  if (allowInvite) allowInvite.checked = Boolean(settings.allowInviteRegistration);
  if (defaultUses) defaultUses.value = String(Number(settings.defaultInviteUses) || 1);
  if (defaultTtlDays) defaultTtlDays.value = String(Number(settings.defaultInviteTtlDays) || 30);
  renderRegistrationSummary();
  renderRegistrationInvites();
  renderRegistrationRedemptions();
}

function renderRegistrationInvites() {
  const wrap = $('registrationInviteTableWrap');
  if (!wrap) return;
  const invites = Array.isArray(registrationAdmin?.invites) ? registrationAdmin.invites : [];
  if (!registrationAdmin) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>正在等待注册配置加载。</p></div>`;
    return;
  }
  if (!invites.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>还没有 UI 生成的邀请码。可在上方批量生成。</p></div>`;
    return;
  }
  const byCode = redemptionsByCode();
  wrap.innerHTML = `
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
        ${invites.map((item) => {
          const status = inviteStatus(item);
          const code = item.code || '';
          const displayCode = item.displayCode || code;
          const canDisable = !item.disabledAt;
          return `<tr>
            <td><code>${escapeHtml(displayCode || '-')}</code></td>
            <td>${Number(item.usedCount) || 0} / ${Number(item.maxUses) || 1}</td>
            <td>${Number(item.remainingUses) || 0}</td>
            <td>${renderInviteUsers(code, byCode.get(code) || [], item.usedCount)}</td>
            <td><span class="chip ${status.className}">${status.label}</span></td>
            <td>${escapeHtml(formatTime(item.createdAt))}</td>
            <td>${escapeHtml(formatInviteExpiry(item))}</td>
            <td>${canDisable ? `<button class="danger ghost small" type="button" data-disable-invite="${escapeHtml(code)}" data-invite-label="${escapeHtml(displayCode)}">停用</button>` : '<span class="muted">-</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderRegistrationRedemptions() {
  const wrap = $('registrationRedemptionTableWrap');
  if (!wrap) return;
  if (!registrationAdmin) {
    wrap.innerHTML = '';
    return;
  }
  const redemptions = registrationRedemptions();
  if (!redemptions.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>暂无兑换记录。</p></div>`;
    return;
  }
  wrap.innerHTML = `
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
        ${redemptions.map((item) => `<tr>
          <td><code>${escapeHtml(item.displayCode || item.code || '-')}</code></td>
          <td>${escapeHtml(redemptionUserLabel(item))}</td>
          <td><code>${escapeHtml(item.userId || '-')}</code></td>
          <td>${escapeHtml(formatTime(item.usedAt))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

export async function refreshRegistration({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/admin/registration');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    renderRegistrationForm();
    if (!silent) setStatus('注册设置已刷新', 'ok', 1400);
  } catch (err) {
    const host = $('registrationSummary');
    if (host) host.innerHTML = `<span class="chip error">加载失败：${escapeHtml(err?.message || String(err))}</span>`;
    setStatus(`加载注册设置失败：${err?.message || err}`, 'err', 2400);
  }
}

function readPositiveInput(id, fallback = null) {
  const raw = $(id)?.value.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new Error('请输入大于 0 的整数');
  return Math.floor(n);
}

function readRegistrationSettingsForm() {
  return {
    allowPublicRegistration: Boolean($('registrationAllowPublic')?.checked),
    allowInviteRegistration: Boolean($('registrationAllowInvite')?.checked),
    defaultInviteUses: readPositiveInput('registrationDefaultInviteUses', 1),
    defaultInviteTtlDays: readPositiveInput('registrationDefaultInviteTtlDays', 30)
  };
}

async function saveRegistrationSettings({ silent = false } = {}) {
  let body;
  try {
    body = readRegistrationSettingsForm();
  } catch (err) {
    setStatus(err?.message || '注册设置不合法', 'err', 2200);
    return false;
  }
  try {
    const resp = await apiFetch('/api/admin/registration/settings', {
      method: 'PUT',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    renderRegistrationForm();
    if (!silent) setStatus('注册设置已保存', 'ok', 1600);
    return true;
  } catch (err) {
    setStatus(`保存注册设置失败：${err?.message || err}`, 'err', 2400);
    return false;
  }
}

async function generateRegistrationInvites() {
  const saved = await saveRegistrationSettings({ silent: true });
  if (!saved) return;
  let body;
  try {
    body = {
      count: readPositiveInput('registrationGenerateCount', 10)
    };
  } catch (err) {
    setStatus(err?.message || '邀请码生成参数不合法', 'err', 2200);
    return;
  }
  try {
    const resp = await apiFetch('/api/admin/registration/invites', {
      method: 'POST',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    lastGeneratedRegistrationCodes = Array.isArray(data.generated)
      ? data.generated.map((item) => item.code).filter(Boolean)
      : [];
    const out = $('registrationGeneratedCodes');
    if (out) out.value = lastGeneratedRegistrationCodes.join('\n');
    renderRegistrationForm();
    if (out && lastGeneratedRegistrationCodes.length) out.value = lastGeneratedRegistrationCodes.join('\n');
    setStatus(`已生成 ${lastGeneratedRegistrationCodes.length} 个邀请码`, 'ok', 1800);
  } catch (err) {
    setStatus(`生成邀请码失败：${err?.message || err}`, 'err', 2400);
  }
}

async function resetRegistrationInvites() {
  if (!confirm('确定要重置邀请码吗？这会删除所有现有邀请码，但不会影响已注册用户和兑换记录。')) return;
  try {
    const resp = await apiFetch('/api/admin/registration/invites/reset', { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    lastGeneratedRegistrationCodes = [];
    const out = $('registrationGeneratedCodes');
    if (out) out.value = '';
    renderRegistrationForm();
    setStatus(`邀请码已重置，移除 ${Number(data.removed) || 0} 个`, 'ok', 1800);
  } catch (err) {
    setStatus(`重置邀请码失败：${err?.message || err}`, 'err', 2400);
  }
}

async function disableRegistrationInvite(code, label = code) {
  const text = String(code || '').trim();
  const displayLabel = String(label || text).trim();
  if (!text) return;
  if (!confirm(`确定要停用邀请码 ${displayLabel || text} 吗？已注册用户不受影响。`)) return;
  try {
    const resp = await apiFetch(`/api/admin/registration/invites/${encodeURIComponent(text)}`, { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    renderRegistrationForm();
    setStatus('邀请码已停用', 'ok', 1600);
  } catch (err) {
    setStatus(`停用邀请码失败：${err?.message || err}`, 'err', 2400);
  }
}

function readRegistrationCleanupForm() {
  const before = $('registrationCleanupBefore')?.value.trim();
  if (!before) throw new Error('请选择清理日期');
  return {
    before,
    disableUnusedInvites: Boolean($('registrationCleanupDisableUnused')?.checked)
  };
}

async function cleanupRegistrationRedemptions() {
  let body;
  try {
    body = readRegistrationCleanupForm();
  } catch (err) {
    setStatus(err?.message || '清理参数不合法', 'err', 2200);
    return;
  }
  const extra = body.disableUnusedInvites ? '，并停用该日期前创建且未使用的邀请码' : '';
  if (!confirm(`确定要清理 ${body.before} 前的兑换记录${extra}吗？`)) return;
  try {
    const resp = await apiFetch('/api/admin/registration/redemptions/cleanup', {
      method: 'POST',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    registrationAdmin = data || {};
    registrationLoaded = true;
    renderRegistrationForm();
    const cleanup = data.cleanup || {};
    setStatus(`已清理 ${Number(cleanup.removedRedemptions) || 0} 条兑换记录，停用 ${Number(cleanup.disabledInvites) || 0} 个未使用邀请码`, 'ok', 2200);
  } catch (err) {
    setStatus(`清理兑换记录失败：${err?.message || err}`, 'err', 2600);
  }
}

export function bindRegistrationPanel() {
  $('registrationForm')?.addEventListener('submit', (ev) => ev.preventDefault());
  $('registrationCleanupForm')?.addEventListener('submit', (ev) => ev.preventDefault());
  $('registrationRefresh')?.addEventListener('click', () => refreshRegistration());
  $('registrationSave')?.addEventListener('click', () => saveRegistrationSettings());
  $('registrationGenerate')?.addEventListener('click', () => generateRegistrationInvites());
  $('registrationResetInvites')?.addEventListener('click', () => resetRegistrationInvites());
  $('registrationCleanup')?.addEventListener('click', () => cleanupRegistrationRedemptions());
  $('registrationInviteTableWrap')?.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-disable-invite]');
    if (!button) return;
    disableRegistrationInvite(button.dataset.disableInvite, button.dataset.inviteLabel);
  });
}
