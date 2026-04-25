// Profiles 面板：CRUD + 生图/对话两套上游配置 + 连通性测试 + 概览统计。

import { $, $$, escapeHtml, maskKey, setStatus } from './dom.js';
import { KEYS, readJson, writeJson, readString, writeString } from './state.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL } from '../../shared/constants.js';
import { addLog } from './logs.js';

const STATUS_LABEL = { active: '启用', draft: '草稿', paused: '暂停' };
const DEFAULT_BASE_URL = 'https://api.openai.com';

const ENDPOINT_META = Object.freeze({
  image: { label: '生图', prefix: 'image', defaultModel: DEFAULT_IMAGE_MODEL },
  chat: { label: '对话', prefix: 'chat', defaultModel: DEFAULT_CHAT_MODEL }
});

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function defaultEndpoint(kind, overrides = {}) {
  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    defaultModel: ENDPOINT_META[kind].defaultModel,
    testStatus: 'unknown',   // ok | err | busy | unknown
    testLatencyMs: null,
    testedAt: null,
    testError: '',
    ...overrides
  };
}

function normalizeEndpoint(profile = {}, kind) {
  const nested = profile[kind] && typeof profile[kind] === 'object' ? profile[kind] : {};

  if (kind === 'image') {
    return defaultEndpoint('image', {
      baseUrl: firstDefined(nested.baseUrl, profile.imageBaseUrl, profile.baseUrl, DEFAULT_BASE_URL),
      apiKey: firstDefined(nested.apiKey, profile.imageApiKey, profile.apiKey, ''),
      defaultModel: firstDefined(nested.defaultModel, profile.imageDefaultModel, profile.defaultModel, DEFAULT_IMAGE_MODEL),
      testStatus: firstDefined(nested.testStatus, profile.imageTestStatus, profile.testStatus, 'unknown'),
      testLatencyMs: firstDefined(nested.testLatencyMs, profile.imageTestLatencyMs, profile.testLatencyMs, null),
      testedAt: firstDefined(nested.testedAt, profile.imageTestedAt, profile.testedAt, null),
      testError: firstDefined(nested.testError, profile.imageTestError, profile.testError, '')
    });
  }

  return defaultEndpoint('chat', {
    // 旧数据没有对话配置时，默认复用原接口地址/Key，避免升级后需要重新填写。
    baseUrl: firstDefined(nested.baseUrl, profile.chatBaseUrl, profile.baseUrl, profile.image?.baseUrl, DEFAULT_BASE_URL),
    apiKey: firstDefined(nested.apiKey, profile.chatApiKey, profile.apiKey, profile.image?.apiKey, ''),
    defaultModel: firstDefined(nested.defaultModel, profile.chatDefaultModel, profile.chatModel, DEFAULT_CHAT_MODEL),
    testStatus: firstDefined(nested.testStatus, profile.chatTestStatus, 'unknown'),
    testLatencyMs: firstDefined(nested.testLatencyMs, profile.chatTestLatencyMs, null),
    testedAt: firstDefined(nested.testedAt, profile.chatTestedAt, null),
    testError: firstDefined(nested.testError, profile.chatTestError, '')
  });
}

function withImageAliases(profile) {
  // 保留旧字段，便于历史日志/旧模块读取；真实配置以 image/chat 两段为准。
  return {
    ...profile,
    baseUrl: profile.image.baseUrl,
    apiKey: profile.image.apiKey,
    defaultModel: profile.image.defaultModel,
    testStatus: profile.image.testStatus,
    testLatencyMs: profile.image.testLatencyMs,
    testedAt: profile.image.testedAt,
    testError: profile.image.testError
  };
}

function normalize(profile = {}) {
  const image = normalizeEndpoint(profile, 'image');
  const chat = normalizeEndpoint(profile, 'chat');
  return withImageAliases({
    id: profile.id || createId(),
    name: profile.name || 'OpenAI 官方',
    status: profile.status || 'active',
    image,
    chat
  });
}

function defaultProfile(overrides = {}) {
  return normalize({
    id: createId(),
    name: 'OpenAI 官方',
    status: 'active',
    ...overrides
  });
}

function loadProfiles() {
  const raw = readJson(KEYS.profiles, null)
    || readJson(KEYS.legacyProfiles, null)
    || readJson(KEYS.legacyProfilesV1, null);
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

function getEndpoint(profile, kind) {
  return profile?.[kind] || defaultEndpoint(kind);
}

export function getImageConfig(profile = getActiveProfile()) {
  return getEndpoint(profile, 'image');
}

export function getChatConfig(profile = getActiveProfile()) {
  return getEndpoint(profile, 'chat');
}

function persist() {
  profiles = profiles.map(normalize);
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
        <strong>${escapeHtml(p.name || '未命名')}</strong>
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
  const activeCount = profiles.filter((p) => p.status === 'active').length;
  const p = getActiveProfile();
  const image = getImageConfig(p);
  const chat = getChatConfig(p);
  $('profileSummary').innerHTML = `
    <div><span>接口总数</span><strong>${profiles.length}</strong></div>
    <div><span>启用接口</span><strong>${activeCount}</strong></div>
    <div><span>当前接口</span><strong>${escapeHtml(p?.name || '未命名')}</strong></div>
    <div><span>生图模型</span><strong>${escapeHtml(image.defaultModel || '-')}</strong></div>
    <div><span>对话模型</span><strong>${escapeHtml(chat.defaultModel || '-')}</strong></div>
    <div><span>生图密钥</span><strong>${escapeHtml(maskKey(image.apiKey))}</strong></div>
    <div><span>对话密钥</span><strong>${escapeHtml(maskKey(chat.apiKey))}</strong></div>
  `;
}

function renderEndpointTestResult(kind) {
  const p = getActiveProfile();
  const endpoint = getEndpoint(p, kind);
  const el = $(`${kind}TestResult`);
  if (!el) return;
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    el.dataset.state = 'idle';
    el.textContent = '未测试';
    return;
  }
  if (endpoint.testStatus === 'ok') {
    el.dataset.state = 'ok';
    el.textContent = `OK · ${endpoint.testLatencyMs ?? '?'}ms`;
  } else if (endpoint.testStatus === 'busy') {
    el.dataset.state = 'busy';
    el.textContent = '测试中…';
  } else {
    el.dataset.state = 'err';
    el.textContent = `失败 · ${endpoint.testError || '未知错误'}`;
  }
}

function renderTestResult() {
  renderEndpointTestResult('image');
  renderEndpointTestResult('chat');
}

function fillEndpointForm(kind, endpoint) {
  const { prefix } = ENDPOINT_META[kind];
  $(`${prefix}BaseUrl`).value = endpoint.baseUrl || DEFAULT_BASE_URL;
  $(`${prefix}ApiKey`).value = endpoint.apiKey || '';
  $(`${prefix}DefaultModel`).value = endpoint.defaultModel || ENDPOINT_META[kind].defaultModel;
}

function fillForm() {
  const p = getActiveProfile();
  if (!p) return;
  $('profileName').value = p.name || '';
  $('profileStatus').value = p.status || 'active';
  fillEndpointForm('image', getImageConfig(p));
  fillEndpointForm('chat', getChatConfig(p));
}

function readEndpointForm(kind, currentEndpoint) {
  const { prefix, defaultModel } = ENDPOINT_META[kind];
  const next = {
    ...currentEndpoint,
    baseUrl: $(`${prefix}BaseUrl`).value.trim() || DEFAULT_BASE_URL,
    apiKey: $(`${prefix}ApiKey`).value.trim(),
    defaultModel: $(`${prefix}DefaultModel`).value.trim() || defaultModel
  };

  const connectionChanged = next.baseUrl !== currentEndpoint.baseUrl || next.apiKey !== currentEndpoint.apiKey;
  if (connectionChanged) {
    next.testStatus = 'unknown';
    next.testLatencyMs = null;
    next.testedAt = null;
    next.testError = '';
  }
  return next;
}

function readFormProfile() {
  const current = getActiveProfile() || defaultProfile();
  return normalize({
    ...current,
    id: activeId || createId(),
    name: $('profileName').value.trim() || '未命名配置',
    status: $('profileStatus').value,
    image: readEndpointForm('image', getImageConfig(current)),
    chat: readEndpointForm('chat', getChatConfig(current))
  });
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
  addLog('info', 'profile.saved', {
    name: next.name,
    imageBaseUrl: next.image.baseUrl,
    imageModel: next.image.defaultModel,
    chatBaseUrl: next.chat.baseUrl,
    chatModel: next.chat.defaultModel,
    status: next.status
  });
  setStatus('配置已保存', 'ok', 1600);
}

function createDraft() {
  const next = defaultProfile({
    name: '新接口配置',
    status: 'draft'
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

function upsertProfile(next) {
  const i = profiles.findIndex((p) => p.id === next.id);
  if (i >= 0) profiles[i] = normalize(next);
  else profiles.push(normalize(next));
  activeId = next.id;
}

async function testConnection(kind) {
  const meta = ENDPOINT_META[kind];
  const form = readFormProfile();
  const endpoint = getEndpoint(form, kind);

  try { new URL(endpoint.baseUrl); } catch {
    setStatus(`${meta.label} Base URL 格式不正确`, 'err', 2000);
    return;
  }
  if (!endpoint.apiKey) {
    setStatus(`请先填写${meta.label} API Key`, 'err', 2000);
    return;
  }

  upsertProfile({
    ...form,
    [kind]: { ...endpoint, testStatus: 'busy', testError: '' }
  });
  renderTestResult();
  setStatus(`${meta.label}测试中…`, 'busy');

  try {
    const resp = await fetch('/api/test-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        kind,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const next = normalize({
      ...form,
      [kind]: {
        ...endpoint,
        testStatus: 'ok',
        testLatencyMs: data.durationMs ?? null,
        testedAt: new Date().toISOString(),
        testError: ''
      }
    });
    upsertProfile(next);
    persist();
    renderAll();
    addLog('info', 'profile.test.ok', {
      kind: meta.label,
      name: form.name,
      baseUrl: endpoint.baseUrl,
      durationMs: data.durationMs,
      modelCount: data.modelCount
    });
    setStatus(`${meta.label}连接成功 · ${data.modelCount} 个模型`, 'ok', 2400);
  } catch (err) {
    const next = normalize({
      ...form,
      [kind]: {
        ...endpoint,
        testStatus: 'err',
        testLatencyMs: null,
        testedAt: new Date().toISOString(),
        testError: err.message || String(err)
      }
    });
    upsertProfile(next);
    persist();
    renderAll();
    addLog('error', 'profile.test.failed', {
      kind: meta.label,
      name: form.name,
      baseUrl: endpoint.baseUrl,
      error: err.message || String(err)
    });
    setStatus(`${meta.label}连接失败`, 'err', 2400);
  }
}

async function testAllConnections() {
  await testConnection('image');
  await testConnection('chat');
}

export function mountProfilesPanel() {
  $('saveProfile').addEventListener('click', save);
  $('newProfile').addEventListener('click', createDraft);
  $('deleteProfile').addEventListener('click', remove);
  $('testProfile')?.addEventListener('click', testAllConnections);
  $('testImageProfile')?.addEventListener('click', () => testConnection('image'));
  $('testChatProfile')?.addEventListener('click', () => testConnection('chat'));
  renderAll();
}
