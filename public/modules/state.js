// 集中的 localStorage 访问。未来迁云端时，这里的 read/write 替换为 API 即可。

import { getCurrentUserId } from './auth.js';

const KEYS = Object.freeze({
  profiles: 'image-key-manager.profiles.v3',
  legacyProfiles: 'image-key-manager.profiles.v2',
  legacyProfilesV1: 'image-key-manager.profiles.v1',
  activeProfile: 'image-key-manager.active',
  interfaceMode: 'image-key-manager.interfaceMode.v1',
  activeTab: 'image-key-manager.activeTab',
  logs: 'image-key-manager.logs.v1',
  promptBuilderDraft: 'image-key-manager.promptBuilderDraft.v1',
  promptDraft: 'image-key-manager.promptDraft',
  promptHistory: 'image-key-manager.promptHistory.v1',
  promptManagerTab: 'image-key-manager.promptManagerTab',
  theme: 'image-key-manager.theme'
});

// why：同一浏览器可能被多用户共享，需按 userId 隔离存储，防止登出后新用户看到前一位用户的草稿/历史。
// 未登录（登录页加载前的极短窗口）fallback 到 guest，真实数据只有登录后才会产生。
function scopedKey(baseKey) {
  const uid = getCurrentUserId() || 'guest';
  return `${baseKey}:${uid}`;
}

export { KEYS };

// why：暴露 userKey 给偶发场景（如外部工具要手动拼 key），保持与 *Scoped 函数内部实现一致。
export function userKey(baseKey) {
  return scopedKey(baseKey);
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('localStorage 写入失败', err);
  }
}

export function readString(key, fallback = '') {
  return localStorage.getItem(key) ?? fallback;
}

export function writeString(key, value) {
  localStorage.setItem(key, value ?? '');
}

export function removeKey(key) {
  localStorage.removeItem(key);
}

// ---- scoped 变体：自动附加 :<userId> 后缀 ----
// 适用于：profiles / activeProfile / promptDraft / promptHistory /
// promptBuilderDraft / logs / promptManagerTab
// 不适用于：activeTab / theme（全局偏好）

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
