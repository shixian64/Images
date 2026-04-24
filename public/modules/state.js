// 集中的 localStorage 访问。未来迁云端时，这里的 read/write 替换为 API 即可。

const KEYS = Object.freeze({
  profiles: 'image-key-manager.profiles.v3',
  legacyProfiles: 'image-key-manager.profiles.v2',
  legacyProfilesV1: 'image-key-manager.profiles.v1',
  activeProfile: 'image-key-manager.active',
  activeTab: 'image-key-manager.activeTab',
  logs: 'image-key-manager.logs.v1',
  promptBuilderDraft: 'image-key-manager.promptBuilderDraft.v1',
  promptDraft: 'image-key-manager.promptDraft',
  promptHistory: 'image-key-manager.promptHistory.v1',
  promptManagerTab: 'image-key-manager.promptManagerTab',
  theme: 'image-key-manager.theme'
});

export { KEYS };

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
