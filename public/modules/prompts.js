// 提示词管理：结构化构造器 + 本地历史库。
// 全部数据保存在 localStorage，和 Studio / Logs 保持同一个轻量客户端架构。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import {
  KEYS,
  readJsonScoped, writeJsonScoped,
  readStringScoped, writeStringScoped
} from './state.js';
import { apiFetch, getCurrentUserId } from './auth.js';
import { copyText } from './clipboard.js';
import { composePrompt, promptBuilderQualityChecks } from './prompt-builder-model.js';
import { upsertPromptHistoryEntry } from './prompt-history-model.js';
import {
  filterPromptSquareItems
} from './prompt-square-model.js';
import { createImagePreviewController } from './image-preview.js';
import {
  BUILDER_FIELDS,
  MAX_PROMPT_EXAMPLE_IMAGES,
  PROMPT_EXAMPLE_ACCEPT,
  buildLargeSquarePreviewUrl,
  deriveTitle,
  historyPreviewImageIds,
  historyPreviewImages,
  normalizeHistory,
  normalizeTags,
  sourceLabel
} from './prompt-utils.js';
import {
  promptHistoryListState,
  promptHistorySummaryHtml
} from './prompt-history-view.js';
import {
  promptSquareErrorHtml,
  promptSquareListState,
  promptSquareSummaryHtml,
  promptSquareTagCloudHtml
} from './prompt-square-view.js';
import { selectOptionsHtml } from './select-options-view.js';

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
let squarePreviewKeyBound = false;

function emitHistoryChanged() {
  for (const fn of listeners) fn();
}

function onPromptHistoryChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function saveHistory() {
  writeJsonScoped(KEYS.promptHistory, history);
  emitHistoryChanged();
}

const squarePreviewController = createImagePreviewController({
  modalClass: 'prompt-square-image-preview-modal',
  ariaLabel: '提示词示例图预览',
  closeLabel: '关闭示例图预览',
  closeAttribute: 'data-square-preview-close',
  referrerPolicy: 'no-referrer',
  transformUrl: buildLargeSquarePreviewUrl
});

function openSquarePreviewModal({ url, alt }, trigger) {
  return squarePreviewController.open({
    src: url,
    alt: alt || '提示词广场示例图',
    trigger
  });
}

function closeSquarePreviewModal() {
  return squarePreviewController.close();
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

function setComposedOutput(value) {
  const output = $('promptComposedOutput');
  if (!output) return;
  output.value = value || '';
  updatePreviewCount();
}

function recomputeOutput() {
  setComposedOutput(composePrompt(getBuilderParts()));
  updateQualityList();
  saveBuilderDraft();
}

function updatePreviewCount() {
  const count = $('promptPreviewCount');
  const output = $('promptComposedOutput');
  if (count && output) count.textContent = String(output.value.length);
}

function updateQualityList() {
  const checks = promptBuilderQualityChecks(getBuilderParts());
  $$('#promptQualityList [data-check]').forEach((el) => {
    el.dataset.state = checks[el.dataset.check] ? 'ok' : 'empty';
  });
}

function loadBuilderDraft() {
  const draft = readJsonScoped(KEYS.promptBuilderDraft, {});
  for (const [name, id] of BUILDER_FIELDS) {
    if ($(id)) $(id).value = draft?.[name] || '';
  }
  if (!$('promptComposedOutput')?.value) setComposedOutput(composePrompt(getBuilderParts()));
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
  const result = upsertPromptHistoryEntry(history, prompt, meta);
  if (!result.changed) return null;
  history = result.history;
  saveHistory();
  return result.entry;
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
  select.innerHTML = selectOptionsHtml([
    { value: 'all', label: '全部标签' },
    ...tags.map((tag) => ({ value: tag, label: tag }))
  ]);
  select.value = tags.includes(previous) ? previous : 'all';
}

function renderHistorySummary(filtered) {
  const el = $('promptHistorySummary');
  const count = $('promptHistoryCount');
  if (count) count.textContent = String(history.length);
  if (!el) return;
  el.innerHTML = promptHistorySummaryHtml(history, filtered);
}

function selectPromptExampleFiles() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Array.from(input.files || []));
    };
    input.type = 'file';
    input.accept = PROMPT_EXAMPLE_ACCEPT;
    input.multiple = true;
    input.addEventListener('change', finish, { once: true });
    input.addEventListener('cancel', finish, { once: true });
    setTimeout(() => {
      window.addEventListener('focus', () => setTimeout(finish, 250), { once: true });
    }, 0);
    input.click();
  });
}

function applyUploadedPromptExample(entry, image) {
  if (!image?.url) return;
  const currentUrls = historyPreviewImages(entry).filter((url) => url !== image.url);
  const currentIds = historyPreviewImageIds(entry).filter((id) => id !== image.id);
  entry.meta = {
    ...(entry.meta || {}),
    previewImages: [image.url, ...currentUrls].slice(0, MAX_PROMPT_EXAMPLE_IMAGES),
    previewImageIds: [image.id, ...currentIds].filter(Boolean).slice(0, MAX_PROMPT_EXAMPLE_IMAGES)
  };
  entry.updatedAt = new Date().toISOString();
}

async function uploadPromptExamples(entry) {
  const remaining = MAX_PROMPT_EXAMPLE_IMAGES - historyPreviewImages(entry).length;
  if (remaining <= 0) {
    setStatus(`最多保留 ${MAX_PROMPT_EXAMPLE_IMAGES} 张示例图`, 'ready', 1600);
    return false;
  }

  const files = (await selectPromptExampleFiles())
    .filter((file) => /^image\/(png|jpeg|webp)$/i.test(file.type || '') || /\.(png|jpe?g|webp)$/i.test(file.name || ''))
    .slice(0, remaining);
  if (!files.length) return false;

  for (const file of files) {
    const form = new FormData();
    form.append('image', file, file.name || 'example.png');
    form.append('title', entry.title || '');
    form.append('prompt', entry.prompt || '');
    const resp = await apiFetch('/api/prompt-examples', {
      method: 'POST',
      body: form
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    applyUploadedPromptExample(entry, data.image);
    saveHistory();
  }

  if (entry.isPublic) await publishEntryToSquare(entry);
  setStatus(`已上传 ${files.length} 张示例图`, 'ok', 1500);
  return true;
}

function clearPromptExamples(entry) {
  const meta = { ...(entry.meta || {}) };
  delete meta.previewImage;
  delete meta.previewImages;
  delete meta.previewImageIds;
  entry.meta = meta;
  entry.updatedAt = new Date().toISOString();
  saveHistory();
}

function renderHistoryList(filtered, { onUsePrompt } = {}) {
  const list = $('promptHistoryList');
  if (!list) return;

  const view = promptHistoryListState(filtered);
  list.dataset.empty = view.empty ? 'true' : 'false';
  list.innerHTML = view.html;
  if (view.empty) return;

  list.onclick = async (ev) => {
    const previewBtn = ev.target.closest('[data-history-preview]');
    if (previewBtn) {
      const itemEl = previewBtn.closest('.prompt-history-item');
      const entry = history.find((item) => item.id === itemEl?.dataset.id);
      openSquarePreviewModal({
        url: previewBtn.dataset.historyPreview,
        alt: entry ? `${entry.title} 示例图` : '提示词示例图'
      }, previewBtn);
      return;
    }

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
        const result = await copyText(entry.prompt);
        setStatus(result.manual ? '请在弹出的文本框中手动复制提示词' : '已复制提示词', result.manual ? 'ready' : 'ok', 1400);
      } else if (action === 'load') {
        loadEntryToBuilder(entry);
        switchPromptSubpanel('builder');
        setStatus('已载入构造器', 'ok', 1400);
      } else if (action === 'upload-example') {
        await uploadPromptExamples(entry);
      } else if (action === 'clear-examples') {
        if (!confirm('清空这条提示词的示例图？')) return;
        clearPromptExamples(entry);
        if (entry.isPublic) await publishEntryToSquare(entry);
        setStatus('已清空示例图', 'ok', 1400);
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

async function ensureFullSquareItem(item) {
  if (!item?.promptTruncated) return item;
  const resp = await apiFetch(`/api/prompt-square/${encodeURIComponent(item.id)}`, {
    headers: { accept: 'application/json' }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.item) throw new Error(data?.error || `HTTP ${resp.status}`);
  const index = squareItems.findIndex((it) => it.id === item.id);
  if (index >= 0) squareItems[index] = data.item;
  return data.item;
}

function currentSquarePeriod() {
  return document.querySelector('.prompt-square-period.active')?.dataset.squarePeriod || 'all';
}

function currentSquareTag() {
  return document.querySelector('.prompt-square-tag.active')?.dataset.squareTag || 'all';
}

function filteredSquareItems() {
  return filterPromptSquareItems(squareItems, {
    keyword: $('promptSquareSearch')?.value || '',
    tag: currentSquareTag(),
    sort: $('promptSquareSort')?.value || 'publishedAt:desc',
    period: currentSquarePeriod(),
    currentUserId: getCurrentUserId()
  });
}

function renderSquareTagCloud() {
  const cloud = $('promptSquareTagCloud');
  if (!cloud) return;
  const previous = currentSquareTag();
  cloud.innerHTML = promptSquareTagCloudHtml(squareItems, { selectedTag: previous });
}

function renderSquareSummary(filtered) {
  const el = $('promptSquareSummary');
  const count = $('promptSquareCount');
  if (count) count.textContent = String(squareItems.length);
  if (!el) return;
  el.innerHTML = promptSquareSummaryHtml(squareItems, filtered, { currentUserId: getCurrentUserId() });
}

function renderSquareList(filtered, { onUsePrompt } = {}) {
  const list = $('promptSquareList');
  if (!list) return;

  const view = promptSquareListState(filtered, {
    currentUserId: getCurrentUserId(),
    loading: squareLoading,
    loaded: squareLoaded
  });
  list.dataset.empty = view.empty ? 'true' : 'false';
  list.innerHTML = view.html;
  if (view.empty) return;

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
        const fullItem = await ensureFullSquareItem(item);
        await recordSquareUse(fullItem);
        onUsePrompt?.(fullItem.prompt);
        setStatus('已从广场送到生成页', 'ok', 1400);
      } else if (action === 'copy-square') {
        const fullItem = await ensureFullSquareItem(item);
        const result = await copyText(fullItem.prompt);
        setStatus(result.manual ? '请在弹出的文本框中手动复制广场提示词' : '已复制广场提示词', result.manual ? 'ready' : 'ok', 1400);
      } else if (action === 'save-square') {
        const fullItem = await ensureFullSquareItem(item);
        addPromptHistory(fullItem.prompt, {
          source: 'square',
          title: fullItem.title,
          tags: fullItem.tags,
          parts: fullItem.parts,
          model: fullItem.meta?.model,
          size: fullItem.meta?.size,
          quality: fullItem.meta?.quality,
          outputFormat: fullItem.meta?.outputFormat,
          sref: fullItem.meta?.sref,
          sourceHot: fullItem.meta?.sourceHot,
          sourceName: fullItem.meta?.sourceName,
          sourceUrl: fullItem.meta?.sourceUrl,
          previewImages: fullItem.meta?.previewImages
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
      list.innerHTML = promptSquareErrorHtml(err);
    }
    if (!silent) setStatus('提示词广场加载失败', 'err', 1800);
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
  setComposedOutput(entry.prompt || composePrompt(getBuilderParts()));
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
  const initialPromptTab = readStringScoped(KEYS.promptManagerTab, 'builder');
  switchPromptSubpanel(initialPromptTab);
  if (initialPromptTab !== 'square') {
    refreshPromptSquare({ silent: true, onUsePrompt });
  }

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
  $('promptCopyOutput')?.addEventListener('click', async () => {
    const prompt = ($('promptComposedOutput')?.value || '').trim();
    if (!prompt) return setStatus('提示词为空', 'err', 1400);
    try {
      const result = await copyText(prompt);
      setStatus(result.manual ? '请在弹出的文本框中手动复制提示词' : '已复制提示词', result.manual ? 'ready' : 'ok', 1400);
    } catch (err) {
      setStatus(`复制失败：${err?.message || err}`, 'err', 1800);
    }
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
