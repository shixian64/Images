// 全局默认接口配置：管理员维护，普通用户默认继承；用户可在前端选择本地覆盖。

import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL } from '../shared/constants.js';
import { systemSettings } from './db.js';
import { maskApiKey } from '../utils/mask.js';

const SETTINGS_KEY = 'interfaces.default';
const DEFAULT_BASE_URL = 'https://api.openai.com';

const ENDPOINT_META = Object.freeze({
  image: { label: '生图', defaultModel: DEFAULT_IMAGE_MODEL },
  chat: { label: '对话', defaultModel: DEFAULT_CHAT_MODEL }
});

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function validateBaseUrl(value) {
  const url = cleanString(value, DEFAULT_BASE_URL).replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('invalid baseUrl');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('invalid baseUrl');
  }
  return url;
}

function defaultEndpoint(kind, overrides = {}) {
  const meta = ENDPOINT_META[kind];
  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    defaultModel: meta.defaultModel,
    testStatus: 'unknown',
    testLatencyMs: null,
    testedAt: null,
    testError: '',
    ...overrides
  };
}

function normalizeEndpoint(kind, value = {}, previous = null) {
  const meta = ENDPOINT_META[kind];
  const current = previous || defaultEndpoint(kind);
  const hasApiKeyPatch = Object.hasOwn(value || {}, 'apiKey');
  const clearApiKey = Boolean(value?.clearApiKey);

  return defaultEndpoint(kind, {
    baseUrl: validateBaseUrl(value?.baseUrl ?? current.baseUrl ?? DEFAULT_BASE_URL),
    apiKey: clearApiKey
      ? ''
      : (hasApiKeyPatch ? cleanString(value.apiKey, '') : cleanString(current.apiKey, '')),
    defaultModel: cleanString(value?.defaultModel ?? current.defaultModel, meta.defaultModel),
    testStatus: cleanString(value?.testStatus ?? current.testStatus, 'unknown'),
    testLatencyMs: value?.testLatencyMs === undefined ? (current.testLatencyMs ?? null) : value.testLatencyMs,
    testedAt: value?.testedAt === undefined ? (current.testedAt ?? null) : value.testedAt,
    testError: cleanString(value?.testError ?? current.testError, '')
  });
}

function normalizeConfig(value = {}, previous = null) {
  const current = previous || {
    enabled: true,
    name: '示例接口',
    image: defaultEndpoint('image'),
    chat: defaultEndpoint('chat'),
    updatedAt: null,
    updatedBy: null
  };

  return {
    enabled: value?.enabled === undefined ? current.enabled !== false : Boolean(value.enabled),
    name: cleanString(value?.name ?? current.name, '示例接口').slice(0, 80),
    image: normalizeEndpoint('image', value?.image || {}, current.image),
    chat: normalizeEndpoint('chat', value?.chat || {}, current.chat),
    updatedAt: value?.updatedAt || current.updatedAt || null,
    updatedBy: value?.updatedBy || current.updatedBy || null
  };
}

function publicEndpoint(endpoint) {
  return {
    ...endpoint,
    apiKey: '',
    hasApiKey: Boolean(endpoint.apiKey),
    maskedApiKey: maskApiKey(endpoint.apiKey)
  };
}

export function publicInterfaceConfig(config) {
  const normalized = normalizeConfig(config);
  return {
    ...normalized,
    image: publicEndpoint(normalized.image),
    chat: publicEndpoint(normalized.chat),
    ready: Boolean(normalized.enabled && normalized.image.apiKey && normalized.chat.apiKey)
  };
}

export function getGlobalInterfaceConfig({ publicView = false } = {}) {
  const stored = systemSettings.get(SETTINGS_KEY);
  const normalized = normalizeConfig(stored || {});
  return publicView ? publicInterfaceConfig(normalized) : normalized;
}

export function setGlobalInterfaceConfig(patch = {}, updatedBy = '') {
  const current = getGlobalInterfaceConfig();
  const next = normalizeConfig({
    ...patch,
    image: { ...(patch.image || {}) },
    chat: { ...(patch.chat || {}) },
    updatedAt: nowIso(),
    updatedBy: updatedBy || current.updatedBy || null
  }, current);
  systemSettings.set(SETTINGS_KEY, next, updatedBy || null);
  return next;
}

export function getSystemEndpoint(kind) {
  const meta = ENDPOINT_META[kind];
  if (!meta) throw new Error('invalid interface kind');

  const config = getGlobalInterfaceConfig();
  if (config.enabled === false) throw new Error('系统默认接口已停用，请联系管理员或启用个人覆盖。');

  const endpoint = config[kind] || defaultEndpoint(kind);
  if (!endpoint.apiKey) {
    throw new Error(`系统默认${meta.label}接口缺少 API Key，请联系管理员或启用个人覆盖。`);
  }
  return {
    name: config.name || '系统默认接口',
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    defaultModel: endpoint.defaultModel
  };
}

export function interfaceDefaultsKey() {
  return SETTINGS_KEY;
}

