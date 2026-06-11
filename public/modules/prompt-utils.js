import { t } from './i18n.js';

export const MAX_PROMPT_HISTORY = 160;
export const MAX_PROMPT_EXAMPLE_IMAGES = 4;
export const PROMPT_EXAMPLE_ACCEPT = 'image/png,image/jpeg,image/webp';

export const BUILDER_FIELDS = [
  ['title', 'promptTitleInput'],
  ['tags', 'promptTagsInput'],
  ['subject', 'promptSubjectInput'],
  ['style', 'promptStyleInput'],
  ['composition', 'promptCompositionInput'],
  ['lighting', 'promptLightingInput'],
  ['palette', 'promptPaletteInput'],
  ['text', 'promptTextInput'],
  ['negative', 'promptNegativeInput'],
  ['composed', 'promptComposedOutput']
];

export function createPromptId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeTags(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(/[，,\n#]+/);
  return Array.from(new Set(list.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 8);
}

export function mergeTags(a, b) {
  return Array.from(new Set([...normalizeTags(a), ...normalizeTags(b)])).slice(0, 8);
}

export function deriveTitle(prompt) {
  const firstLine = String(prompt || '').trim().split(/\n+/)[0] || t('prompt.untitled');
  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
}

export function sourceLabel(source) {
  return t(`prompt.source.${source}`, {}, t('prompt.source.manual'));
}

export function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function buildLargeSquarePreviewUrl(url) {
  if (!url) return '';
  const source = String(url);
  if (!source.includes('/cdn-cgi/image/')) return source;

  return source
    .replace(/(width(?:%3D|=))\d+/i, (_match, prefix) => `${prefix}1200`)
    .replace(/(quality(?:%3D|=))\d+/i, (_match, prefix) => `${prefix}92`);
}

export function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.prompt === 'string' && item.prompt.trim())
    .map((item) => ({
      id: item.id || createPromptId(),
      title: item.title || deriveTitle(item.prompt),
      prompt: item.prompt.trim(),
      tags: normalizeTags(item.tags),
      source: item.source || 'manual',
      createdAt: item.createdAt || item.ts || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || item.ts || new Date().toISOString(),
      lastUsedAt: item.lastUsedAt || '',
      useCount: Number(item.useCount || 0),
      pinned: Boolean(item.pinned),
      isPublic: Boolean(item.isPublic || item.public),
      squareId: item.squareId || '',
      publishedAt: item.publishedAt || '',
      parts: item.parts || null,
      meta: item.meta || {}
    }));
}

export function historyPreviewImages(entry) {
  const meta = entry?.meta || {};
  const values = Array.isArray(meta.previewImages)
    ? meta.previewImages
    : (meta.previewImage ? [meta.previewImage] : []);
  return Array.from(new Set(
    values
      .map((url) => String(url || '').trim())
      .filter(Boolean)
  )).slice(0, MAX_PROMPT_EXAMPLE_IMAGES);
}

export function historyPreviewImageIds(entry) {
  const ids = Array.isArray(entry?.meta?.previewImageIds) ? entry.meta.previewImageIds : [];
  return Array.from(new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )).slice(0, MAX_PROMPT_EXAMPLE_IMAGES);
}
