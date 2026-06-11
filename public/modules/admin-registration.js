// ????????????????????????

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';
import {
  registrationInvitesHtml,
  registrationRedemptionsHtml,
  registrationSettings as viewRegistrationSettings,
  registrationSummaryHtml
} from './admin-registration-view.js';

let registrationAdmin = null;
let registrationLoaded = false;
let lastGeneratedRegistrationCodes = [];

export function isRegistrationLoaded() {
  return registrationLoaded;
}

// ---------- 注册管理 ----------

function registrationSettings() {
  return viewRegistrationSettings(registrationAdmin);
}

function renderRegistrationSummary() {
  const host = $('registrationSummary');
  if (!host) return;
  host.innerHTML = registrationSummaryHtml(registrationAdmin);
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
  wrap.innerHTML = registrationInvitesHtml(registrationAdmin);
}

function renderRegistrationRedemptions() {
  const wrap = $('registrationRedemptionTableWrap');
  if (!wrap) return;
  wrap.innerHTML = registrationRedemptionsHtml(registrationAdmin);
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
