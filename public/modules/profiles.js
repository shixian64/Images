// Profiles 面板：CRUD + 生图/对话两套上游配置 + 连通性测试 + 概览统计。

import { $, $$, setStatus } from './dom.js';
import {
  KEYS,
  readJsonScoped, writeJsonScoped,
  readStringScoped, writeStringScoped,
  removeKeyScoped
} from './state.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL } from '../../shared/constants.js';
import { addLog } from './logs.js';
import { apiFetch } from './auth.js';
import {
  endpointTestResultView,
  profileListHtml,
  profileSummaryHtml,
  systemDefaultCardHtml
} from './profiles-view.js';

const STATUS_LABEL = { active: '启用', draft: '草稿', paused: '暂停' };
const DEFAULT_BASE_URL = 'https://api.openai.com';

const ENDPOINT_META = Object.freeze({
  image: { label: '生图', prefix: 'image', defaultModel: DEFAULT_IMAGE_MODEL },
  chat: { label: '对话', prefix: 'chat', defaultModel: DEFAULT_CHAT_MODEL }
});

const INTERFACE_MODE = Object.freeze({
  system: 'system',
  custom: 'custom'
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

function withoutPersistedSecrets(profile = {}) {
  const copy = { ...profile };
  delete copy.apiKey;
  delete copy.imageApiKey;
  delete copy.chatApiKey;
  if (copy.image && typeof copy.image === 'object') copy.image = { ...copy.image, apiKey: '' };
  if (copy.chat && typeof copy.chat === 'object') copy.chat = { ...copy.chat, apiKey: '' };
  return copy;
}

function stripProfileSecrets(profile = {}) {
  const image = profile.image && typeof profile.image === 'object'
    ? { ...profile.image, apiKey: '' }
    : profile.image;
  const chat = profile.chat && typeof profile.chat === 'object'
    ? { ...profile.chat, apiKey: '' }
    : profile.chat;
  const stripped = {
    ...profile,
    image,
    chat,
    apiKey: '',
    imageApiKey: '',
    chatApiKey: ''
  };
  if (stripped.image) stripped.baseUrl = stripped.image.baseUrl || stripped.baseUrl;
  if (stripped.image) stripped.defaultModel = stripped.image.defaultModel || stripped.defaultModel;
  return stripped;
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

function exampleProfile() {
  return defaultProfile({
    name: '示例接口（个人覆盖）',
    status: 'draft',
    image: defaultEndpoint('image'),
    chat: defaultEndpoint('chat')
  });
}

function normalizeSystemDefault(raw = {}) {
  const enabled = raw.enabled !== false;
  const image = raw.image && typeof raw.image === 'object' ? raw.image : {};
  const chat = raw.chat && typeof raw.chat === 'object' ? raw.chat : {};
  const profile = normalize({
    id: 'system-default',
    name: raw.name || '系统默认接口',
    status: enabled ? 'active' : 'paused',
    image: defaultEndpoint('image', {
      baseUrl: image.baseUrl || DEFAULT_BASE_URL,
      apiKey: '',
      hasApiKey: image.hasApiKey === undefined ? null : Boolean(image.hasApiKey),
      maskedApiKey: image.maskedApiKey || '',
      defaultModel: image.defaultModel || DEFAULT_IMAGE_MODEL,
      testStatus: image.testStatus || 'unknown',
      testLatencyMs: image.testLatencyMs ?? null,
      testedAt: image.testedAt || null,
      testError: image.testError || ''
    }),
    chat: defaultEndpoint('chat', {
      baseUrl: chat.baseUrl || DEFAULT_BASE_URL,
      apiKey: '',
      hasApiKey: chat.hasApiKey === undefined ? null : Boolean(chat.hasApiKey),
      maskedApiKey: chat.maskedApiKey || '',
      defaultModel: chat.defaultModel || DEFAULT_CHAT_MODEL,
      testStatus: chat.testStatus || 'unknown',
      testLatencyMs: chat.testLatencyMs ?? null,
      testedAt: chat.testedAt || null,
      testError: chat.testError || ''
    })
  });
  return {
    ...profile,
    isSystemDefault: true,
    enabled,
    ready: Boolean(raw.ready),
    capabilities: {
      image: Boolean(raw.capabilities?.image),
      chat: Boolean(raw.capabilities?.chat)
    },
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null
  };
}

function fallbackSystemDefault() {
  return normalizeSystemDefault({
    enabled: true,
    name: '系统默认接口',
    image: { baseUrl: DEFAULT_BASE_URL, defaultModel: DEFAULT_IMAGE_MODEL, hasApiKey: null },
    chat: { baseUrl: DEFAULT_BASE_URL, defaultModel: DEFAULT_CHAT_MODEL, hasApiKey: null }
  });
}

function loadProfiles() {
  // why：legacy 历史数据跨用户共享是历史包袱，只做新用户的空态回退；新数据按 userId 隔离存储。
  const raw = readJsonScoped(KEYS.profiles, null)
    || readJsonScoped(KEYS.legacyProfiles, null)
    || readJsonScoped(KEYS.legacyProfilesV1, null);
  if (!Array.isArray(raw) || !raw.length) return [exampleProfile()];
  return raw.map((item) => normalize(withoutPersistedSecrets(item)));
}

// why：此处不立即 loadProfiles()，因 ES module 顶层执行时当前用户尚未就绪；
// 留到 mountProfilesPanel() 阶段再载入，此时 app.js 已 setCurrentUser(me)。
let profiles = [defaultProfile()];
let activeId = profiles[0].id;
let profilesInitialized = false;
let interfaceMode = INTERFACE_MODE.system;
let systemDefault = fallbackSystemDefault();
let systemDefaultLoaded = false;

function initProfilesIfNeeded() {
  if (profilesInitialized) return;
  profilesInitialized = true;
  profiles = loadProfiles();
  activeId = readStringScoped(KEYS.activeProfile, '') || profiles[0].id;
  interfaceMode = readStringScoped(KEYS.interfaceMode, INTERFACE_MODE.system) === INTERFACE_MODE.custom
    ? INTERFACE_MODE.custom
    : INTERFACE_MODE.system;
  if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id;
  persistStoredProfiles();
}

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

export function getInterfaceMode() {
  return interfaceMode;
}

export function usesSystemDefault() {
  return interfaceMode !== INTERFACE_MODE.custom;
}

export function getSystemDefaultProfile() {
  return systemDefault || fallbackSystemDefault();
}

export function getEffectiveProfile() {
  return usesSystemDefault() ? getSystemDefaultProfile() : getActiveProfile();
}

function getEndpoint(profile, kind) {
  return profile?.[kind] || defaultEndpoint(kind);
}

export function getImageConfig(profile = getActiveProfile()) {
  return getEndpoint(profile, 'image');
}

export function getChatConfig(profile = getActiveProfile()) {
  return getEndpoint(profile, 'chat');
}

async function refreshSystemDefault({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/interfaces/default', { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    systemDefault = normalizeSystemDefault(data.default || {});
    systemDefaultLoaded = true;
    renderAll();
    if (!silent) setStatus('系统默认接口已刷新', 'ok', 1400);
  } catch (err) {
    systemDefaultLoaded = true;
    if (!silent) setStatus(`刷新系统默认失败：${err?.message || err}`, 'err', 2200);
    renderAll();
  }
}

export function refreshSystemDefaultProfile(options) {
  return refreshSystemDefault(options);
}

function persistStoredProfiles() {
  writeJsonScoped(KEYS.profiles, profiles.map(stripProfileSecrets));
  removeKeyScoped(KEYS.legacyProfiles);
  removeKeyScoped(KEYS.legacyProfilesV1);
}

function persist() {
  profiles = profiles.map(normalize);
  persistStoredProfiles();
  writeStringScoped(KEYS.activeProfile, activeId);
  writeStringScoped(KEYS.interfaceMode, interfaceMode);
  emit();
}

// ---- 渲染 ----

function renderSystemDefaultCard() {
  const card = $('systemDefaultCard');
  const checkbox = $('overrideSystemDefault');
  if (checkbox) checkbox.checked = !usesSystemDefault();
  if (!card) return;

  const sys = getSystemDefaultProfile();
  const image = getImageConfig(sys);
  const chat = getChatConfig(sys);
  card.innerHTML = systemDefaultCardHtml(sys, {
    image,
    chat,
    systemMode: usesSystemDefault(),
    loaded: systemDefaultLoaded
  });
}

function renderProfileMode() {
  const custom = !usesSystemDefault();
  const form = $('profileForm');
  form?.classList.toggle('is-muted', !custom);
  form?.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = !custom;
  });
  for (const id of ['newProfile']) {
    const el = $(id);
    if (el) el.disabled = !custom;
  }
}

function renderList() {
  $('profileList').innerHTML = profileListHtml(profiles, { activeId });

  $$('.profile-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeId = btn.dataset.id;
      persist();
      renderAll();
    });
  });
}

function renderSummary() {
  const p = getEffectiveProfile();
  const image = getImageConfig(p);
  const chat = getChatConfig(p);
  const systemMode = usesSystemDefault();
  $('profileSummary').innerHTML = profileSummaryHtml(profiles, {
    effectiveProfile: p,
    image,
    chat,
    systemMode
  });
}

function renderEndpointTestResult(kind) {
  const p = getActiveProfile();
  const endpoint = getEndpoint(p, kind);
  const el = $(`${kind}TestResult`);
  if (!el) return;
  const view = endpointTestResultView(endpoint);
  el.dataset.state = view.state;
  el.textContent = view.text;
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
  renderSystemDefaultCard();
  renderList();
  fillForm();
  renderSummary();
  renderTestResult();
  renderProfileMode();
  emit();
}

// ---- 动作 ----

function save() {
  const next = readFormProfile();
  const hasRuntimeSecrets = Boolean(next.image?.apiKey || next.chat?.apiKey);
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
  setStatus(
    hasRuntimeSecrets
      ? '非密钥配置已保存；API Key 仅保留在当前页面，刷新后需重新填写。'
      : '配置已保存',
    'ok',
    hasRuntimeSecrets ? 3200 : 1600
  );
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

function setInterfaceMode(nextMode) {
  interfaceMode = nextMode === INTERFACE_MODE.custom ? INTERFACE_MODE.custom : INTERFACE_MODE.system;
  writeStringScoped(KEYS.interfaceMode, interfaceMode);
  renderAll();
  setStatus(
    usesSystemDefault() ? '已切换为使用系统默认接口' : '已启用个人接口覆盖',
    'ok',
    1600
  );
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
    const resp = await apiFetch('/api/test-profile', {
      method: 'POST',
      body: {
        name: form.name,
        kind,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
      }
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
  initProfilesIfNeeded();
  $('profileForm')?.addEventListener('submit', (ev) => ev.preventDefault());
  $('saveProfile').addEventListener('click', save);
  $('newProfile').addEventListener('click', createDraft);
  $('deleteProfile').addEventListener('click', remove);
  $('overrideSystemDefault')?.addEventListener('change', (ev) => {
    setInterfaceMode(ev.target.checked ? INTERFACE_MODE.custom : INTERFACE_MODE.system);
  });
  $('refreshSystemDefault')?.addEventListener('click', () => refreshSystemDefault());
  $('testProfile')?.addEventListener('click', testAllConnections);
  $('testImageProfile')?.addEventListener('click', () => testConnection('image'));
  $('testChatProfile')?.addEventListener('click', () => testConnection('chat'));
  window.addEventListener('system-default-interface-updated', () => refreshSystemDefault({ silent: true }));
  renderAll();
  refreshSystemDefault({ silent: true });
}
