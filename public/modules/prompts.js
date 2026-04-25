// 提示词管理：结构化构造器 + 本地历史库。
// 全部数据保存在 localStorage，和 Studio / Logs 保持同一个轻量客户端架构。

import { $, $$, escapeHtml, setStatus } from './dom.js';
import {
  KEYS,
  readJsonScoped, writeJsonScoped,
  readStringScoped, writeStringScoped
} from './state.js';

const MAX_PROMPT_HISTORY = 160;

const SOURCE_LABEL = {
  builder: '构造器',
  studio: '生成页',
  manual: '手动'
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
    if ($(id)) $(id).value = '';
  }
  saveBuilderDraft();
  updatePreviewCount();
  updateQualityList();
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
    outputFormat: meta.outputFormat || ''
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
  const builder = history.filter((item) => item.source === 'builder').length;
  const studio = history.filter((item) => item.source === 'studio').length;
  el.innerHTML = `
    <span class="chip">共 ${history.length} 条 · 显示 ${filtered.length}</span>
    <span class="chip info">构造器 ${builder}</span>
    <span class="chip">生成页 ${studio}</span>
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
          <button data-action="pin" type="button">${item.pinned ? '取消固定' : '固定'}</button>
          <button data-action="delete" class="danger" type="button">删除</button>
        </div>
      </article>`;
  }).join('');

  list.onclick = (ev) => {
    const btn = ev.target.closest('button[data-action]');
    const itemEl = ev.target.closest('.prompt-history-item');
    if (!btn || !itemEl) return;
    const entry = history.find((item) => item.id === itemEl.dataset.id);
    if (!entry) return;
    const action = btn.dataset.action;

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
    } else if (action === 'pin') {
      entry.pinned = !entry.pinned;
      entry.updatedAt = new Date().toISOString();
      saveHistory();
    } else if (action === 'delete') {
      if (entry.pinned && !confirm('这条提示词已固定，仍然删除？')) return;
      history = history.filter((item) => item.id !== entry.id);
      saveHistory();
    }
  };
}

function renderHistory({ onUsePrompt } = {}) {
  renderTagFilter();
  const filtered = filteredHistory();
  renderHistorySummary(filtered);
  renderHistoryList(filtered, { onUsePrompt });
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
  const target = tab === 'history' ? 'history' : 'builder';
  $$('.prompt-tab').forEach((btn) => {
    const active = btn.dataset.promptTab === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $('promptBuilderPanel')?.classList.toggle('active', target === 'builder');
  $('promptHistoryPanel')?.classList.toggle('active', target === 'history');
  writeStringScoped(KEYS.promptManagerTab, target);
}

export function mountPromptPanel({ onUsePrompt } = {}) {
  if (!$('promptPanel')) return;

  ensureHistoryLoaded();
  loadBuilderDraft();
  hydrateHistoryFromLogs();

  $$('.prompt-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchPromptSubpanel(btn.dataset.promptTab));
  });
  switchPromptSubpanel(readStringScoped(KEYS.promptManagerTab, 'builder'));

  for (const [, id] of BUILDER_FIELDS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      if (id === 'promptComposedOutput') {
        updatePreviewCount();
        saveBuilderDraft();
      } else if (id === 'promptTitleInput' || id === 'promptTagsInput') {
        saveBuilderDraft();
      } else {
        recomputeOutput();
      }
    });
  }

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
  $('promptExportHistory')?.addEventListener('click', exportPromptHistory);
  $('promptClearHistory')?.addEventListener('click', clearUnpinnedHistory);

  onPromptHistoryChanged(() => renderHistory({ onUsePrompt }));
  renderHistory({ onUsePrompt });
}
