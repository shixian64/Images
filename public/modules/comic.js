// 漫画工作流面板：故事 → 页分镜 → 逐页生图。

import { $, escapeHtml, setStatus } from './dom.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, OUTPUT_FORMATS, QUALITIES, SIZES } from '../../shared/constants.js';
import { getChatConfig, getEffectiveProfile, getImageConfig, onProfilesChanged, usesSystemDefault } from './profiles.js';
import { apiFetch } from './auth.js';
import {
  cancelGenerationJob,
  createAbortError,
  fetchGenerationJob,
  waitForGenerationJob
} from './job-wait.js';
import { submitGenerationJob } from './jobs.js';
import { addLog } from './logs.js';
import { addPromptHistory } from './prompts.js';
import { readStringScoped, writeStringScoped } from './state.js';
import { confirmVolatileCustomKeyUse } from './volatile-secrets.js';
import {
  COMIC_PAGE_PANEL_LIMITS,
  COMIC_PAGE_COUNT_LIMITS,
  buildComicImagePrompt,
  clampComicPageCount,
  clampComicPagePanelCount,
  comicReferenceSpecs,
  comicStyleOptions,
  getComicStyleTemplate
} from '../../shared/comic-workflow.js';
import {
  ACTIVE_JOB_STATUSES,
  applyStoryboardEditorUpdates,
  FINAL_STATUSES,
  decodeEditorOriginalValue,
  encodeEditorOriginalValue,
  ensureStoryboardPageStoryboards,
  firstResultItem,
  generatedEntryFromJob,
  imageIdFromItem,
  itemPanelIndex,
  latestJobForPage,
  normalizedOrFallbackPageStoryboard,
  pageStoryboardContentEditorValue,
  pageStoryboardEditorEnabled,
  pageStoryboardEditorValue,
  pageStoryboardPanelCountEditorValue,
  parsePageStoryboardEditorValue,
  totalPagePanelCount
} from './comic-model.js';
import { comicResultsView } from './comic-view.js';

const COMIC_STORY_DRAFT_KEY = 'image-studio.comicStoryDraft.v1';
const JOB_WAIT_TIMEOUT_MS = 20 * 60 * 1000;

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
  return createAbortError(message);
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
  const view = comicResultsView(generatedPanels, storyboard);
  list.dataset.empty = view.empty ? 'true' : 'false';
  list.innerHTML = view.html;
}

function syncStoryboardFromEditors() {
  if (!storyboard?.panels) return;
  const panelPrompts = new Map();
  const pageStoryboardByIndex = new Map();
  const pagePanelCountByIndex = new Map();
  const pageContentByIndex = new Map();

  document.querySelectorAll('[data-comic-panel-prompt]').forEach((el) => {
    const index = Number(el.dataset.comicPanelPrompt);
    if (!Number.isInteger(index) || !storyboard.panels[index]) return;
    panelPrompts.set(index, el.value);
  });

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

  applyStoryboardEditorUpdates(storyboard, {
    panelPrompts,
    pageStoryboards: pageStoryboardByIndex,
    pagePanelCounts: pagePanelCountByIndex,
    pageContents: pageContentByIndex
  });
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
  if (!profileInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: '漫画页分镜任务' });
    if (!ok) return;
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
  return fetchGenerationJob(jobId, { apiFetch });
}

function waitForJob(jobId, { signal } = {}) {
  return waitForGenerationJob(jobId, {
    signal,
    fetchJob,
    eventTarget: window,
    timeoutMs: JOB_WAIT_TIMEOUT_MS,
    finalStatuses: FINAL_STATUSES,
    abortErrorFactory: abortError
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
  await cancelGenerationJob(jobId, { apiFetch });
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
  if (!imageInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: '漫画生图任务' });
    if (!ok) return;
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
