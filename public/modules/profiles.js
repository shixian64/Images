// Profiles 面板：CRUD + 连通性测试 + 概览统计。
// 旧 app.js 的商业字段全部保留（租户 / plan / budget / quota），
// 只是在 UI 里放进了 "高级" 折叠区（§5.1 渐进式展开）。

import { $, $$, escapeHtml, maskKey, numberOrEmpty, readNumber, setStatus } from './dom.js';
import { KEYS, readJson, writeJson, readString, writeString } from './state.js';
import { DEFAULT_MODEL } from '../../shared/constants.js';
import { addLog } from './logs.js';

const STATUS_LABEL = { active: '启用', draft: '草稿', paused: '暂停' };
const PLAN_LABEL = { free: 'Free', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };

function defaultProfile(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    defaultModel: DEFAULT_MODEL,
    status: 'active',
    environment: 'production',
    tenant: '默认租户',
    owner: 'Admin',
    visibility: 'admin',
    plan: 'pro',
    monthlyBudget: 100,
    monthlyQuota: 1000,
    dailyUserQuota: 50,
    rateLimit: 60,
    billingTag: 'cost-center:image',
    notes: '',
    testStatus: 'unknown',   // ok | err | unknown
    testLatencyMs: null,
    testedAt: null,
    ...overrides
  };
}

function normalize(profile) {
  return { ...defaultProfile(), ...profile, id: profile.id || crypto.randomUUID() };
}

function loadProfiles() {
  const raw = readJson(KEYS.profiles, null) || readJson(KEYS.legacyProfiles, null);
  if (!Array.isArray(raw) || !raw.length) return [defaultProfile()];
  return raw.map(normalize);
}

let profiles = loadProfiles();
let activeId = readString(KEYS.activeProfile, '') || profiles[0].id;
if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id;

const listeners = new Set();

export function onProfilesChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { for (const fn of listeners) fn(); }

export function getActiveProfile() {
  return profiles.find((p) => p.id === activeId) || profiles[0];
}

export function getProfiles() { return profiles.slice(); }

function persist() {
  writeJson(KEYS.profiles, profiles);
  writeString(KEYS.activeProfile, activeId);
  emit();
}

// ---- 渲染 ----

function renderList() {
  $('profileList').innerHTML = profiles.map((p) => {
    const active = p.id === activeId ? ' active' : '';
    return `<li>
      <button class="profile-item${active}" data-id="${escapeHtml(p.id)}">
        <span>
          <strong>${escapeHtml(p.name || '未命名')}</strong>
          <small>${escapeHtml(p.tenant || '无租户')} · ${escapeHtml(PLAN_LABEL[p.plan] || p.plan)}</small>
        </span>
        <em class="badge ${escapeHtml(p.status)}">${escapeHtml(STATUS_LABEL[p.status] || p.status)}</em>
      </button>
    </li>`;
  }).join('');

  $$('.profile-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeId = btn.dataset.id;
      persist();
      renderAll();
    });
  });
}

function renderSummary() {
  const totalBudget = profiles.reduce((sum, p) => sum + (Number(p.monthlyBudget) || 0), 0);
  const totalQuota = profiles.reduce((sum, p) => sum + (Number(p.monthlyQuota) || 0), 0);
  const activeCount = profiles.filter((p) => p.status === 'active').length;
  const p = getActiveProfile();
  $('commercialSummary').innerHTML = `
    <div><span>接口总数</span><strong>${profiles.length}</strong></div>
    <div><span>启用接口</span><strong>${activeCount}</strong></div>
    <div><span>月预算</span><strong>$${totalBudget}</strong></div>
    <div><span>月额度</span><strong>${totalQuota}</strong></div>
    <div><span>当前租户</span><strong>${escapeHtml(p?.tenant || '默认租户')}</strong></div>
    <div><span>密钥</span><strong>${escapeHtml(maskKey(p?.apiKey))}</strong></div>
  `;
}

function renderTestResult() {
  const p = getActiveProfile();
  const el = $('testResult');
  if (!p || !p.testStatus || p.testStatus === 'unknown') {
    el.dataset.state = 'idle';
    el.textContent = '未测试';
    return;
  }
  if (p.testStatus === 'ok') {
    el.dataset.state = 'ok';
    el.textContent = `OK · ${p.testLatencyMs ?? '?'}ms`;
  } else if (p.testStatus === 'busy') {
    el.dataset.state = 'busy';
    el.textContent = '测试中…';
  } else {
    el.dataset.state = 'err';
    el.textContent = `失败 · ${p.testError || '未知错误'}`;
  }
}

function fillForm() {
  const p = getActiveProfile();
  if (!p) return;
  $('profileName').value = p.name || '';
  $('profileStatus').value = p.status || 'active';
  $('baseUrl').value = p.baseUrl || 'https://api.openai.com';
  $('apiKey').value = p.apiKey || '';
  $('defaultModel').value = p.defaultModel || DEFAULT_MODEL;
  $('tenant').value = p.tenant || '';
  $('owner').value = p.owner || '';
  $('visibility').value = p.visibility || 'admin';
  $('plan').value = p.plan || 'free';
  $('monthlyBudget').value = numberOrEmpty(p.monthlyBudget);
  $('monthlyQuota').value = numberOrEmpty(p.monthlyQuota);
  $('dailyUserQuota').value = numberOrEmpty(p.dailyUserQuota);
  $('rateLimit').value = numberOrEmpty(p.rateLimit);
  $('billingTag').value = p.billingTag || '';
  $('notes').value = p.notes || '';
}

function readFormProfile() {
  const current = getActiveProfile() || defaultProfile();
  return {
    ...current,
    id: activeId || crypto.randomUUID(),
    name: $('profileName').value.trim() || '未命名配置',
    status: $('profileStatus').value,
    baseUrl: $('baseUrl').value.trim() || 'https://api.openai.com',
    apiKey: $('apiKey').value.trim(),
    defaultModel: $('defaultModel').value.trim() || DEFAULT_MODEL,
    tenant: $('tenant').value.trim() || '默认租户',
    owner: $('owner').value.trim(),
    visibility: $('visibility').value,
    plan: $('plan').value,
    monthlyBudget: readNumber('monthlyBudget'),
    monthlyQuota: readNumber('monthlyQuota'),
    dailyUserQuota: readNumber('dailyUserQuota'),
    rateLimit: readNumber('rateLimit'),
    billingTag: $('billingTag').value.trim(),
    notes: $('notes').value.trim()
  };
}

function renderAll() {
  if (!profiles.length) {
    profiles = [defaultProfile()];
    activeId = profiles[0].id;
  }
  if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id;
  renderList();
  fillForm();
  renderSummary();
  renderTestResult();
  emit();
}

// ---- 动作 ----

function save() {
  const next = readFormProfile();
  const index = profiles.findIndex((p) => p.id === next.id);
  if (index >= 0) profiles[index] = next;
  else profiles.push(next);
  activeId = next.id;
  persist();
  renderAll();
  addLog('info', 'profile.saved', { name: next.name, baseUrl: next.baseUrl, status: next.status });
  setStatus('配置已保存', 'ok', 1600);
}

function createDraft() {
  const next = normalize({
    name: '新接口配置', baseUrl: 'https://api.openai.com',
    apiKey: '', status: 'draft', plan: 'free',
    monthlyBudget: 0, monthlyQuota: 0, dailyUserQuota: 0, rateLimit: 0
  });
  profiles.push(next);
  activeId = next.id;
  persist();
  renderAll();
  setStatus('已新建草稿', 'ok', 1600);
}

function remove() {
  if (profiles.length <= 1) {
    setStatus('至少保留一个配置', 'err', 1600);
    return;
  }
  if (!confirm('确认删除该配置？')) return;
  const removed = profiles.find((p) => p.id === activeId);
  profiles = profiles.filter((p) => p.id !== activeId);
  activeId = profiles[0]?.id;
  persist();
  renderAll();
  if (removed) addLog('warn', 'profile.deleted', { name: removed.name });
  setStatus('配置已删除', 'ok', 1600);
}

async function testConnection() {
  const form = readFormProfile();
  // 先校验格式
  try { new URL(form.baseUrl); } catch {
    setStatus('Base URL 格式不正确', 'err', 2000);
    return;
  }
  if (!form.apiKey) {
    setStatus('请先填写 API Key', 'err', 2000);
    return;
  }
  const idx = profiles.findIndex((p) => p.id === form.id);
  if (idx >= 0) profiles[idx] = { ...profiles[idx], testStatus: 'busy' };
  renderTestResult();
  setStatus('测试中…', 'busy');

  try {
    const resp = await fetch('/api/test-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.name, baseUrl: form.baseUrl, apiKey: form.apiKey })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const next = {
      ...form,
      testStatus: 'ok',
      testLatencyMs: data.durationMs ?? null,
      testedAt: new Date().toISOString(),
      testError: ''
    };
    const i = profiles.findIndex((p) => p.id === next.id);
    if (i >= 0) profiles[i] = next; else profiles.push(next);
    persist();
    renderAll();
    addLog('info', 'profile.test.ok', { name: form.name, durationMs: data.durationMs, modelCount: data.modelCount });
    setStatus(`连接成功 · ${data.modelCount} 个模型`, 'ok', 2400);
  } catch (err) {
    const next = {
      ...form,
      testStatus: 'err',
      testLatencyMs: null,
      testedAt: new Date().toISOString(),
      testError: err.message || String(err)
    };
    const i = profiles.findIndex((p) => p.id === next.id);
    if (i >= 0) profiles[i] = next; else profiles.push(next);
    persist();
    renderAll();
    addLog('error', 'profile.test.failed', { name: form.name, error: err.message || String(err) });
    setStatus('连接失败', 'err', 2400);
  }
}

export function mountProfilesPanel() {
  $('saveProfile').addEventListener('click', save);
  $('newProfile').addEventListener('click', createDraft);
  $('deleteProfile').addEventListener('click', remove);
  $('testProfile').addEventListener('click', testConnection);
  renderAll();
}
