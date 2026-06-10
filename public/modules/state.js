import { getCurrentUserId } from './auth.js';

const STORAGE_PREFIX = 'image-studio';
const LEGACY_STORAGE_PREFIX = 'image-key-manager';
const storageKey = (suffix) => `${STORAGE_PREFIX}.${suffix}`;

const KEYS = Object.freeze({
  profiles: storageKey('profiles.v3'),
  legacyProfiles: storageKey('profiles.v2'),
  legacyProfilesV1: storageKey('profiles.v1'),
  activeProfile: storageKey('active'),
  interfaceMode: storageKey('interfaceMode.v1'),
  activeTab: storageKey('activeTab'),
  logs: storageKey('logs.v1'),
  logErrorSeenAt: storageKey('logErrorSeenAt.v1'),
  clientLogSyncEnabled: storageKey('clientLogSyncEnabled.v1'),
  clientLogSyncQueue: storageKey('clientLogSyncQueue.v1'),
  jobQueueDismissedDone: storageKey('jobQueueDismissedDone.v1'),
  promptBuilderDraft: storageKey('promptBuilderDraft.v1'),
  promptDraft: storageKey('promptDraft'),
  promptHistory: storageKey('promptHistory.v1'),
  promptManagerTab: storageKey('promptManagerTab'),
  theme: storageKey('theme')
});

function scopedKey(baseKey) {
  const uid = getCurrentUserId() || 'guest';
  return `${baseKey}:${uid}`;
}

export { KEYS };

export function userKey(baseKey) {
  return scopedKey(baseKey);
}

function legacyKeyFor(key) {
  const value = String(key || '');
  const currentPrefix = `${STORAGE_PREFIX}.`;
  if (!value.startsWith(currentPrefix)) return '';
  return `${LEGACY_STORAGE_PREFIX}.${value.slice(currentPrefix.length)}`;
}

function readRawWithLegacyMigration(key) {
  const raw = localStorage.getItem(key);
  if (raw !== null) return raw;

  const legacyKey = legacyKeyFor(key);
  if (!legacyKey) return null;
  const legacyRaw = localStorage.getItem(legacyKey);
  if (legacyRaw === null) return null;
  try { localStorage.setItem(key, legacyRaw); } catch {}
  return legacyRaw;
}

function removeLegacyKey(key) {
  const legacyKey = legacyKeyFor(key);
  if (legacyKey) localStorage.removeItem?.(legacyKey);
}

export function readJson(key, fallback) {
  try {
    const raw = readRawWithLegacyMigration(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    removeLegacyKey(key);
  } catch (err) {
    console.warn('localStorage write failed', err);
  }
}

export function readString(key, fallback = '') {
  return readRawWithLegacyMigration(key) ?? fallback;
}

export function writeString(key, value) {
  localStorage.setItem(key, value ?? '');
  removeLegacyKey(key);
}

export function removeKey(key) {
  localStorage.removeItem?.(key);
  removeLegacyKey(key);
}

export function readJsonScoped(baseKey, fallback) {
  return readJson(scopedKey(baseKey), fallback);
}

export function writeJsonScoped(baseKey, value) {
  writeJson(scopedKey(baseKey), value);
}

export function readStringScoped(baseKey, fallback = '') {
  return readString(scopedKey(baseKey), fallback);
}

export function writeStringScoped(baseKey, value) {
  writeString(scopedKey(baseKey), value);
}

export function removeKeyScoped(baseKey) {
  removeKey(scopedKey(baseKey));
}
