// 漫画工作流面板：故事 → 页分镜 → 逐页生图。

import { $, escapeHtml, setStatus } from './dom.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, OUTPUT_FORMATS, QUALITIES, SIZES } from '../../shared/constants.js';
import { getChatConfig, getEffectiveProfile, getImageConfig, onProfilesChanged, usesSystemDefault } from './profiles.js';
import { apiFetch } from './auth.js';
import { submitGenerationJob } from './jobs.js';
import { addLog } from './logs.js';
import { addPromptHistory } from './prompts.js';
import { readStringScoped, writeStringScoped } from './state.js';
import {
  COMIC_PAGE_PANEL_LIMITS,
  COMIC_PAGE_COUNT_LIMITS,
  buildComicImagePrompt,
  clampComicPageCount,
  clampComicPagePanelCount,
  comicPageStoryboardToJson,
  comicReferenceSpecs,
  comicStyleOptions,
  getComicStyleTemplate,
  normalizeComicPageStoryboard
} from '../../shared/comic-workflow.js';

const COMIC_STORY_DRAFT_KEY = 'image-key-manager.comicStoryDraft.v1';
const JOB_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const FINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);
const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);

let mounted = false;
let storyboard = null;
let generatedPanels = [];
let activeRun = null;
let activeStoryboardRequest = null;
let currentProjectId = '';
let currentProjectStory = '';

function renderSelect(id, items, selectedValue = '') {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items
    .map((it) => {
      const value = it.value ?? it.id;
      const label = it.label ?? value;
      const selected = selectedValue && selectedValue === value ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function imageSrcFromItem(item = {}) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

function imageIdFromItem(item = {}) {
  return item.gallery_id || item.galleryId || item.id || '';
}

function itemPanelIndex(item = {}) {
  const value = item.comicPageIndex ?? item.comic_page_index ?? item.comicPanelIndex ?? item.comic_panel_index ?? item.pageIndex ?? item.panelIndex;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function jobPageIndex(job = {}) {
  const payload = job.payload || {};
  const value = payload.comicPageIndex ?? payload.comic_page_index ?? payload.comicPanelIndex ?? payload.comic_panel_index ?? job.comicPageIndex ?? job.comicPanelIndex;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function latestJobForPage(jobs = [], pageIndex = 1) {
  const matches = (Array.isArray(jobs) ? jobs : [])
    .filter((job) => jobPageIndex(job) === pageIndex)
    .sort((a, b) => {
      const ar = ACTIVE_JOB_STATUSES.has(a.status) ? 0 : 1;
      const br = ACTIVE_JOB_STATUSES.has(b.status) ? 0 : 1;
      if (ar !== br) return ar - br;
      return Number(b.updatedAt || b.finishedAt || b.createdAt || 0) - Number(a.updatedAt || a.finishedAt || a.createdAt || 0);
    });
  return matches[0] || null;
}

function generatedEntryFromJob(job = {}) {
  if (!job?.id) return null;
  const item = firstResultItem(job);
  if (job.status === 'succeeded' && item) {
    return { status: 'succeeded', jobId: job.id, item, prompt: job.payload?.prompt || job.promptPreview || '' };
  }
  const status = job.status === 'timeout' ? 'failed' : (job.status || 'pending');
  return {
    status,
    jobId: job.id,
    prompt: job.payload?.prompt || job.promptPreview || '',
    error: job.error || job.progress?.message || ''
  };
}

function pageStoryboardEditorValue(value) {
  return comicPageStoryboardToJson(value);
}

function encodeEditorOriginalValue(value = '') {
  return encodeURIComponent(String(value ?? ''));
}

function decodeEditorOriginalValue(value = '') {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function pageStoryboardContentFromSubPanels(pageStoryboard = {}) {
  const subPanels = Array.isArray(pageStoryboard.subPanels) ? pageStoryboard.subPanels : [];
  return subPanels
    .map((item, index) => {
      const label = item.id || String.fromCharCode(65 + index);
      const meta = [item.role, item.area, item.shot].filter(Boolean).join(' / ');
      const content = item.content || item.composition || '';
      return `${label}. ${[meta, content].filter(Boolean).join('：')}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function pageStoryboardContentEditorValue(panel = {}, index = 0) {
  const pageStoryboard = normalizeComicPageStoryboard(panel.pageStoryboard, index);
  if (pageStoryboard?.content) return pageStoryboard.content;
  const fromSubPanels = pageStoryboard ? pageStoryboardContentFromSubPanels(pageStoryboard) : '';
  return fromSubPanels || panel.imagePrompt || panel.beat || '';
}

function pageStoryboardPanelCountEditorValue(value, fallback = COMIC_PAGE_PANEL_LIMITS.default) {
  const pageStoryboard = normalizeComicPageStoryboard(value);
  return clampComicPagePanelCount(
    pageStoryboard?.panelCount || pageStoryboard?.subPanels?.length || fallback,
    fallback
  );
}

function parsePageStoryboardEditorValue(raw = '', index = 0) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error(`第 ${index + 1} 页高级 JSON 不是合法 JSON：${err?.message || err}`);
  }
  const normalized = normalizeComicPageStoryboard(parsed, index);
  if (!normalized) throw new Error(`第 ${index + 1} 页高级 JSON 必须是单页分镜对象。`);
  return normalized;
}

function splitPageContentLines(content = '') {
  return String(content || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resizePageSubPanels(pageStoryboard = {}, count = COMIC_PAGE_PANEL_LIMITS.default, content = '') {
  const safeCount = clampComicPagePanelCount(count);
  const existing = Array.isArray(pageStoryboard.subPanels) ? pageStoryboard.subPanels : [];
  const lines = splitPageContentLines(content);
  return Array.from({ length: safeCount }, (_, index) => {
    const source = existing[index] || {};
    return {
      id: source.id || String.fromCharCode(65 + index),
      role: source.role || `第 ${index + 1} 格`,
      area: source.area || '',
      shot: source.shot || '',
      camera: source.camera || '',
      composition: source.composition || '',
      content: lines[index] || source.content || (safeCount === 1 ? content : ''),
      transition: source.transition || ''
    };
  });
}

function fallbackPageStoryboardFromPanel(panel = {}, index = 0) {
  const content = [
    panel.beat,
    panel.setting ? `场景：${panel.setting}` : '',
    panel.action ? `动作：${panel.action}` : '',
    panel.emotion ? `情绪：${panel.emotion}` : '',
    panel.imagePrompt
  ].filter(Boolean).join('；') || `第 ${index + 1} 页分镜`;
  return normalizeComicPageStoryboard({
    layoutType: `第 ${index + 1} 页自动分镜`,
    layoutKeywords: ['manga page layout', 'editable page storyboard'],
    readingOrder: '按页面主要视觉动线顺序阅读',
    visualHierarchy: panel.composition || '主体清晰，关键动作和情绪优先',
    narrativeFunction: panel.beat || `推进第 ${index + 1} 页剧情`,
    content,
    panelCount: 1,
    subPanels: [
      {
        id: 'A',
        role: '主画格',
        area: '整页或主视觉区域',
        shot: panel.shot || '',
        camera: panel.camera || '',
        composition: panel.composition || '',
        content,
        transition: ''
      }
    ],
    designNotes: '自动兜底生成，可在单页分镜编辑区继续细化。',
    aiPromptAddon: 'single page comic layout, clear readable panels'
  }, index);
}

function normalizedOrFallbackPageStoryboard(panel = {}, index = 0) {
  return normalizeComicPageStoryboard(panel.pageStoryboard, index)
    || fallbackPageStoryboardFromPanel(panel, index);
}

function ensureStoryboardPageStoryboards(value = storyboard) {
  if (!Array.isArray(value?.panels)) return value;
  value.pageStoryboardEnabled = true;
  value.pageCount = value.panels.length;
  value.panels = value.panels.map((panel, index) => ({
    ...panel,
    pageStoryboard: normalizedOrFallbackPageStoryboard(panel, index)
  }));
  return value;
}

function pageStoryboardEditorEnabled(value = storyboard) {
  return Array.isArray(value?.panels) && value.panels.length > 0;
}

function totalPagePanelCount(value = storyboard) {
  if (!Array.isArray(value?.panels)) return 0;
  return value.panels.reduce((sum, panel) => (
    sum + pageStoryboardPanelCountEditorValue(panel.pageStoryboard, 1)
  ), 0);
}

function normalizeProjectStory(value = '') {
  return String(value || '').trim();
}

function detachProjectIfStoryChanged(nextStory = '') {
  const story = normalizeProjectStory(nextStory);
  if (!currentProjectId || !currentProjectStory || story === currentProjectStory) return;
  currentProjectId = '';
  currentProjectStory = '';
}

function collectComicProjectPayload(status = 'storyboard') {
  const story = normalizeProjectStory($('comicStory')?.value || '');
  const styleId = storyboard?.styleId || $('comicStyle')?.value || '';
  const style = getComicStyleTemplate(styleId);
  const storyboardPayload = storyboard
    ? { ...storyboard, pageStoryboardEnabled: true }
    : {};
  const pageCount = storyboard?.panels?.length || syncComicPageLimitInput();
  return {
    id: currentProjectId || undefined,
    title: storyboard?.title || story.slice(0, 40) || '未命名漫画',
    story,
    styleId,
    styleLabel: storyboard?.styleLabel || style.label,
    pageCount,
    // Backward-compatible API/DB field; in page-storyboard mode this is page count.
    panelCount: pageCount,
    chatModel: $('comicChatModel')?.value.trim() || DEFAULT_CHAT_MODEL,
    imageModel: $('comicImageModel')?.value.trim() || DEFAULT_IMAGE_MODEL,
    size: $('comicSize')?.value || 'auto',
    quality: $('comicQuality')?.value || 'auto',
    outputFormat: $('comicOutputFormat')?.value || 'auto',
    useContext: $('comicUseContext')?.checked !== false,
    status,
    storyboard: storyboardPayload
  };
}

async function saveComicProject(status = 'storyboard') {
  if (!storyboard) return null;
  const body = collectComicProjectPayload(status);
  const endpoint = currentProjectId
    ? `/api/comic-projects/${encodeURIComponent(currentProjectId)}`
    : '/api/comic-projects';
  const resp = await apiFetch(endpoint, {
    method: currentProjectId ? 'PUT' : 'POST',
    body
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  currentProjectId = data.project?.id || currentProjectId;
  currentProjectStory = normalizeProjectStory(data.project?.story ?? body.story);
  window.dispatchEvent(new CustomEvent('comic-project-saved', { detail: { project: data.project } }));
  return data.project;
}

function setSelectValue(id, value) {
  const el = $(id);
  if (!el || value === undefined || value === null || value === '') return;
  el.value = String(value);
}

function abortError(message = '已停止漫画生成。') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function showComicError(message = '') {
  const el = $('comicError');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
}

function showComicProgress(message = '', state = 'busy') {
  const wrap = $('comicProgress');
  const text = $('comicProgressText');
  if (!wrap || !text) return;
  wrap.hidden = !message;
  wrap.dataset.state = state;
  text.textContent = message || '';
}

function setBusy(isBusy) {
  $('comicAnalyze')?.toggleAttribute('disabled', isBusy);
  $('comicGenerate')?.toggleAttribute('disabled', isBusy || !storyboard);
  $('comicStop')?.toggleAttribute('disabled', !isBusy);
}

function populateOptions() {
  renderSelect('comicStyle', comicStyleOptions().map((item) => ({
    value: item.id,
    label: item.label
  })));
  renderSelect('comicSize', SIZES);
  renderSelect('comicQuality', QUALITIES);
  renderSelect('comicOutputFormat', OUTPUT_FORMATS);

  const count = $('comicPanelCount');
  if (count) {
    count.min = String(COMIC_PAGE_COUNT_LIMITS.min);
    count.max = String(COMIC_PAGE_COUNT_LIMITS.max);
    count.value = String(COMIC_PAGE_COUNT_LIMITS.default);
    count.title = `模型会自动决定实际页数；这里仅作为安全上限（${COMIC_PAGE_COUNT_LIMITS.min}-${COMIC_PAGE_COUNT_LIMITS.max} 页）。每页内部画格数也由模型自动生成，生成后可微调。`;
  }
}

function syncComicPageLimitInput(value = undefined) {
  const input = $('comicPanelCount');
  const count = clampComicPageCount(value ?? input?.value);
  if (input && input.value !== String(count)) input.value = String(count);
  return count;
}

function updateProfileDefaults() {
  const profile = getEffectiveProfile();
  const chat = getChatConfig(profile);
  const image = getImageConfig(profile);
  const mode = usesSystemDefault() ? '系统默认' : '个人覆盖';
  const label = profile ? `${profile.name || '未命名'} · ${mode}` : '-';
  const chip = $('comicActiveConfigName');
  if (chip) chip.textContent = label;

  const chatModel = $('comicChatModel');
  if (chatModel && chatModel.dataset.userEdited !== '1') {
    chatModel.value = chat?.defaultModel || DEFAULT_CHAT_MODEL;
  }
  const imageModel = $('comicImageModel');
  if (imageModel && imageModel.dataset.userEdited !== '1') {
    imageModel.value = image?.defaultModel || DEFAULT_IMAGE_MODEL;
  }
}

function renderStyleGuide() {
  const selected = $('comicStyle')?.value;
  const list = $('comicStyleGuide');
  if (!list) return;
  list.innerHTML = comicStyleOptions().map((item) => {
    const active = item.id === selected ? ' active' : '';
    return `<article class="comic-style-card${active}" data-comic-style-card="${escapeHtml(item.id)}">
      <div class="comic-style-card-head">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.tags.join(' / '))}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
    </article>`;
  }).join('');
}

function renderStoryboard() {
  const box = $('comicStoryboard');
  if (!box) return;
  if (!storyboard) {
    box.dataset.empty = 'true';
    box.innerHTML = `<div class="empty-state">
      <div class="empty-icon" aria-hidden="true">▦</div>
      <p>先输入小故事并点击“生成页分镜”。模型会自动给出角色设定、风格圣经、实际页数和每页画格规划。</p>
    </div>`;
    return;
  }

  box.dataset.empty = 'false';
  const showPageStoryboards = pageStoryboardEditorEnabled(storyboard);
  if (showPageStoryboards) ensureStoryboardPageStoryboards(storyboard);
  const pageCount = storyboard.panels.length;
  const innerPanelCount = showPageStoryboards ? totalPagePanelCount(storyboard) : pageCount;
  const characters = storyboard.characters?.length
    ? storyboard.characters.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>：${escapeHtml([
      item.role,
      item.visualSignature,
      item.costume,
      item.expressionRules
    ].filter(Boolean).join('；'))}</li>`).join('')
    : '<li>模型未提取到明确角色；生成时会按故事主体保持一致。</li>';

  const panels = storyboard.panels.map((panel, index) => {
    const pageStoryboard = showPageStoryboards ? normalizedOrFallbackPageStoryboard(panel, index) : null;
    const pageStoryboardJson = pageStoryboardEditorValue(pageStoryboard);
    const pagePanelCount = pageStoryboardPanelCountEditorValue(pageStoryboard, 1);
    const pageContent = showPageStoryboards ? pageStoryboardContentEditorValue({ ...panel, pageStoryboard }, index) : '';
    const pageStoryboardField = showPageStoryboards ? `<div class="comic-page-editor">
      <div class="comic-page-editor-head">
        <strong>第 ${index + 1} 页（单页分镜）</strong>
        <span>${pagePanelCount} 个页内画格 · 模型生成，可微调</span>
      </div>
      <div class="comic-page-editor-grid">
        <label class="field">
          <span>本页画格数（模型生成，可改）</span>
          <input type="number" min="${COMIC_PAGE_PANEL_LIMITS.min}" max="${COMIC_PAGE_PANEL_LIMITS.max}" value="${pagePanelCount}" data-comic-page-panel-count="${index}" data-comic-page-panel-count-original="${pagePanelCount}" />
        </label>
        <label class="field comic-page-content-field">
          <span>本页画格内容（单页分镜，可改）</span>
          <textarea rows="5" data-comic-page-content="${index}" data-comic-page-content-original="${escapeHtml(encodeEditorOriginalValue(pageContent))}">${escapeHtml(pageContent)}</textarea>
        </label>
      </div>
      <details class="comic-page-json-details">
        <summary>高级：查看/编辑单页分镜 JSON</summary>
        <label class="field comic-page-storyboard-field">
          <span>单页分镜布局 JSON（可改）</span>
          <textarea rows="8" data-comic-page-storyboard="${index}" spellcheck="false">${escapeHtml(pageStoryboardJson)}</textarea>
        </label>
      </details>
    </div>` : '';
    const itemLabel = showPageStoryboards ? `第 ${index + 1} 页` : `#${index + 1}`;
    return `<article class="comic-panel-card" data-comic-panel="${index}">
    <header>
      <span class="comic-panel-index">${escapeHtml(itemLabel)}</span>
      <div>
        <strong>${escapeHtml(panel.beat || `${showPageStoryboards ? '第 ' + (index + 1) + ' 页' : '分镜 ' + (index + 1)}`)}</strong>
        <p>${escapeHtml([panel.shot, panel.camera, panel.composition].filter(Boolean).join(' · ') || '镜头/构图可继续手动补充')}</p>
      </div>
    </header>
    <dl>
      <div><dt>场景</dt><dd>${escapeHtml(panel.setting || '-')}</dd></div>
      <div><dt>动作</dt><dd>${escapeHtml(panel.action || '-')}</dd></div>
      <div><dt>情绪</dt><dd>${escapeHtml(panel.emotion || '-')}</dd></div>
      <div><dt>连续性</dt><dd>${escapeHtml(panel.continuityNotes || '-')}</dd></div>
    </dl>
    <label class="field">
      <span>${showPageStoryboards ? '本页整图提示词（可改）' : '本格生图提示词（可改）'}</span>
      <textarea rows="5" data-comic-panel-prompt="${index}">${escapeHtml(panel.imagePrompt || '')}</textarea>
    </label>
    ${pageStoryboardField}
  </article>`;
  }).join('');

  box.innerHTML = `
    <section class="comic-bible">
      <div>
        <p class="eyebrow">Storyboard</p>
        <h3>${escapeHtml(storyboard.title)}</h3>
        <p>${escapeHtml(storyboard.logline || '已生成页分镜设计。')}</p>
        <div class="comic-page-summary">
          ${showPageStoryboards
            ? `模型已自动决定 ${pageCount} 页漫画 · 共 ${innerPanelCount} 个页内画格；实际页数和每页画格数都可在生成后微调。`
            : `已生成 ${pageCount} 格分镜；每格提示词可在下方编辑。`}
        </div>
      </div>
      <div class="comic-bible-grid">
        <section>
          <h4>角色一致性</h4>
          <ul>${characters}</ul>
        </section>
        <section>
          <h4>风格圣经</h4>
          <p>${escapeHtml(storyboard.styleBible)}</p>
        </section>
      </div>
    </section>
    <section class="comic-panel-list">${panels}</section>`;
}

function renderComicResults() {
  const list = $('comicResults');
  if (!list) return;
  if (!generatedPanels.length) {
    list.dataset.empty = 'true';
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon" aria-hidden="true">□</div>
      <p>页分镜确认后点击“逐页生成图片”。生成时会把首页/上一页作为上下文参考，尽量锁定角色和画风。</p>
    </div>`;
    return;
  }

  list.dataset.empty = 'false';
  const unitLabel = pageStoryboardEditorEnabled(storyboard) ? '页' : '格';
  list.innerHTML = generatedPanels.map((entry, index) => {
    const item = entry.item || {};
    const src = imageSrcFromItem(item);
    const title = storyboard?.panels?.[index]?.beat || `分镜 ${index + 1}`;
    const status = entry.status || 'pending';
    const statusLabel = {
      pending: '等待',
      queued: '排队',
      running: '生成中',
      succeeded: '完成',
      failed: '失败',
      cancelled: '已停止',
      timeout: '超时'
    }[status] || status;
    const image = src
      ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title.slice(0, 80))}" loading="lazy" />`
      : `<div class="comic-result-placeholder">${escapeHtml(statusLabel)}</div>`;
    const actions = src
      ? `<a href="${escapeHtml(src)}" download="comic-panel-${index + 1}.png">下载</a>`
      : '';
    return `<article class="image-card comic-result-card" data-status="${escapeHtml(status)}">
      ${image}
      <div class="image-meta">
        <span>第 ${index + 1} ${escapeHtml(unitLabel)} ${escapeHtml(statusLabel)}</span>
        <span>${escapeHtml(entry.jobId ? entry.jobId.slice(0, 8) : '')}</span>
      </div>
      <p class="prompt-preview" title="${escapeHtml(title)}">${escapeHtml(title)}</p>
      ${entry.error ? `<p class="revised">${escapeHtml(entry.error)}</p>` : ''}
      ${actions ? `<div class="comic-result-actions">${actions}</div>` : ''}
    </article>`;
  }).join('');
}

function syncStoryboardFromEditors() {
  if (!storyboard?.panels) return;
  document.querySelectorAll('[data-comic-panel-prompt]').forEach((el) => {
    const index = Number(el.dataset.comicPanelPrompt);
    if (!Number.isInteger(index) || !storyboard.panels[index]) return;
    storyboard.panels[index].imagePrompt = el.value.trim();
  });

  const pageStoryboardByIndex = new Map();
  const pagePanelCountByIndex = new Map();
  const pageContentByIndex = new Map();

  document.querySelectorAll('[data-comic-page-storyboard]').forEach((el) => {
    const index = Number(el.dataset.comicPageStoryboard);
    if (!Number.isInteger(index) || !storyboard.panels[index]) return;
    pageStoryboardByIndex.set(index, parsePageStoryboardEditorValue(el.value, index));
  });
  document.querySelectorAll('[data-comic-page-panel-count]').forEach((el) => {
    const index = Number(el.dataset.comicPagePanelCount);
    if (!Number.isInteger(index) || !storyboard.panels[index]) return;
    const nextCount = clampComicPagePanelCount(el.value);
    const originalCount = clampComicPagePanelCount(
      el.dataset.comicPagePanelCountOriginal ?? nextCount
    );
    if (nextCount !== originalCount) pagePanelCountByIndex.set(index, nextCount);
  });
  document.querySelectorAll('[data-comic-page-content]').forEach((el) => {
    const index = Number(el.dataset.comicPageContent);
    if (!Number.isInteger(index) || !storyboard.panels[index]) return;
    const nextContent = el.value.trim();
    const originalContent = decodeEditorOriginalValue(el.dataset.comicPageContentOriginal).trim();
    if (nextContent !== originalContent) pageContentByIndex.set(index, nextContent);
  });

  const pageIndexes = new Set([
    ...pageStoryboardByIndex.keys(),
    ...pagePanelCountByIndex.keys(),
    ...pageContentByIndex.keys()
  ]);
  pageIndexes.forEach((index) => {
    const panel = storyboard.panels[index];
    if (!panel) return;
    const rawStoryboard = pageStoryboardByIndex.has(index)
      ? pageStoryboardByIndex.get(index)
      : panel.pageStoryboard;
    if (!rawStoryboard && !pagePanelCountByIndex.has(index) && !pageContentByIndex.has(index)) {
      delete panel.pageStoryboard;
      return;
    }

    let pageStoryboard = normalizeComicPageStoryboard(rawStoryboard, index)
      || normalizedOrFallbackPageStoryboard(panel, index);
    if (pagePanelCountByIndex.has(index)) {
      pageStoryboard.panelCount = pagePanelCountByIndex.get(index);
    }
    if (pageContentByIndex.has(index)) {
      pageStoryboard.content = pageContentByIndex.get(index);
    }
    if (pagePanelCountByIndex.has(index) || pageContentByIndex.has(index)) {
      pageStoryboard.subPanels = resizePageSubPanels(
        pageStoryboard,
        pageStoryboard.panelCount,
        pageStoryboard.content
      );
    }
    panel.pageStoryboard = pageStoryboard;
  });

  storyboard.pageCount = storyboard.panels.length;
  storyboard.pageStoryboardEnabled = true;
}

function resolveProfileConfig(kind) {
  const profile = getEffectiveProfile();
  const systemMode = usesSystemDefault();
  if (!profile) throw new Error('请先在“配置”页面创建接口配置。');
  if (profile.status !== 'active') {
    throw new Error(systemMode
      ? '系统默认接口未启用，请联系管理员或在“配置”页面启用个人覆盖。'
      : '当前接口未启用，请在“配置”页面切换为“启用”。');
  }
  const config = kind === 'chat' ? getChatConfig(profile) : getImageConfig(profile);
  if (systemMode && config.hasApiKey === false) {
    throw new Error(`系统默认${kind === 'chat' ? '对话' : '生图'}接口缺少 API Key。`);
  }
  if (!systemMode && !config.apiKey) {
    throw new Error(`当前配置缺少${kind === 'chat' ? '对话' : '生图'} API Key。`);
  }
  return { profile, config, systemMode };
}

async function analyzeStoryboard() {
  showComicError('');
  const story = normalizeProjectStory($('comicStory')?.value || '');
  if (!story) return showComicError('请先输入一个小故事。');
  detachProjectIfStoryChanged(story);

  let profileInfo;
  try {
    profileInfo = resolveProfileConfig('chat');
  } catch (err) {
    return showComicError(err.message || String(err));
  }

  const styleId = $('comicStyle')?.value;
  const pageLimit = syncComicPageLimitInput();
  const model = $('comicChatModel')?.value.trim() || profileInfo.config.defaultModel || DEFAULT_CHAT_MODEL;
  const payload = {
    name: profileInfo.profile.name,
    useSystemDefault: profileInfo.systemMode,
    model,
    story,
    styleId,
    pageLimit,
    pageCount: pageLimit,
    // Backward-compatible request field for older server versions.
    panelCount: pageLimit,
    projectId: currentProjectId || undefined,
    imageModel: $('comicImageModel')?.value.trim() || DEFAULT_IMAGE_MODEL,
    size: $('comicSize')?.value || 'auto',
    quality: $('comicQuality')?.value || 'auto',
    outputFormat: $('comicOutputFormat')?.value || 'auto',
    useContext: $('comicUseContext')?.checked !== false
  };
  if (!profileInfo.systemMode) {
    payload.chatBaseUrl = profileInfo.config.baseUrl;
    payload.chatApiKey = profileInfo.config.apiKey;
  }

  const started = Date.now();
  const controller = new AbortController();
  activeStoryboardRequest = { controller, stopped: false, jobId: '' };

  setBusy(true);
  setStatus('正在提交漫画页分镜任务…', 'busy');
  showComicProgress(`正在把故事提交到后台队列，由 ${model} 在最多 ${pageLimit} 页内自动决定实际页数，并为每页自动决定画格数…`, 'busy');
  try {
    const resp = await apiFetch('/api/comic-storyboards', {
      method: 'POST',
      body: payload,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const queuedJob = data.job || { id: data.jobId, status: data.status, position: data.position };
    if (!queuedJob?.id) throw new Error('页分镜任务提交成功但缺少任务 ID。');
    activeStoryboardRequest.jobId = queuedJob.id;

    const positionText = queuedJob.position ? `，当前第 ${queuedJob.position} 位` : '';
    addLog('info', 'comic.storyboard.queued', {
      jobId: queuedJob.id,
      model,
      profileName: profileInfo.profile.name,
      interfaceMode: profileInfo.systemMode ? 'system' : 'custom',
      pageLimit,
      panelCount: pageLimit,
      styleId
    });
    setStatus(`漫画页分镜已入队${positionText}`, 'ok', 1600);
    showComicProgress(`页分镜任务 ${queuedJob.id.slice(0, 8)} 已入队${positionText}，后台完成后会自动回填并保存漫画项目。`, 'busy');

    const job = FINAL_STATUSES.has(queuedJob.status)
      ? queuedJob
      : await waitForJob(queuedJob.id, { signal: controller.signal });
    if (job.status !== 'succeeded') {
      throw new Error(job.error || job.progress?.message || `页分镜任务失败：${job.status}`);
    }

    const result = job.result || {};
    const project = result.project || {};
    const nextStoryboard = result.storyboard || project.storyboard;
    if (!nextStoryboard?.panels?.length) throw new Error('页分镜任务完成但没有返回可用页分镜。');

    storyboard = nextStoryboard;
    storyboard.pageStoryboardEnabled = true;
    ensureStoryboardPageStoryboards(storyboard);
    generatedPanels = [];
    currentProjectId = project.id || currentProjectId;
    currentProjectStory = normalizeProjectStory(project.story ?? story);
    renderStoryboard();
    renderComicResults();
    $('comicGenerate').disabled = false;
    if (project.id) {
      window.dispatchEvent(new CustomEvent('comic-project-saved', { detail: { project } }));
    }
    addPromptHistory(story, {
      source: 'comic',
      title: storyboard.title || story.slice(0, 28),
      tags: ['漫画', '分镜', getComicStyleTemplate(styleId).label],
      model
    });
    addLog('info', 'comic.storyboard.generated', {
      jobId: job.id,
      model: result.model || model,
      profileName: profileInfo.profile.name,
      interfaceMode: profileInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      jobDurationMs: job.startedAt && job.finishedAt ? job.finishedAt - job.startedAt : undefined,
      pageCount: storyboard.panels?.length || pageLimit,
      pageLimit,
      styleId,
      includePageStoryboards: true,
      repaired: Boolean(result.repaired),
      projectId: project.id || currentProjectId
    });
    setStatus('漫画页分镜已生成', 'ok', 1800);
    showComicProgress('模型已决定实际页数、每页画格数和单页分镜内容，并已保存为“图库 → 漫画项目”。可微调后逐页生成图片。', 'ok');
  } catch (err) {
    const aborted = err.name === 'AbortError';
    const stopped = aborted && activeStoryboardRequest?.stopped;
    const message = aborted
      ? (stopped ? '页分镜生成已停止。' : '页分镜生成等待超时，请稍后在队列或图库中查看。')
      : (err.message || String(err));
    showComicError(stopped ? '' : message);
    addLog(stopped ? 'info' : 'error', stopped ? 'comic.storyboard.stopped' : 'comic.storyboard.failed', {
      jobId: activeStoryboardRequest?.jobId || undefined,
      model,
      profileName: profileInfo.profile.name,
      durationMs: Date.now() - started,
      error: message
    });
    setStatus(stopped ? '漫画页分镜已停止' : '漫画页分镜失败', stopped ? 'ok' : 'err', 2200);
    showComicProgress(stopped ? '已停止页分镜生成。' : message, stopped ? 'muted' : 'err');
  } finally {
    if (activeStoryboardRequest?.controller === controller) activeStoryboardRequest = null;
    setBusy(false);
  }
}

async function fetchJob(jobId) {
  const resp = await apiFetch('/api/jobs', { headers: { accept: 'application/json' } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return (Array.isArray(data.items) ? data.items : []).find((job) => job.id === jobId) || null;
}

function waitForJob(jobId, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let polling = false;

    const cleanup = () => {
      done = true;
      clearTimeout(timeoutId);
      clearInterval(pollId);
      window.removeEventListener('generation-job-finished', onFinished);
      signal?.removeEventListener?.('abort', onAbort);
    };
    const finish = (job) => {
      if (done) return;
      cleanup();
      resolve(job);
    };
    const fail = (err) => {
      if (done) return;
      cleanup();
      reject(err);
    };
    const onFinished = (ev) => {
      const job = ev.detail?.job;
      if (job?.id === jobId) finish(job);
    };
    const onAbort = () => fail(abortError());
    const timeoutId = setTimeout(() => fail(new Error('等待任务完成超时。')), JOB_WAIT_TIMEOUT_MS);
    const pollId = setInterval(async () => {
      if (polling || done) return;
      polling = true;
      try {
        const job = await fetchJob(jobId);
        if (job && FINAL_STATUSES.has(job.status)) finish(job);
      } catch {
        // SSE 是主路径；轮询失败时继续等下一次。
      } finally {
        polling = false;
      }
    }, 4000);

    window.addEventListener('generation-job-finished', onFinished);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function cancelCurrentJob() {
  const jobId = activeRun?.currentJobId;
  if (!jobId) return;
  await cancelJobById(jobId);
}

async function cancelCurrentStoryboardJob() {
  const jobId = activeStoryboardRequest?.jobId;
  if (!jobId) return;
  await cancelJobById(jobId);
}

async function cancelJobById(jobId) {
  if (!jobId) return;
  try {
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  } catch {
    // 停止是尽力而为；当前任务可能已经结束。
  }
}

function firstResultItem(job = {}) {
  const items = Array.isArray(job.result?.data) ? job.result.data : [];
  return items.find((item) => imageSrcFromItem(item)) || null;
}

function panelPayload({ panel, index, imageInfo, references }) {
  const styleId = storyboard?.styleId || $('comicStyle')?.value;
  const prompt = buildComicImagePrompt({
    storyboard,
    panel,
    styleId,
    panelIndex: index + 1,
    totalPanels: storyboard.panels.length
  });
  const payload = {
    name: imageInfo.profile.name,
    useSystemDefault: imageInfo.systemMode,
    model: $('comicImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
    prompt,
    size: $('comicSize')?.value || 'auto',
    quality: $('comicQuality')?.value || 'auto',
    output_format: $('comicOutputFormat')?.value || 'auto',
    n: 1,
    comicProjectId: currentProjectId || undefined,
    comicPageIndex: index + 1,
    // Backward-compatible alias until the persisted DB column is renamed.
    comicPanelIndex: index + 1
  };
  if (references.length) payload.references = references;
  if (!imageInfo.systemMode) {
    payload.baseUrl = imageInfo.config.baseUrl;
    payload.apiKey = imageInfo.config.apiKey;
  }
  return payload;
}

async function generateComic({ onSavedImages } = {}) {
  showComicError('');
  if (!storyboard?.panels?.length) return showComicError('请先生成页分镜。');
  try {
    syncStoryboardFromEditors();
  } catch (err) {
    const message = err?.message || String(err);
    showComicError(message);
    setStatus('单页分镜 JSON 无效', 'err', 2200);
    return;
  }
  detachProjectIfStoryChanged($('comicStory')?.value || '');

  let imageInfo;
  try {
    imageInfo = resolveProfileConfig('image');
  } catch (err) {
    return showComicError(err.message || String(err));
  }

  const useContext = $('comicUseContext')?.checked !== false;
  try {
    await saveComicProject('generating');
  } catch (err) {
    return showComicError(`漫画项目保存失败：${err.message || String(err)}`);
  }
  activeRun = { controller: new AbortController(), currentJobId: '', stopped: false };
  const previousPanels = Array.isArray(generatedPanels) ? generatedPanels : [];
  generatedPanels = storyboard.panels.map((_, index) => {
    const existing = previousPanels[index];
    if (existing?.status === 'succeeded' && imageIdFromItem(existing.item)) return existing;
    if (ACTIVE_JOB_STATUSES.has(existing?.status) && existing?.jobId) {
      return { ...existing, error: '' };
    }
    return { ...(existing || {}), status: 'pending', error: '' };
  });
  renderComicResults();
  setBusy(true);

  const unitLabel = pageStoryboardEditorEnabled(storyboard) ? '页' : '格';
  setStatus(`漫画逐${unitLabel}生成中…`, 'busy');
  let anchorId = '';
  let previousId = '';
  const started = Date.now();
  try {
    for (let i = 0; i < storyboard.panels.length; i += 1) {
      const existingId = imageIdFromItem(generatedPanels[i]?.item || {});
      if (generatedPanels[i]?.status === 'succeeded' && existingId) {
        if (!anchorId) anchorId = existingId;
        previousId = existingId;
        continue;
      }
      if (activeRun.controller.signal.aborted) throw abortError();
      if (ACTIVE_JOB_STATUSES.has(generatedPanels[i]?.status) && generatedPanels[i]?.jobId) {
        const jobId = generatedPanels[i].jobId;
        activeRun.currentJobId = jobId;
        renderComicResults();
        showComicProgress(`第 ${i + 1}/${storyboard.panels.length} ${unitLabel}已有任务 ${jobId.slice(0, 8)}，正在等待完成…`, 'busy');
        const job = await waitForJob(jobId, { signal: activeRun.controller.signal });
        if (job.status !== 'succeeded') {
          throw new Error(job.error || job.progress?.message || `第 ${i + 1} ${unitLabel}生成失败：${job.status}`);
        }
        const item = firstResultItem(job);
        if (!item) throw new Error(`第 ${i + 1} ${unitLabel}没有返回可用图片。`);
        const imageId = imageIdFromItem(item);
        if (imageId) {
          if (!anchorId) anchorId = imageId;
          previousId = imageId;
        }
        generatedPanels[i] = {
          status: 'succeeded',
          jobId,
          item,
          prompt: generatedPanels[i]?.prompt || job.payload?.prompt || job.promptPreview || ''
        };
        renderComicResults();
        onSavedImages?.([item]);
        continue;
      }
      const panel = storyboard.panels[i];
      const references = comicReferenceSpecs({ anchorId, previousId, enabled: useContext });
      const payload = panelPayload({ panel, index: i, imageInfo, references });
      generatedPanels[i] = { ...generatedPanels[i], status: 'queued', prompt: payload.prompt };
      renderComicResults();
      showComicProgress(`正在提交第 ${i + 1}/${storyboard.panels.length} ${unitLabel}到生图队列…`, 'busy');

      const accepted = await submitGenerationJob(payload);
      const jobId = accepted.jobId || accepted.job?.id;
      if (!jobId) throw new Error('服务端没有返回生图任务 ID。');
      activeRun.currentJobId = jobId || '';
      if (activeRun.controller.signal.aborted) {
        await cancelJobById(jobId);
        throw abortError();
      }
      generatedPanels[i] = { ...generatedPanels[i], status: 'running', jobId };
      renderComicResults();
      showComicProgress(`第 ${i + 1}/${storyboard.panels.length} ${unitLabel}已入队，等待完成…`, 'busy');

      const job = await waitForJob(jobId, { signal: activeRun.controller.signal });
      if (job.status !== 'succeeded') {
        throw new Error(job.error || job.progress?.message || `第 ${i + 1} ${unitLabel}生成失败：${job.status}`);
      }
      const item = firstResultItem(job);
      if (!item) throw new Error(`第 ${i + 1} ${unitLabel}没有返回可用图片。`);
      const imageId = imageIdFromItem(item);
      if (imageId) {
        if (!anchorId) anchorId = imageId;
        previousId = imageId;
      }
      generatedPanels[i] = { status: 'succeeded', jobId, item, prompt: payload.prompt };
      renderComicResults();
      onSavedImages?.([item]);
      try {
        await saveComicProject(i + 1 >= storyboard.panels.length ? 'completed' : 'generating');
      } catch (saveErr) {
        addLog('error', 'comic.project.save_failed', { error: saveErr.message || String(saveErr) });
      }
      showComicProgress(`第 ${i + 1}/${storyboard.panels.length} ${unitLabel}完成。${i + 1 < storyboard.panels.length ? `继续下一${unitLabel}…` : ''}`, 'ok');
    }

    addLog('info', 'comic.generate.completed', {
      model: $('comicImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
      profileName: imageInfo.profile.name,
      interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      pageCount: storyboard.panels.length,
      panelCount: storyboard.panels.length,
      styleId: storyboard.styleId,
      useContext
    });
    try {
      await saveComicProject('completed');
    } catch (saveErr) {
      addLog('error', 'comic.project.save_failed', { error: saveErr.message || String(saveErr) });
    }
    setStatus('漫画生成完成', 'ok', 2200);
    showComicProgress(`漫画已逐${unitLabel}生成完成，可在“图库 → 漫画项目”查看与管理。`, 'ok');
  } catch (err) {
    const stopped = err.name === 'AbortError';
    const message = stopped ? '漫画生成已停止。' : (err.message || String(err));
    const current = generatedPanels.findIndex((item) => item.status === 'running' || item.status === 'queued');
    if (current >= 0 && generatedPanels[current]?.status !== 'succeeded') {
      generatedPanels[current] = {
        ...generatedPanels[current],
        status: stopped ? 'cancelled' : 'failed',
        error: message
      };
      renderComicResults();
    }
    showComicError(stopped ? '' : message);
    addLog(stopped ? 'info' : 'error', stopped ? 'comic.generate.stopped' : 'comic.generate.failed', {
      profileName: imageInfo.profile.name,
      durationMs: Date.now() - started,
      error: message
    });
    try {
      await saveComicProject(stopped ? 'stopped' : 'failed');
    } catch (saveErr) {
      addLog('error', 'comic.project.save_failed', { error: saveErr.message || String(saveErr) });
    }
    setStatus(stopped ? '漫画生成已停止' : '漫画生成失败', stopped ? 'ok' : 'err', 2200);
    showComicProgress(stopped ? `已停止；再次点击“逐${unitLabel}生成图片”会从未完成分镜继续。` : message, stopped ? 'muted' : 'err');
  } finally {
    activeRun = null;
    setBusy(false);
    if (storyboard) $('comicGenerate').disabled = false;
  }
}

function stopComicRun() {
  if (activeStoryboardRequest) {
    activeStoryboardRequest.stopped = true;
    activeStoryboardRequest.controller.abort();
    cancelCurrentStoryboardJob();
    return;
  }
  if (!activeRun) return;
  activeRun.stopped = true;
  activeRun.controller.abort();
  cancelCurrentJob();
}

function loadComicProject(detail = {}) {
  const project = detail.project || detail;
  if (!project?.id) return;
  currentProjectId = project.id;
  currentProjectStory = normalizeProjectStory(project.story);
  storyboard = project.storyboard && Object.keys(project.storyboard).length ? project.storyboard : null;
  if (pageStoryboardEditorEnabled(storyboard)) ensureStoryboardPageStoryboards(storyboard);
  const story = $('comicStory');
  if (story) {
    story.value = project.story || '';
    writeStringScoped(COMIC_STORY_DRAFT_KEY, story.value);
  }
  setSelectValue('comicStyle', project.styleId || storyboard?.styleId);
  syncComicPageLimitInput(project.pageCount || project.panelCount || storyboard?.panels?.length);
  setSelectValue('comicSize', project.size);
  setSelectValue('comicQuality', project.quality);
  setSelectValue('comicOutputFormat', project.outputFormat);
  const chatModel = $('comicChatModel');
  if (chatModel && project.chatModel) {
    chatModel.value = project.chatModel;
    chatModel.dataset.userEdited = '1';
  }
  const imageModel = $('comicImageModel');
  if (imageModel && project.imageModel) {
    imageModel.value = project.imageModel;
    imageModel.dataset.userEdited = '1';
  }
  const useContext = $('comicUseContext');
  if (useContext) useContext.checked = project.useContext !== false;

  const images = Array.isArray(detail.images) ? detail.images : [];
  const jobs = Array.isArray(detail.jobs) ? detail.jobs : [];
  generatedPanels = storyboard?.panels?.length
    ? storyboard.panels.map((_, index) => {
      const image = images.find((item) => itemPanelIndex(item) === index + 1) || images[index];
      if (image) return { status: 'succeeded', item: image, prompt: image.prompt || '' };
      return generatedEntryFromJob(latestJobForPage(jobs, index + 1)) || { status: 'pending' };
    })
    : images.map((item) => ({ status: 'succeeded', item, prompt: item.prompt || '' }));

  renderStyleGuide();
  renderStoryboard();
  renderComicResults();
  $('comicGenerate').disabled = !storyboard;
  showComicError('');
  const activeJobs = generatedPanels.filter((item) => ACTIVE_JOB_STATUSES.has(item.status) && item.jobId).length;
  showComicProgress(
    activeJobs
      ? `已导入漫画项目，并恢复 ${activeJobs} 个进行中的生图任务；再次点击生成会等待这些任务，避免重复提交。`
      : '已导入漫画项目，可继续微调页分镜或逐页生成图片。',
    'ok'
  );
}

function bindEvents({ onSavedImages } = {}) {
  $('comicAnalyze')?.addEventListener('click', analyzeStoryboard);
  $('comicGenerate')?.addEventListener('click', () => generateComic({ onSavedImages }));
  $('comicStop')?.addEventListener('click', stopComicRun);
  $('comicStyle')?.addEventListener('change', () => {
    renderStyleGuide();
    if (storyboard) {
      try {
        syncStoryboardFromEditors();
      } catch (err) {
        showComicError(err?.message || String(err));
        setStatus('单页分镜 JSON 无效', 'err', 2200);
        return;
      }
      storyboard.styleId = $('comicStyle').value;
      storyboard.styleLabel = getComicStyleTemplate(storyboard.styleId).label;
      renderStoryboard();
    }
  });
  $('comicStory')?.addEventListener('input', () => {
    writeStringScoped(COMIC_STORY_DRAFT_KEY, $('comicStory').value);
  });
  $('comicPanelCount')?.addEventListener('change', () => syncComicPageLimitInput());
  $('comicPanelCount')?.addEventListener('blur', () => syncComicPageLimitInput());
  $('comicChatModel')?.addEventListener('input', () => { $('comicChatModel').dataset.userEdited = '1'; });
  $('comicImageModel')?.addEventListener('input', () => { $('comicImageModel').dataset.userEdited = '1'; });
  window.addEventListener('comic-project-import', (ev) => loadComicProject(ev.detail || {}));
}

export function mountComicPanel({ onSavedImages } = {}) {
  if (mounted) return;
  mounted = true;
  populateOptions();
  updateProfileDefaults();
  renderStyleGuide();
  renderStoryboard();
  renderComicResults();
  const draft = readStringScoped(COMIC_STORY_DRAFT_KEY, '');
  if (draft) $('comicStory').value = draft;
  bindEvents({ onSavedImages });
  onProfilesChanged(updateProfileDefaults);
  setBusy(false);
  $('comicGenerate').disabled = true;
}
