// 提示词管理：结构化构造器 + 本地历史库。
// 全部数据保存在 localStorage，和 Studio / Logs 保持同一个轻量客户端架构。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import {
  KEYS,
  readJsonScoped, writeJsonScoped,
  readStringScoped, writeStringScoped
} from './state.js';
import { apiFetch, getCurrentUserId } from './auth.js';

const MAX_PROMPT_HISTORY = 160;

const SOURCE_LABEL = {
  builder: '构造器',
  studio: '生成页',
  manual: '手动',
  square: '广场',
  seed: '精选'
};

const BUILDER_FIELDS = [
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

// why：延迟到 mount 阶段再按用户 scope 加载历史，避免 import 期拿到 guest 数据。
let history = [];
let historyLoaded = false;
function ensureHistoryLoaded() {
  if (historyLoaded) return;
  historyLoaded = true;
  history = normalizeHistory(readJsonScoped(KEYS.promptHistory, []));
}
const listeners = new Set();
let squareItems = [];
let squareLoaded = false;
let squareLoading = false;
let squareUsePromptHandler = null;
let squarePreviewModal = null;
let lastSquarePreviewTrigger = null;
let squarePreviewKeyBound = false;

function emitHistoryChanged() {
  for (const fn of listeners) fn();
}

function onPromptHistoryChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function createId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.prompt === 'string' && item.prompt.trim())
    .map((item) => ({
      id: item.id || createId(),
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

function saveHistory() {
  writeJsonScoped(KEYS.promptHistory, history);
  emitHistoryChanged();
}

function normalizeTags(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(/[，,\n#]+/);
  return Array.from(new Set(list.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 8);
}

function mergeTags(a, b) {
  return Array.from(new Set([...normalizeTags(a), ...normalizeTags(b)])).slice(0, 8);
}

function deriveTitle(prompt) {
  const firstLine = String(prompt || '').trim().split(/\n+/)[0] || '未命名提示词';
  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
}

function sourceLabel(source) {
  return SOURCE_LABEL[source] || SOURCE_LABEL.manual;
}

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildLargeSquarePreviewUrl(url) {
  if (!url) return '';
  const source = String(url);
  if (!source.includes('/cdn-cgi/image/')) return source;

  return source
    .replace(/(width(?:%3D|=))\d+/i, (_match, prefix) => `${prefix}1200`)
    .replace(/(quality(?:%3D|=))\d+/i, (_match, prefix) => `${prefix}92`)
    .replace(/(fit(?:%3D|=))(?:cover|crop|contain|scale-down)/i, (_match, prefix) => `${prefix}contain`);
}

function ensureSquarePreviewModal() {
  if (squarePreviewModal) return squarePreviewModal;

  const modal = document.createElement('div');
  modal.className = 'image-preview-modal prompt-square-image-preview-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '提示词示例图预览');
  modal.innerHTML = `
    <div class="image-preview-backdrop" data-square-preview-close></div>
    <div class="image-preview-frame">
      <button class="image-preview-close" type="button" aria-label="关闭示例图预览" data-square-preview-close>×</button>
      <img class="image-preview-image" alt="" referrerpolicy="no-referrer" />
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => {
    if (ev.target?.hasAttribute?.('data-square-preview-close')) closeSquarePreviewModal();
  });

  squarePreviewModal = modal;
  return squarePreviewModal;
}

function openSquarePreviewModal({ url, alt }, trigger) {
  if (!url) return;
  lastSquarePreviewTrigger = trigger || null;
  const modal = ensureSquarePreviewModal();
  const img = modal.querySelector('.image-preview-image');
  img.src = buildLargeSquarePreviewUrl(url);
  img.alt = (alt || '提示词广场示例图').slice(0, 120);
  img.referrerPolicy = 'no-referrer';
  modal.hidden = false;
  document.body.classList.add('preview-open');
  modal.querySelector('.image-preview-close')?.focus();
}

function closeSquarePreviewModal() {
  if (!squarePreviewModal || squarePreviewModal.hidden) return;
  const img = squarePreviewModal.querySelector('.image-preview-image');
  squarePreviewModal.hidden = true;
  if (img) img.removeAttribute('src');
  document.body.classList.remove('preview-open');
  lastSquarePreviewTrigger?.focus?.();
  lastSquarePreviewTrigger = null;
}

function builderSnapshot() {
  const draft = {};
  for (const [name, id] of BUILDER_FIELDS) {
    draft[name] = $(id)?.value || '';
  }
  return draft;
}

function saveBuilderDraft() {
  writeJsonScoped(KEYS.promptBuilderDraft, builderSnapshot());
}

function getBuilderParts() {
  return {
    subject: $('promptSubjectInput')?.value.trim() || '',
    style: $('promptStyleInput')?.value.trim() || '',
    composition: $('promptCompositionInput')?.value.trim() || '',
    lighting: $('promptLightingInput')?.value.trim() || '',
    palette: $('promptPaletteInput')?.value.trim() || '',
    text: $('promptTextInput')?.value.trim() || '',
    negative: $('promptNegativeInput')?.value.trim() || ''
  };
}

function composePrompt(parts = getBuilderParts()) {
  const lines = [];
  if (parts.subject) lines.push(parts.subject);
  if (parts.style) lines.push(`风格与媒介：${parts.style}`);
  if (parts.composition) lines.push(`构图与镜头：${parts.composition}`);
  if (parts.lighting) lines.push(`光线与氛围：${parts.lighting}`);
  if (parts.palette) lines.push(`色彩与材质：${parts.palette}`);
  if (parts.text) lines.push(`画面文字：${parts.text}`);
  if (parts.negative) lines.push(`避免：${parts.negative}`);
  return lines.join('\n');
}

function setComposedOutput(value) {
  const output = $('promptComposedOutput');
  if (!output) return;
  output.value = value || '';
  updatePreviewCount();
}

function recomputeOutput() {
  setComposedOutput(composePrompt());
  updateQualityList();
  saveBuilderDraft();
}

function updatePreviewCount() {
  const count = $('promptPreviewCount');
  const output = $('promptComposedOutput');
  if (count && output) count.textContent = String(output.value.length);
}

function updateQualityList() {
  const parts = getBuilderParts();
  const checks = {
    subject: Boolean(parts.subject),
    style: Boolean(parts.style),
    composition: Boolean(parts.composition),
    lighting: Boolean(parts.lighting),
    constraints: Boolean(parts.negative || parts.text)
  };
  $$('#promptQualityList [data-check]').forEach((el) => {
    el.dataset.state = checks[el.dataset.check] ? 'ok' : 'empty';
  });
}

function loadBuilderDraft() {
  const draft = readJsonScoped(KEYS.promptBuilderDraft, {});
  for (const [name, id] of BUILDER_FIELDS) {
    if ($(id)) $(id).value = draft?.[name] || '';
  }
  if (!$('promptComposedOutput')?.value) setComposedOutput(composePrompt());
  updatePreviewCount();
  updateQualityList();
}

function clearBuilder() {
  for (const [, id] of BUILDER_FIELDS) {
    const el = $(id);
    if (!el) continue;
    el.value = '';
    resetTextareaNodeSize(el);
  }
  bindBuilderFieldInputs();
  saveBuilderDraft();
  updatePreviewCount();
  updateQualityList();
}

function resetTextareaNodeSize(el) {
  // Native textarea resizing is kept as per-node browser state in some engines.
  // Replacing the node clears that state so "清空构造" also restores the default box size.
  if (el.tagName !== 'TEXTAREA' || !el.parentNode) return el;
  const clone = el.cloneNode(true);
  clone.value = el.value;
  clone.removeAttribute('data-builder-input-bound');
  clone.style.removeProperty('width');
  clone.style.removeProperty('height');
  el.replaceWith(clone);
  return clone;
}

function handleBuilderFieldInput(id) {
  if (id === 'promptComposedOutput') {
    updatePreviewCount();
    saveBuilderDraft();
  } else if (id === 'promptTitleInput' || id === 'promptTagsInput') {
    saveBuilderDraft();
  } else {
    recomputeOutput();
  }
}

function bindBuilderFieldInputs() {
  for (const [, id] of BUILDER_FIELDS) {
    const el = $(id);
    if (!el || el.dataset.builderInputBound === 'true') continue;
    el.dataset.builderInputBound = 'true';
    el.addEventListener('input', () => handleBuilderFieldInput(id));
  }
}

function appendToField(id, value) {
  const el = $(id);
  if (!el) return;
  const prefix = el.value.trim() ? '，' : '';
  el.value = `${el.value.trim()}${prefix}${value}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function hydrateHistoryFromLogs() {
  const logs = readJsonScoped(KEYS.logs, []);
  if (!Array.isArray(logs) || !logs.length) return;
  const known = new Set(history.map((item) => item.prompt));
  for (const log of logs.slice().reverse()) {
    const prompt = String(log?.meta?.prompt || '').trim();
    if (!prompt || known.has(prompt)) continue;
    addPromptHistory(prompt, {
      source: 'studio',
      title: prompt.slice(0, 28),
      tags: ['生成'],
      model: log.meta?.model,
      size: log.meta?.size,
      quality: log.meta?.quality
    });
    known.add(prompt);
  }
}

function currentPromptPayload(source = 'builder') {
  const prompt = ($('promptComposedOutput')?.value || '').trim();
  return {
    prompt,
    meta: {
      title: $('promptTitleInput')?.value.trim() || deriveTitle(prompt),
      tags: normalizeTags($('promptTagsInput')?.value),
      source,
      parts: getBuilderParts()
    }
  };
}

export function addPromptHistory(prompt, meta = {}) {
  ensureHistoryLoaded();
  const normalizedPrompt = String(prompt || '').trim();
  if (!normalizedPrompt) return null;

  const now = new Date().toISOString();
  const source = meta.source || 'manual';
  const index = history.findIndex((item) => item.prompt === normalizedPrompt);
  const title = meta.title ? String(meta.title).trim() : '';
  const entryMeta = {
    model: meta.model || '',
    size: meta.size || '',
    quality: meta.quality || '',
    outputFormat: meta.outputFormat || '',
    sref: meta.sref || '',
    sourceHot: meta.sourceHot || '',
    sourceName: meta.sourceName || '',
    sourceUrl: meta.sourceUrl || '',
    previewImages: Array.isArray(meta.previewImages) ? meta.previewImages : []
  };

  if (index >= 0) {
    const existing = history[index];
    history[index] = {
      ...existing,
      title: title || existing.title || deriveTitle(normalizedPrompt),
      tags: mergeTags(existing.tags, meta.tags),
      source: existing.source === 'studio' ? existing.source : source,
      updatedAt: now,
      lastUsedAt: source === 'studio' ? now : existing.lastUsedAt,
      useCount: existing.useCount + (source === 'studio' ? 1 : 0),
      parts: meta.parts || existing.parts || null,
      meta: { ...existing.meta, ...entryMeta }
    };
    history.unshift(...history.splice(index, 1));
  } else {
    history.unshift({
      id: createId(),
      title: title || deriveTitle(normalizedPrompt),
      prompt: normalizedPrompt,
      tags: normalizeTags(meta.tags),
      source,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: source === 'studio' ? now : '',
      useCount: source === 'studio' ? 1 : 0,
      pinned: false,
      isPublic: false,
      squareId: '',
      publishedAt: '',
      parts: meta.parts || null,
      meta: entryMeta
    });
  }

  if (history.length > MAX_PROMPT_HISTORY) {
    const pinned = history.filter((item) => item.pinned).slice(0, MAX_PROMPT_HISTORY);
    const unpinned = history
      .filter((item) => !item.pinned)
      .slice(0, Math.max(0, MAX_PROMPT_HISTORY - pinned.length));
    history = [...pinned, ...unpinned];
  }
  saveHistory();
  return history[0];
}

function filteredHistory() {
  const keyword = ($('promptHistorySearch')?.value || '').trim().toLowerCase();
  const tag = $('promptTagFilter')?.value || 'all';
  const source = $('promptSourceFilter')?.value || 'all';

  return history
    .filter((item) => {
      if (tag !== 'all' && !item.tags.includes(tag)) return false;
      if (source !== 'all' && item.source !== source) return false;
      if (!keyword) return true;
      const hay = [item.title, item.prompt, item.tags.join(' '), sourceLabel(item.source)].join(' ').toLowerCase();
      return hay.includes(keyword);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
}

function renderTagFilter() {
  const select = $('promptTagFilter');
  if (!select) return;
  const previous = select.value || 'all';
  const tags = Array.from(new Set(history.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  select.innerHTML = '<option value="all">全部标签</option>' + tags
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join('');
  select.value = tags.includes(previous) ? previous : 'all';
}

function renderHistorySummary(filtered) {
  const el = $('promptHistorySummary');
  const count = $('promptHistoryCount');
  if (count) count.textContent = String(history.length);
  if (!el) return;
  const pinned = history.filter((item) => item.pinned).length;
  const published = history.filter((item) => item.isPublic).length;
  const builder = history.filter((item) => item.source === 'builder').length;
  const studio = history.filter((item) => item.source === 'studio').length;
  el.innerHTML = `
    <span class="chip">共 ${history.length} 条 · 显示 ${filtered.length}</span>
    <span class="chip info">构造器 ${builder}</span>
    <span class="chip">生成页 ${studio}</span>
    <span class="chip public">已公开 ${published}</span>
    <span class="chip pin">固定 ${pinned}</span>
  `;
}

function renderHistoryList(filtered, { onUsePrompt } = {}) {
  const list = $('promptHistoryList');
  if (!list) return;
  if (!filtered.length) {
    list.dataset.empty = 'true';
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">✦</div>
        <p>没有匹配的历史提示词。试试换一个搜索词或标签。</p>
      </div>`;
    return;
  }

  list.dataset.empty = 'false';
  list.innerHTML = filtered.map((item) => {
    const tags = item.tags.length
      ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
      : '<span>未标记</span>';
    const meta = [item.meta?.model, item.meta?.size, item.meta?.quality].filter(Boolean).join(' · ');
    return `
      <article class="prompt-history-item ${item.pinned ? 'is-pinned' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-history-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(sourceLabel(item.source))}</span>
            ${item.pinned ? '<span class="prompt-pin">已固定</span>' : ''}
            ${item.isPublic ? '<span class="prompt-public">已公开</span>' : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
        </div>
        <div class="prompt-history-side">
          <span>${escapeHtml(formatTime(item.updatedAt))}</span>
          <span>使用 ${item.useCount || 0} 次</span>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="prompt-history-buttons">
          <button data-action="use" type="button">使用</button>
          <button data-action="copy" type="button">复制</button>
          <button data-action="load" type="button">载入构造</button>
          <button data-action="toggle-public" type="button">${item.isPublic ? '取消公开' : '公开到广场'}</button>
          <button data-action="pin" type="button">${item.pinned ? '取消固定' : '固定'}</button>
          <button data-action="delete" class="danger" type="button">删除</button>
        </div>
      </article>`;
  }).join('');

  list.onclick = async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    const itemEl = ev.target.closest('.prompt-history-item');
    if (!btn || !itemEl) return;
    const entry = history.find((item) => item.id === itemEl.dataset.id);
    if (!entry) return;
    const action = btn.dataset.action;

    try {
      btn.disabled = true;
      if (action === 'use') {
        entry.useCount += 1;
        entry.lastUsedAt = new Date().toISOString();
        entry.updatedAt = entry.lastUsedAt;
        saveHistory();
        onUsePrompt?.(entry.prompt);
        setStatus('已送到生成页', 'ok', 1400);
      } else if (action === 'copy') {
        navigator.clipboard?.writeText(entry.prompt);
        setStatus('已复制提示词', 'ok', 1400);
      } else if (action === 'load') {
        loadEntryToBuilder(entry);
        switchPromptSubpanel('builder');
        setStatus('已载入构造器', 'ok', 1400);
      } else if (action === 'toggle-public') {
        if (entry.isPublic) {
          if (!confirm('取消公开后，其他用户将无法在提示词广场看到这条提示词。继续？')) return;
          await unpublishEntryFromSquare(entry);
        } else {
          await publishEntryToSquare(entry);
        }
      } else if (action === 'pin') {
        entry.pinned = !entry.pinned;
        entry.updatedAt = new Date().toISOString();
        saveHistory();
      } else if (action === 'delete') {
        if (entry.pinned && !confirm('这条提示词已固定，仍然删除？')) return;
        if (entry.isPublic) {
          if (!confirm('这条提示词已公开，删除历史时会一并从广场取消公开。继续？')) return;
          await unpublishEntryFromSquare(entry, { silent: true });
        }
        history = history.filter((item) => item.id !== entry.id);
        saveHistory();
      }
    } catch (err) {
      setStatus(`提示词操作失败：${err.message || err}`, 'err', 2200);
    } finally {
      btn.disabled = false;
    }
  };
}

function renderHistory({ onUsePrompt } = {}) {
  renderTagFilter();
  const filtered = filteredHistory();
  renderHistorySummary(filtered);
  renderHistoryList(filtered, { onUsePrompt });
}

function publicPayloadFromEntry(entry) {
  return {
    sourcePromptId: entry.id,
    title: entry.title || deriveTitle(entry.prompt),
    prompt: entry.prompt,
    tags: entry.tags || [],
    source: entry.source || 'manual',
    parts: entry.parts || null,
    meta: entry.meta || {}
  };
}

function syncHistoryPublicState(squareItem, isPublic) {
  if (!squareItem) return false;
  let changed = false;
  for (const entry of history) {
    const matched = (squareItem.sourcePromptId && entry.id === squareItem.sourcePromptId)
      || (squareItem.id && entry.squareId === squareItem.id);
    if (!matched) continue;
    entry.isPublic = Boolean(isPublic);
    entry.squareId = isPublic ? squareItem.id : '';
    entry.publishedAt = isPublic ? (squareItem.publishedAt || new Date().toISOString()) : '';
    changed = true;
  }
  return changed;
}

async function publishEntryToSquare(entry) {
  const resp = await apiFetch('/api/prompt-square', {
    method: 'POST',
    body: publicPayloadFromEntry(entry)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  const item = data.item;
  entry.isPublic = true;
  entry.squareId = item.id;
  entry.publishedAt = item.publishedAt || new Date().toISOString();
  entry.updatedAt = new Date().toISOString();
  saveHistory();
  squareLoaded = false;
  setStatus('已公开到提示词广场', 'ok', 1600);
  await refreshPromptSquare({ silent: true });
}

async function unpublishEntryFromSquare(entry, { silent = false } = {}) {
  if (entry.squareId) {
    const resp = await apiFetch(`/api/prompt-square/${encodeURIComponent(entry.squareId)}`, {
      method: 'DELETE'
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok && resp.status !== 404) throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  entry.isPublic = false;
  entry.squareId = '';
  entry.publishedAt = '';
  entry.updatedAt = new Date().toISOString();
  saveHistory();
  squareLoaded = false;
  if (!silent) setStatus('已从提示词广场取消公开', 'ok', 1600);
  await refreshPromptSquare({ silent: true });
}

async function unpublishSquareItem(item) {
  if (!confirm('取消公开后，其他用户将无法在提示词广场看到这条提示词。继续？')) return;
  const resp = await apiFetch(`/api/prompt-square/${encodeURIComponent(item.id)}`, {
    method: 'DELETE'
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 404) throw new Error(data?.error || `HTTP ${resp.status}`);
  if (syncHistoryPublicState(item, false)) saveHistory();
  squareLoaded = false;
  setStatus('已取消公开', 'ok', 1500);
  await refreshPromptSquare({ silent: true });
}

function currentSquarePeriod() {
  return document.querySelector('.prompt-square-period.active')?.dataset.squarePeriod || 'all';
}

function currentSquareTag() {
  return document.querySelector('.prompt-square-tag.active')?.dataset.squareTag || 'all';
}

function inSquarePeriod(item) {
  const period = currentSquarePeriod();
  if (period === 'all') return true;
  const days = period === '24h' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 0;
  if (!days) return true;
  const ts = Date.parse(item.publishedAt || item.updatedAt || item.createdAt || '');
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= days * 24 * 60 * 60 * 1000;
}

function filteredSquareItems() {
  const keyword = ($('promptSquareSearch')?.value || '').trim().toLowerCase();
  const tag = currentSquareTag();
  const sort = $('promptSquareSort')?.value || 'publishedAt:desc';
  const currentUserId = getCurrentUserId();

  const items = squareItems
    .filter((item) => {
      if (!inSquarePeriod(item)) return false;
      if (tag !== 'all' && !item.tags.includes(tag)) return false;
      if (!keyword) return true;
      const hay = [
        item.title,
        item.prompt,
        item.tags.join(' '),
        item.owner?.username || '',
        sourceLabel(item.source)
      ].join(' ').toLowerCase();
      return hay.includes(keyword);
    });

  return items.sort((a, b) => {
    if (sort === 'sourceHot:desc') {
      const diff = (Number(b.meta?.sourceHot || b.useCount) || 0) - (Number(a.meta?.sourceHot || a.useCount) || 0);
      if (diff) return diff;
    } else if (sort === 'useCount:desc') {
      const diff = (Number(b.useCount) || 0) - (Number(a.useCount) || 0);
      if (diff) return diff;
    } else if (sort === 'mine:first') {
      const am = a.owner?.id === currentUserId;
      const bm = b.owner?.id === currentUserId;
      if (am !== bm) return am ? -1 : 1;
    }
    return String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt));
  });
}

function renderSquareTagCloud() {
  const cloud = $('promptSquareTagCloud');
  if (!cloud) return;
  const previous = currentSquareTag();
  const tags = Array.from(new Set(squareItems.flatMap((item) => item.tags || [])))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .slice(0, 36);
  const selected = previous !== 'all' && tags.includes(previous) ? previous : 'all';
  cloud.innerHTML = [
    `<button class="prompt-square-tag ${selected === 'all' ? 'active' : ''}" type="button" data-square-tag="all">所有风格</button>`,
    ...tags.map((tag) => (
      `<button class="prompt-square-tag ${selected === tag ? 'active' : ''}" type="button" data-square-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    ))
  ].join('');
}

function renderSquareSummary(filtered) {
  const el = $('promptSquareSummary');
  const count = $('promptSquareCount');
  if (count) count.textContent = String(squareItems.length);
  if (!el) return;
  const mine = squareItems.filter((item) => item.owner?.id === getCurrentUserId()).length;
  const totalUses = squareItems.reduce((sum, item) => sum + (Number(item.useCount) || 0), 0);
  el.innerHTML = `
    <span class="chip">广场共 ${squareItems.length} 条 · 当前显示 ${filtered.length}</span>
    <span class="chip info">我的公开 ${mine}</span>
    <span class="chip">累计使用 ${totalUses}</span>
    <span class="chip pin">风格标签 / 热度排序</span>
  `;
}

function renderSquareList(filtered, { onUsePrompt } = {}) {
  const list = $('promptSquareList');
  if (!list) return;

  if (squareLoading && !squareLoaded) {
    list.dataset.empty = 'true';
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⌁</div>
        <p>正在加载提示词广场…</p>
      </div>`;
    return;
  }

  if (!filtered.length) {
    list.dataset.empty = 'true';
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">✦</div>
        <p>还没有匹配的公开提示词。可以先去“历史提示词管理”公开一条。</p>
      </div>`;
    return;
  }

  list.dataset.empty = 'false';
  list.innerHTML = filtered.map((item, index) => {
    const tags = item.tags?.length
      ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
      : '<span>未标记</span>';
    const meta = [
      item.meta?.sref ? `SREF ${item.meta.sref}` : '',
      item.meta?.sourceHot ? `来源热度 ${item.meta.sourceHot}` : '',
      item.meta?.model,
      item.meta?.size,
      item.meta?.quality
    ].filter(Boolean).join(' · ');
    const mine = item.owner?.id === getCurrentUserId();
    const previewUrl = Array.isArray(item.meta?.previewImages)
      ? item.meta.previewImages[0]
      : item.meta?.previewImage || '';
    const preview = previewUrl
      ? `<button class="prompt-square-preview" type="button" data-square-preview="${escapeHtml(previewUrl)}" aria-label="打开 ${escapeHtml(item.title)} 示例图">
          <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(`${item.title} 示例图`)}" loading="lazy" referrerpolicy="no-referrer" />
        </button>`
      : '';
    return `
      <article class="prompt-square-card ${mine ? 'is-mine' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="prompt-square-rank">#${index + 1}</div>
        <div class="prompt-square-main">
          <div class="prompt-history-titleline">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="prompt-source" data-source="${escapeHtml(item.source)}">${escapeHtml(sourceLabel(item.source))}</span>
            ${mine ? '<span class="prompt-public">我的公开</span>' : ''}
          </div>
          <p>${escapeHtml(item.prompt)}</p>
          <div class="prompt-history-tags">${tags}</div>
        </div>
        <div class="prompt-square-side">
          <span>作者 ${escapeHtml(item.owner?.username || 'unknown')}</span>
          <span>发布 ${escapeHtml(formatTime(item.publishedAt))}</span>
          <span>使用 ${Number(item.useCount) || 0} 次</span>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="prompt-history-buttons">
          <button data-action="use-square" type="button">使用</button>
          <button data-action="copy-square" type="button">复制</button>
          <button data-action="save-square" type="button">保存到历史</button>
          ${mine ? '<button data-action="unpublish-square" class="danger" type="button">取消公开</button>' : ''}
        </div>
        ${preview}
      </article>`;
  }).join('');

  list.onclick = async (ev) => {
    const previewBtn = ev.target.closest('[data-square-preview]');
    if (previewBtn) {
      const itemEl = previewBtn.closest('.prompt-square-card');
      const item = squareItems.find((it) => it.id === itemEl?.dataset.id);
      openSquarePreviewModal({
        url: previewBtn.dataset.squarePreview,
        alt: item ? `${item.title} 示例图` : '提示词广场示例图'
      }, previewBtn);
      return;
    }

    const btn = ev.target.closest('button[data-action]');
    const itemEl = ev.target.closest('.prompt-square-card');
    if (!btn || !itemEl) return;
    const item = squareItems.find((it) => it.id === itemEl.dataset.id);
    if (!item) return;
    const action = btn.dataset.action;

    try {
      btn.disabled = true;
      if (action === 'use-square') {
        await recordSquareUse(item);
        onUsePrompt?.(item.prompt);
        setStatus('已从广场送到生成页', 'ok', 1400);
      } else if (action === 'copy-square') {
        navigator.clipboard?.writeText(item.prompt);
        setStatus('已复制广场提示词', 'ok', 1400);
      } else if (action === 'save-square') {
        addPromptHistory(item.prompt, {
          source: 'square',
          title: item.title,
          tags: item.tags,
          parts: item.parts,
          model: item.meta?.model,
          size: item.meta?.size,
          quality: item.meta?.quality,
          outputFormat: item.meta?.outputFormat,
          sref: item.meta?.sref,
          sourceHot: item.meta?.sourceHot,
          sourceName: item.meta?.sourceName,
          sourceUrl: item.meta?.sourceUrl,
          previewImages: item.meta?.previewImages
        });
        setStatus('已保存到历史提示词', 'ok', 1400);
      } else if (action === 'unpublish-square') {
        await unpublishSquareItem(item);
      }
    } catch (err) {
      setStatus(`广场操作失败：${err.message || err}`, 'err', 2200);
    } finally {
      btn.disabled = false;
    }
  };
}

function renderPromptSquare({ onUsePrompt = squareUsePromptHandler } = {}) {
  renderSquareTagCloud();
  const filtered = filteredSquareItems();
  renderSquareSummary(filtered);
  renderSquareList(filtered, { onUsePrompt });
}

async function refreshPromptSquare({ silent = false, onUsePrompt = squareUsePromptHandler } = {}) {
  if (!$('promptSquarePanel') || squareLoading) return;
  squareLoading = true;
  if (!silent) {
    setStatus('正在刷新提示词广场…', 'ready', 1200);
  }
  renderPromptSquare({ onUsePrompt });
  try {
    const resp = await apiFetch('/api/prompt-square?limit=500', {
      headers: { accept: 'application/json' }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    squareItems = Array.isArray(data.items) ? data.items : [];
    squareLoaded = true;
    renderPromptSquare({ onUsePrompt });
    if (!silent) setStatus('提示词广场已刷新', 'ok', 1200);
  } catch (err) {
    const list = $('promptSquareList');
    if (list) {
      list.dataset.empty = 'true';
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">!</div>
          <p>提示词广场加载失败：${escapeHtml(err.message || String(err))}</p>
        </div>`;
    }
    setStatus('提示词广场加载失败', 'err', 1800);
  } finally {
    squareLoading = false;
  }
}

async function recordSquareUse(item) {
  try {
    const resp = await apiFetch(`/api/prompt-square/${encodeURIComponent(item.id)}/use`, {
      method: 'POST'
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.item) {
      const index = squareItems.findIndex((it) => it.id === item.id);
      if (index >= 0) squareItems[index] = data.item;
      renderPromptSquare({ onUsePrompt: squareUsePromptHandler });
    }
  } catch {
    // 使用计数失败不阻断“送到生成页”主流程。
  }
}

function loadEntryToBuilder(entry) {
  $('promptTitleInput').value = entry.title || '';
  $('promptTagsInput').value = (entry.tags || []).join(', ');
  const parts = entry.parts || {};
  $('promptSubjectInput').value = parts.subject || '';
  $('promptStyleInput').value = parts.style || '';
  $('promptCompositionInput').value = parts.composition || '';
  $('promptLightingInput').value = parts.lighting || '';
  $('promptPaletteInput').value = parts.palette || '';
  $('promptTextInput').value = parts.text || '';
  $('promptNegativeInput').value = parts.negative || '';
  setComposedOutput(entry.prompt || composePrompt());
  updateQualityList();
  saveBuilderDraft();
}

function exportPromptHistory() {
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `image-studio-prompts-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function clearUnpinnedHistory() {
  const removable = history.filter((item) => !item.pinned).length;
  if (!removable) {
    setStatus('没有可清理的未固定提示词', 'ready', 1400);
    return;
  }
  if (!confirm(`确认清空 ${removable} 条未固定提示词？固定项会保留。`)) return;
  history = history.filter((item) => item.pinned);
  saveHistory();
  setStatus('已清理未固定提示词', 'ok', 1400);
}

function switchPromptSubpanel(tab) {
  const target = tab === 'history' || tab === 'square' ? tab : 'builder';
  $$('.prompt-tab').forEach((btn) => {
    const active = btn.dataset.promptTab === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $('promptBuilderPanel')?.classList.toggle('active', target === 'builder');
  $('promptHistoryPanel')?.classList.toggle('active', target === 'history');
  $('promptSquarePanel')?.classList.toggle('active', target === 'square');
  writeStringScoped(KEYS.promptManagerTab, target);
  if (target === 'square' && !squareLoaded) {
    refreshPromptSquare({ silent: true, onUsePrompt: squareUsePromptHandler });
  }
}

export function mountPromptPanel({ onUsePrompt } = {}) {
  if (!$('promptPanel')) return;

  squareUsePromptHandler = onUsePrompt || null;
  ensureHistoryLoaded();
  loadBuilderDraft();
  hydrateHistoryFromLogs();

  $$('.prompt-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchPromptSubpanel(btn.dataset.promptTab));
  });
  switchPromptSubpanel(readStringScoped(KEYS.promptManagerTab, 'builder'));

  bindBuilderFieldInputs();

  $$('.prompt-chip').forEach((btn) => {
    btn.addEventListener('click', () => appendToField(btn.dataset.target, btn.dataset.value));
  });

  $('promptClearBuilder')?.addEventListener('click', clearBuilder);
  $('promptUseInStudio')?.addEventListener('click', () => {
    const { prompt, meta } = currentPromptPayload('builder');
    if (!prompt) return setStatus('提示词为空', 'err', 1400);
    addPromptHistory(prompt, meta);
    onUsePrompt?.(prompt);
    setStatus('已送到生成页', 'ok', 1400);
  });
  $('promptSaveHistory')?.addEventListener('click', () => {
    const { prompt, meta } = currentPromptPayload('builder');
    if (!prompt) return setStatus('提示词为空', 'err', 1400);
    addPromptHistory(prompt, meta);
    setStatus('已保存到历史提示词', 'ok', 1400);
  });
  $('promptCopyOutput')?.addEventListener('click', () => {
    const prompt = ($('promptComposedOutput')?.value || '').trim();
    if (!prompt) return setStatus('提示词为空', 'err', 1400);
    navigator.clipboard?.writeText(prompt);
    setStatus('已复制提示词', 'ok', 1400);
  });

  for (const id of ['promptHistorySearch', 'promptTagFilter', 'promptSourceFilter']) {
    $(id)?.addEventListener('input', () => renderHistory({ onUsePrompt }));
    $(id)?.addEventListener('change', () => renderHistory({ onUsePrompt }));
  }
  for (const id of ['promptSquareSearch', 'promptSquareSort']) {
    $(id)?.addEventListener('input', () => renderPromptSquare({ onUsePrompt }));
    $(id)?.addEventListener('change', () => renderPromptSquare({ onUsePrompt }));
  }
  $$('.prompt-square-period').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.prompt-square-period').forEach((it) => it.classList.toggle('active', it === btn));
      renderPromptSquare({ onUsePrompt });
    });
  });
  $('promptSquareTagCloud')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.prompt-square-tag');
    if (!btn) return;
    $$('.prompt-square-tag').forEach((it) => it.classList.toggle('active', it === btn));
    renderPromptSquare({ onUsePrompt });
  });
  $('promptSquareRefresh')?.addEventListener('click', () => refreshPromptSquare({ onUsePrompt }));
  $('promptExportHistory')?.addEventListener('click', exportPromptHistory);
  $('promptClearHistory')?.addEventListener('click', clearUnpinnedHistory);
  if (!squarePreviewKeyBound) {
    squarePreviewKeyBound = true;
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeSquarePreviewModal();
    });
  }

  onPromptHistoryChanged(() => renderHistory({ onUsePrompt }));
  renderHistory({ onUsePrompt });
}
