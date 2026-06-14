// 视频工作流面板：提示词 + 项目参考图 -> 关键帧规划 -> 关键帧图 -> 相邻帧间图。

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
import { selectOptionsHtml } from './select-options-view.js';
import {
  VIDEO_KEYFRAME_LIMITS,
  buildVideoBetweenPrompt,
  buildVideoKeyframePrompt,
  clampVideoKeyframeCount,
  normalizeVideoStoryboard,
  videoReferenceSpecsFromIndexes
} from '../../shared/video-workflow.js';
import {
  ACTIVE_JOB_STATUSES,
  FINAL_STATUSES,
  firstResultItem,
  generatedEntryFromJob,
  imageIdFromItem,
  imageSrcFromItem
} from './comic-model.js';

const VIDEO_PROMPT_DRAFT_KEY = 'image-studio.videoPromptDraft.v1';
const JOB_WAIT_TIMEOUT_MS = 20 * 60 * 1000;

let mounted = false;
let storyboard = null;
let currentProjectId = '';
let currentProjectPrompt = '';
let projectReferences = [];
let keyframeResults = [];
let betweenResults = Object.create(null);
let activeRun = null;
let activeStoryboardRequest = null;

function text(value = '') {
  return String(value ?? '').trim();
}

function renderSelect(id, items, selectedValue = '') {
  const el = $(id);
  if (!el) return;
  el.innerHTML = selectOptionsHtml(items, { selectedValue });
}

function setSelectValue(id, value) {
  const el = $(id);
  if (!el || value === undefined || value === null || value === '') return;
  el.value = String(value);
}

function renderOptions() {
  renderSelect('videoSize', SIZES);
  renderSelect('videoQuality', QUALITIES);
  renderSelect('videoOutputFormat', OUTPUT_FORMATS);
  const limit = $('videoKeyframeLimit');
  if (limit) {
    limit.min = String(VIDEO_KEYFRAME_LIMITS.min);
    limit.max = String(VIDEO_KEYFRAME_LIMITS.max);
    limit.placeholder = `留空：最多 ${VIDEO_KEYFRAME_LIMITS.max} 帧`;
  }
}

function syncVideoKeyframeLimit(value = undefined, { write = true } = {}) {
  const input = $('videoKeyframeLimit');
  const raw = value ?? input?.value;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (write && input && input.value !== '') input.value = '';
    return VIDEO_KEYFRAME_LIMITS.max;
  }
  const count = clampVideoKeyframeCount(raw);
  if (input && input.value !== String(count)) input.value = String(count);
  return count;
}

function normalizeProjectPrompt(value = '') {
  return text(value);
}

function readVideoConfig() {
  return {
    style: text($('videoGlobalStyle')?.value),
    motion: text($('videoGlobalMotion')?.value),
    negative: text($('videoGlobalNegative')?.value)
  };
}

function writeVideoConfig(config = {}) {
  if ($('videoGlobalStyle')) $('videoGlobalStyle').value = config.style || '';
  if ($('videoGlobalMotion')) $('videoGlobalMotion').value = config.motion || '';
  if ($('videoGlobalNegative')) $('videoGlobalNegative').value = config.negative || '';
}

function updateProfileDefaults() {
  const profile = getEffectiveProfile();
  const chat = getChatConfig(profile);
  const image = getImageConfig(profile);
  const mode = usesSystemDefault() ? '系统默认' : '个人覆盖';
  const label = profile ? `${profile.name || '未命名'} · ${mode}` : '-';
  const chip = $('videoActiveConfigName');
  if (chip) chip.textContent = label;

  const chatModel = $('videoChatModel');
  if (chatModel && chatModel.dataset.userEdited !== '1') {
    chatModel.value = chat?.defaultModel || DEFAULT_CHAT_MODEL;
  }
  const imageModel = $('videoImageModel');
  if (imageModel && imageModel.dataset.userEdited !== '1') {
    imageModel.value = image?.defaultModel || DEFAULT_IMAGE_MODEL;
  }
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

function abortError(message = '已停止视频生成。') {
  return createAbortError(message);
}

function showVideoError(message = '') {
  const el = $('videoError');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
}

function showVideoProgress(message = '', state = 'busy') {
  const wrap = $('videoProgress');
  const textEl = $('videoProgressText');
  if (!wrap || !textEl) return;
  wrap.hidden = !message;
  wrap.dataset.state = state;
  textEl.textContent = message || '';
}

function setBusy(isBusy) {
  $('videoAnalyze')?.toggleAttribute('disabled', isBusy);
  $('videoGenerateKeyframes')?.toggleAttribute('disabled', isBusy || !storyboard?.keyframes?.length);
  $('videoStop')?.toggleAttribute('disabled', !isBusy);
  $('videoReferenceUpload')?.toggleAttribute('disabled', isBusy);
}

function imageUrl(item = {}) {
  return imageSrcFromItem(item) || item.url || item.thumbnailUrl || '';
}

function normalizeReference(item = {}, index = 0) {
  const id = text(item.id ?? item.galleryId ?? item.gallery_id);
  if (!id) return null;
  const url = text(item.url ?? item.localUrl ?? item.local_url ?? item.previewUrl ?? item.thumbnailUrl);
  const thumbnailUrl = text(item.thumbnailUrl ?? item.thumbnail_url ?? item.previewUrl ?? item.url ?? url);
  return {
    id,
    label: text(item.label ?? item.filename ?? item.fileName) || `参考图 ${index + 1}`,
    url,
    thumbnailUrl: thumbnailUrl || url,
    source: text(item.source) || 'upload'
  };
}

function normalizeReferenceList(list = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const normalized = normalizeReference(item, out.length);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  return out;
}

function renderReferenceList() {
  const list = $('videoReferenceList');
  if (!list) return;
  if (!projectReferences.length) {
    list.dataset.empty = 'true';
    list.innerHTML = '<div class="reference-empty">还没有项目参考图。可先上传，也可以之后再上传并重新保存项目。</div>';
    return;
  }
  list.dataset.empty = 'false';
  list.innerHTML = projectReferences.map((ref, index) => {
    const src = ref.thumbnailUrl || ref.url;
    return `<article class="reference-item video-reference-item" data-video-reference-id="${escapeHtml(ref.id)}">
      ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(ref.label)}" loading="lazy" />` : '<div class="comic-result-placeholder">参考图</div>'}
      <div class="reference-item-meta"><span>#${index + 1}</span><span title="${escapeHtml(ref.label)}">${escapeHtml(ref.label)}</span></div>
    </article>`;
  }).join('');
}

function emptyStateHtml(message) {
  return `<div class="empty-state span-all"><div class="empty-icon" aria-hidden="true">▦</div><p>${escapeHtml(message)}</p></div>`;
}

function referenceCheckboxesHtml(frame = {}, frameIndex = 0) {
  if (!projectReferences.length) {
    return '<p class="hint">当前项目还没有参考图。可以先上传参考图，再为关键帧勾选。</p>';
  }
  const selected = new Set((Array.isArray(frame.referenceIndexes) ? frame.referenceIndexes : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0));
  return `<div class="video-frame-ref-grid">
    ${projectReferences.map((ref, index) => {
      const refIndex = index + 1;
      const src = ref.thumbnailUrl || ref.url;
      return `<label class="video-frame-ref-option${selected.has(refIndex) ? ' selected' : ''}">
        <input type="checkbox" data-video-keyframe-ref="${frameIndex}" value="${refIndex}" ${selected.has(refIndex) ? 'checked' : ''} />
        ${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" />` : ''}
        <span>#${refIndex} ${escapeHtml(ref.label)}</span>
      </label>`;
    }).join('')}
  </div>`;
}

function ensureStoryboardTransitions() {
  if (!storyboard?.keyframes?.length) return;
  const transitions = Array.isArray(storyboard.transitions) ? storyboard.transitions : [];
  storyboard.transitions = Array.from({ length: Math.max(0, storyboard.keyframes.length - 1) }, (_, index) => {
    const existing = transitions.find((item) => Number(item?.from ?? item?.fromIndex) === index + 1 && Number(item?.to ?? item?.toIndex) === index + 2)
      || transitions[index]
      || {};
    return {
      from: index + 1,
      to: index + 2,
      motion: existing.motion || '',
      camera: existing.camera || '',
      imagePrompt: existing.imagePrompt || existing.image_prompt || `生成第 ${index + 1} 到第 ${index + 2} 个关键帧之间的自然过渡画面。`,
      notes: existing.notes || ''
    };
  });
}

function renderStoryboard() {
  const box = $('videoStoryboard');
  if (!box) return;
  if (!storyboard?.keyframes?.length) {
    box.dataset.empty = 'true';
    box.innerHTML = emptyStateHtml('还没有关键帧规划。输入视频提示词后，点击“生成关键帧规划”。');
    return;
  }
  ensureStoryboardTransitions();
  box.dataset.empty = 'false';
  const meta = [storyboard.logline, storyboard.visualStyle, storyboard.continuityRules].filter(Boolean);
  box.innerHTML = `
    <section class="comic-bible video-bible">
      <h3>${escapeHtml(storyboard.title || '未命名视频')}</h3>
      ${meta.length ? `<p>${escapeHtml(meta.join(' · '))}</p>` : '<p>可编辑关键帧提示词和参考图选择后再生成图片。</p>'}
    </section>
    <div class="comic-panel-list video-keyframe-editor-list">
      ${storyboard.keyframes.map((frame, index) => `<article class="comic-panel-card video-keyframe-editor" data-video-keyframe-card="${index}">
        <header>
          <span class="comic-panel-index">K${index + 1}</span>
          <div>
            <strong>${escapeHtml(frame.beat || `关键帧 ${index + 1}`)}</strong>
            <p>${escapeHtml([frame.shot, frame.camera, frame.emotion].filter(Boolean).join(' · ') || '关键帧')}</p>
          </div>
        </header>
        <dl>
          ${frame.action ? `<div><dt>动作</dt><dd>${escapeHtml(frame.action)}</dd></div>` : ''}
          ${frame.composition ? `<div><dt>构图</dt><dd>${escapeHtml(frame.composition)}</dd></div>` : ''}
          ${frame.notes ? `<div><dt>连续性</dt><dd>${escapeHtml(frame.notes)}</dd></div>` : ''}
        </dl>
        <label class="field">
          <span>第 ${index + 1} 帧生图提示词</span>
          <textarea data-video-keyframe-prompt="${index}" rows="7">${escapeHtml(frame.imagePrompt || frame.beat || '')}</textarea>
        </label>
        <div class="video-frame-ref-picker">
          <strong>附带项目参考图</strong>
          ${referenceCheckboxesHtml(frame, index)}
        </div>
      </article>`).join('')}
    </div>`;
}

function statusLabel(status = 'pending') {
  const map = {
    pending: '待生成',
    queued: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时'
  };
  return map[status] || status || '待生成';
}

function resultImageHtml(entry = {}, alt = '生成图') {
  const src = imageUrl(entry.item || entry);
  if (!src) return '<div class="comic-result-placeholder">等待生成</div>';
  const download = entry.item?.downloadUrl || entry.item?.url || src;
  return `<div class="gallery-image-wrap">
    <button class="image-preview-trigger" type="button" disabled aria-label="${escapeHtml(alt)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />
    </button>
    <div class="card-actions"><a href="${escapeHtml(download)}" download>下载</a></div>
  </div>`;
}

function renderKeyframeResultCard(index) {
  const frame = storyboard?.keyframes?.[index] || {};
  const entry = keyframeResults[index] || { status: 'pending' };
  const status = entry.status || 'pending';
  const prompt = entry.prompt || frame.imagePrompt || '';
  return `<article class="image-card gallery-card comic-result-card video-keyframe-result" data-status="${escapeHtml(status)}" data-video-keyframe-result="${index}">
    ${resultImageHtml(entry, `第 ${index + 1} 个关键帧`)}
    <div class="image-meta"><span>K${index + 1}</span><span>${escapeHtml(statusLabel(status))}</span></div>
    <div class="image-meta compact-meta"><span>${escapeHtml(frame.beat || `关键帧 ${index + 1}`)}</span><span>${escapeHtml(entry.jobId ? entry.jobId.slice(0, 8) : '')}</span></div>
    ${entry.error ? `<p class="prompt-preview is-empty">${escapeHtml(entry.error)}</p>` : `<p class="prompt-preview" title="${escapeHtml(prompt)}">${escapeHtml(prompt || '暂无提示词')}</p>`}
    <div class="comic-result-actions">
      <button type="button" class="ghost small" data-video-generate-keyframe="${index}" ${activeRun ? 'disabled' : ''}>${imageIdFromItem(entry.item || {}) ? '重新生成' : '生成这一帧'}</button>
    </div>
  </article>`;
}

function transitionFor(fromIndex) {
  ensureStoryboardTransitions();
  return storyboard?.transitions?.[fromIndex - 1] || { from: fromIndex, to: fromIndex + 1, imagePrompt: '' };
}

function renderBetweenSlot(fromIndex) {
  const toIndex = fromIndex + 1;
  const key = `${fromIndex}-${toIndex}`;
  const entry = betweenResults[key] || { status: 'pending' };
  const leftId = imageIdFromItem(keyframeResults[fromIndex - 1]?.item || {});
  const rightId = imageIdFromItem(keyframeResults[toIndex - 1]?.item || {});
  const ready = Boolean(leftId && rightId);
  const transition = transitionFor(fromIndex);
  const status = entry.status || 'pending';
  return `<article class="image-card gallery-card comic-result-card video-between-result" data-status="${escapeHtml(status)}" data-video-between-result="${escapeHtml(key)}">
    ${resultImageHtml(entry, `第 ${fromIndex}-${toIndex} 帧间图`)}
    <div class="image-meta"><span>${escapeHtml(key)}</span><span>${escapeHtml(statusLabel(status))}</span></div>
    <label class="field video-transition-prompt-field">
      <span>帧间图提示词</span>
      <textarea data-video-transition-prompt="${fromIndex}" rows="5" ${ready ? '' : 'disabled'}>${escapeHtml(transition.imagePrompt || '')}</textarea>
    </label>
    <div class="comic-result-actions">
      <button type="button" class="primary small" data-video-generate-between="${fromIndex}" ${ready && !activeRun ? '' : 'disabled'}>${imageIdFromItem(entry.item || {}) ? '重新生成帧间图' : `生成 ${key} 帧间图`}</button>
    </div>
    ${ready ? '' : '<p class="hint video-between-hint">两端关键帧都完成后才能生成这个帧间图。</p>'}
  </article>`;
}

function renderResults() {
  const list = $('videoResults');
  if (!list) return;
  if (!storyboard?.keyframes?.length) {
    list.dataset.empty = 'true';
    list.innerHTML = emptyStateHtml('关键帧规划生成后，这里会显示关键帧和可生成的帧间图区间。');
    return;
  }
  list.dataset.empty = 'false';
  const parts = [];
  for (let i = 0; i < storyboard.keyframes.length; i += 1) {
    parts.push(renderKeyframeResultCard(i));
    if (i < storyboard.keyframes.length - 1) parts.push(renderBetweenSlot(i + 1));
  }
  list.innerHTML = parts.join('');
}

function renderAll() {
  renderReferenceList();
  renderStoryboard();
  renderResults();
  $('videoGenerateKeyframes')?.toggleAttribute('disabled', !storyboard?.keyframes?.length || Boolean(activeRun || activeStoryboardRequest));
}

function completedKeyframeCount() {
  return keyframeResults.filter((entry) => imageIdFromItem(entry?.item || {})).length;
}

function projectStatusFromKeyframes(fallback = 'generating') {
  const total = storyboard?.keyframes?.length || 0;
  return total > 0 && completedKeyframeCount() >= total ? 'completed' : fallback;
}

function syncStoryboardFromEditors() {
  if (!storyboard?.keyframes?.length) return;
  document.querySelectorAll('[data-video-keyframe-prompt]').forEach((el) => {
    const index = Number(el.dataset.videoKeyframePrompt);
    if (!Number.isInteger(index) || !storyboard.keyframes[index]) return;
    storyboard.keyframes[index].imagePrompt = text(el.value);
  });

  if (projectReferences.length) {
    storyboard.keyframes.forEach((frame) => { frame.referenceIndexes = []; });
    document.querySelectorAll('[data-video-keyframe-ref]').forEach((el) => {
      const index = Number(el.dataset.videoKeyframeRef);
      const refIndex = Number(el.value);
      if (!el.checked || !Number.isInteger(index) || !storyboard.keyframes[index]) return;
      if (!Number.isInteger(refIndex) || refIndex < 1 || refIndex > projectReferences.length) return;
      const refs = storyboard.keyframes[index].referenceIndexes || [];
      if (!refs.includes(refIndex)) refs.push(refIndex);
      storyboard.keyframes[index].referenceIndexes = refs.sort((a, b) => a - b);
    });
  }

  ensureStoryboardTransitions();
  document.querySelectorAll('[data-video-transition-prompt]').forEach((el) => {
    const from = Number(el.dataset.videoTransitionPrompt);
    if (!Number.isInteger(from) || from < 1 || !storyboard.transitions[from - 1]) return;
    storyboard.transitions[from - 1].imagePrompt = text(el.value);
  });
  storyboard.keyframeCount = storyboard.keyframes.length;
}

function collectVideoProjectPayload(status = 'draft') {
  const prompt = normalizeProjectPrompt($('videoPrompt')?.value || '');
  const frameCount = storyboard?.keyframes?.length || syncVideoKeyframeLimit(undefined, { write: false });
  return {
    id: currentProjectId || undefined,
    title: storyboard?.title || prompt.slice(0, 40) || '未命名视频',
    prompt,
    keyframeCount: frameCount,
    keyframeLimit: frameCount,
    chatModel: $('videoChatModel')?.value.trim() || DEFAULT_CHAT_MODEL,
    imageModel: $('videoImageModel')?.value.trim() || DEFAULT_IMAGE_MODEL,
    size: $('videoSize')?.value || 'auto',
    quality: $('videoQuality')?.value || 'auto',
    outputFormat: $('videoOutputFormat')?.value || 'auto',
    useReferences: true,
    status,
    config: readVideoConfig(),
    references: projectReferences,
    storyboard: storyboard || {}
  };
}

async function saveVideoProject(status = 'draft') {
  if (storyboard?.keyframes?.length) syncStoryboardFromEditors();
  const body = collectVideoProjectPayload(status);
  const endpoint = currentProjectId
    ? `/api/video-projects/${encodeURIComponent(currentProjectId)}`
    : '/api/video-projects';
  const resp = await apiFetch(endpoint, {
    method: currentProjectId ? 'PUT' : 'POST',
    body
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  const project = data.project || {};
  currentProjectId = project.id || currentProjectId;
  currentProjectPrompt = normalizeProjectPrompt(project.prompt ?? body.prompt);
  if (Array.isArray(project.references) && project.references.length) {
    projectReferences = normalizeReferenceList(project.references);
  }
  window.dispatchEvent(new CustomEvent('video-project-saved', { detail: { project } }));
  return project;
}

async function ensureVideoProject(status = 'draft') {
  return saveVideoProject(status);
}

async function uploadVideoReferences(ev) {
  const input = ev.target;
  const files = Array.from(input?.files || []);
  if (!files.length) return;
  showVideoError('');
  setStatus('正在上传视频项目参考图…', 'busy');
  try {
    await ensureVideoProject('draft');
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    const resp = await apiFetch(`/api/video-projects/${encodeURIComponent(currentProjectId)}/references`, {
      method: 'POST',
      body: form
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    projectReferences = normalizeReferenceList(data.references || data.project?.references || [
      ...projectReferences,
      ...(data.saved || [])
    ]);
    if (data.project?.id) currentProjectId = data.project.id;
    renderAll();
    setStatus(`已上传 ${files.length} 张视频参考图`, 'ok', 1600);
    showVideoProgress('参考图已保存到当前视频项目；规划或生成前可重新勾选每个关键帧使用哪些参考图。', 'ok');
  } catch (err) {
    const message = err?.message || String(err);
    showVideoError(message);
    setStatus('视频参考图上传失败', 'err', 2200);
  } finally {
    if (input) input.value = '';
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

async function cancelJobById(jobId) {
  await cancelGenerationJob(jobId, { apiFetch });
}

async function cancelCurrentJob() {
  const jobId = activeRun?.currentJobId;
  if (jobId) await cancelJobById(jobId);
}

async function cancelCurrentStoryboardJob() {
  const jobId = activeStoryboardRequest?.jobId;
  if (jobId) await cancelJobById(jobId);
}

function framePayload({ frame, index, imageInfo }) {
  const referenceIndexes = Array.isArray(frame.referenceIndexes) ? frame.referenceIndexes : [];
  const references = videoReferenceSpecsFromIndexes(projectReferences, referenceIndexes);
  const prompt = buildVideoKeyframePrompt({
    storyboard,
    keyframe: frame,
    index: index + 1,
    total: storyboard.keyframes.length,
    projectPrompt: normalizeProjectPrompt($('videoPrompt')?.value || ''),
    referenceCount: references.length,
    config: readVideoConfig()
  });
  const payload = {
    name: imageInfo.profile.name,
    useSystemDefault: imageInfo.systemMode,
    model: $('videoImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
    prompt,
    size: $('videoSize')?.value || 'auto',
    quality: $('videoQuality')?.value || 'auto',
    output_format: $('videoOutputFormat')?.value || 'auto',
    n: 1,
    videoProjectId: currentProjectId || undefined,
    videoFrameKind: 'keyframe',
    videoFrameIndex: index + 1
  };
  if (references.length) payload.references = references;
  if (!imageInfo.systemMode) {
    payload.baseUrl = imageInfo.config.baseUrl;
    payload.apiKey = imageInfo.config.apiKey;
  }
  return payload;
}

function betweenPayload({ fromIndex, imageInfo }) {
  const toIndex = fromIndex + 1;
  const transition = transitionFor(fromIndex);
  const fromFrame = storyboard.keyframes[fromIndex - 1] || {};
  const toFrame = storyboard.keyframes[toIndex - 1] || {};
  const fromId = imageIdFromItem(keyframeResults[fromIndex - 1]?.item || {});
  const toId = imageIdFromItem(keyframeResults[toIndex - 1]?.item || {});
  if (!fromId || !toId) throw new Error(`请先完成第 ${fromIndex} 和第 ${toIndex} 个关键帧。`);
  const prompt = buildVideoBetweenPrompt({
    storyboard,
    fromFrame,
    toFrame,
    transition,
    projectPrompt: normalizeProjectPrompt($('videoPrompt')?.value || ''),
    config: readVideoConfig()
  });
  const payload = {
    name: imageInfo.profile.name,
    useSystemDefault: imageInfo.systemMode,
    model: $('videoImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
    prompt,
    size: $('videoSize')?.value || 'auto',
    quality: $('videoQuality')?.value || 'auto',
    output_format: $('videoOutputFormat')?.value || 'auto',
    n: 1,
    references: [
      { type: 'gallery', id: fromId },
      { type: 'gallery', id: toId }
    ],
    videoProjectId: currentProjectId || undefined,
    videoFrameKind: 'between',
    videoFromIndex: fromIndex,
    videoToIndex: toIndex
  };
  if (!imageInfo.systemMode) {
    payload.baseUrl = imageInfo.config.baseUrl;
    payload.apiKey = imageInfo.config.apiKey;
  }
  return payload;
}

async function analyzeStoryboard() {
  showVideoError('');
  const prompt = normalizeProjectPrompt($('videoPrompt')?.value || '');
  if (!prompt) return showVideoError('请先输入视频提示词。');

  let profileInfo;
  try {
    profileInfo = resolveProfileConfig('chat');
  } catch (err) {
    return showVideoError(err.message || String(err));
  }
  if (!profileInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: '视频关键帧规划任务' });
    if (!ok) return;
  }

  const keyframeLimit = syncVideoKeyframeLimit();
  const model = $('videoChatModel')?.value.trim() || profileInfo.config.defaultModel || DEFAULT_CHAT_MODEL;
  const started = Date.now();
  const controller = new AbortController();
  activeStoryboardRequest = { controller, stopped: false, jobId: '' };
  setBusy(true);
  setStatus('正在提交视频关键帧规划任务…', 'busy');
  showVideoProgress(`正在保存项目并提交给 ${model}；模型会在最多 ${keyframeLimit} 个关键帧内决定实际数量。`, 'busy');

  try {
    await ensureVideoProject('draft');
    const payload = {
      name: profileInfo.profile.name,
      useSystemDefault: profileInfo.systemMode,
      model,
      prompt,
      keyframeLimit,
      keyframeCount: keyframeLimit,
      projectId: currentProjectId || undefined,
      videoProjectId: currentProjectId || undefined,
      imageModel: $('videoImageModel')?.value.trim() || DEFAULT_IMAGE_MODEL,
      size: $('videoSize')?.value || 'auto',
      quality: $('videoQuality')?.value || 'auto',
      outputFormat: $('videoOutputFormat')?.value || 'auto',
      config: readVideoConfig(),
      references: projectReferences,
      useReferences: true
    };
    if (!profileInfo.systemMode) {
      payload.chatBaseUrl = profileInfo.config.baseUrl;
      payload.chatApiKey = profileInfo.config.apiKey;
    }

    const resp = await apiFetch('/api/video-storyboards', {
      method: 'POST',
      body: payload,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const queuedJob = data.job || { id: data.jobId, status: data.status, position: data.position };
    if (!queuedJob?.id) throw new Error('关键帧规划任务提交成功但缺少任务 ID。');
    activeStoryboardRequest.jobId = queuedJob.id;

    const positionText = queuedJob.position ? `，当前第 ${queuedJob.position} 位` : '';
    setStatus(`视频关键帧规划已入队${positionText}`, 'ok', 1600);
    showVideoProgress(`规划任务 ${queuedJob.id.slice(0, 8)} 已入队${positionText}，完成后会自动回填并保存到“图库 → 视频项目”。`, 'busy');
    addLog('info', 'video.storyboard.queued', {
      jobId: queuedJob.id,
      model,
      profileName: profileInfo.profile.name,
      interfaceMode: profileInfo.systemMode ? 'system' : 'custom',
      keyframeLimit,
      projectId: currentProjectId
    });

    const job = FINAL_STATUSES.has(queuedJob.status)
      ? queuedJob
      : await waitForJob(queuedJob.id, { signal: controller.signal });
    if (job.status !== 'succeeded') {
      throw new Error(job.error || job.progress?.message || `关键帧规划任务失败：${job.status}`);
    }
    const result = job.result || {};
    const project = result.project || {};
    const nextStoryboard = result.storyboard || project.storyboard;
    if (!nextStoryboard?.keyframes?.length) throw new Error('关键帧规划完成但没有返回可用关键帧。');

    storyboard = normalizeVideoStoryboard(nextStoryboard, {
      prompt,
      keyframeLimit,
      maxReferenceCount: projectReferences.length
    });
    keyframeResults = storyboard.keyframes.map(() => ({ status: 'pending' }));
    betweenResults = Object.create(null);
    currentProjectId = project.id || currentProjectId;
    currentProjectPrompt = normalizeProjectPrompt(project.prompt ?? prompt);
    syncVideoKeyframeLimit(storyboard.keyframes.length);
    renderAll();
    if (project.id) window.dispatchEvent(new CustomEvent('video-project-saved', { detail: { project } }));
    addPromptHistory(prompt, {
      source: 'video',
      title: storyboard.title || prompt.slice(0, 28),
      tags: ['视频', '关键帧', '分镜'],
      model
    });
    addLog('info', 'video.storyboard.generated', {
      jobId: job.id,
      model: result.model || model,
      profileName: profileInfo.profile.name,
      interfaceMode: profileInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      keyframeCount: storyboard.keyframes.length,
      keyframeLimit,
      projectId: currentProjectId
    });
    setStatus('视频关键帧规划已生成', 'ok', 1800);
    showVideoProgress('关键帧规划已保存。你可以编辑每个关键帧提示词、勾选参考图，然后逐个生成关键帧。', 'ok');
  } catch (err) {
    const aborted = err.name === 'AbortError';
    const stopped = aborted && activeStoryboardRequest?.stopped;
    const message = aborted
      ? (stopped ? '关键帧规划已停止。' : '关键帧规划等待超时，请稍后在队列或图库中查看。')
      : (err.message || String(err));
    showVideoError(stopped ? '' : message);
    addLog(stopped ? 'info' : 'error', stopped ? 'video.storyboard.stopped' : 'video.storyboard.failed', {
      jobId: activeStoryboardRequest?.jobId || undefined,
      model,
      profileName: profileInfo.profile.name,
      durationMs: Date.now() - started,
      error: message
    });
    setStatus(stopped ? '视频关键帧规划已停止' : '视频关键帧规划失败', stopped ? 'ok' : 'err', 2200);
    showVideoProgress(stopped ? '已停止关键帧规划。' : message, stopped ? 'muted' : 'err');
  } finally {
    if (activeStoryboardRequest?.controller === controller) activeStoryboardRequest = null;
    setBusy(false);
  }
}

function ensureKeyframeResultSlots() {
  if (!storyboard?.keyframes?.length) return;
  keyframeResults = storyboard.keyframes.map((_, index) => keyframeResults[index] || { status: 'pending' });
}

async function runSingleGeneration({ payload, signal, progressMessage, onQueued, onSucceeded }) {
  const accepted = await submitGenerationJob(payload, { signal });
  const jobId = accepted.jobId || accepted.job?.id;
  if (!jobId) throw new Error('服务端没有返回生图任务 ID。');
  activeRun.currentJobId = jobId;
  onQueued?.(jobId);
  showVideoProgress(progressMessage(jobId), 'busy');
  if (signal?.aborted) {
    await cancelJobById(jobId);
    throw abortError();
  }
  const job = await waitForJob(jobId, { signal });
  if (job.status !== 'succeeded') {
    throw new Error(job.error || job.progress?.message || `生图任务失败：${job.status}`);
  }
  const item = firstResultItem(job);
  if (!item) throw new Error('生图任务没有返回可用图片。');
  onSucceeded?.(job, item);
  return { job, item };
}

async function generateKeyframes({ onSavedImages, onlyIndex = null } = {}) {
  showVideoError('');
  if (!storyboard?.keyframes?.length) return showVideoError('请先生成关键帧规划。');
  try {
    syncStoryboardFromEditors();
  } catch (err) {
    return showVideoError(err?.message || String(err));
  }
  let imageInfo;
  try {
    imageInfo = resolveProfileConfig('image');
  } catch (err) {
    return showVideoError(err.message || String(err));
  }
  if (!imageInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: '视频关键帧生图任务' });
    if (!ok) return;
  }

  try {
    await saveVideoProject('generating');
  } catch (err) {
    return showVideoError(`视频项目保存失败：${err.message || String(err)}`);
  }

  activeRun = { controller: new AbortController(), currentJobId: '', stopped: false, type: 'keyframes' };
  ensureKeyframeResultSlots();
  setBusy(true);
  renderResults();
  const started = Date.now();
  const indexes = Number.isInteger(onlyIndex)
    ? [onlyIndex]
    : storyboard.keyframes.map((_, index) => index);

  try {
    for (const index of indexes) {
      const existingId = imageIdFromItem(keyframeResults[index]?.item || {});
      if (!Number.isInteger(onlyIndex) && keyframeResults[index]?.status === 'succeeded' && existingId) continue;
      if (activeRun.controller.signal.aborted) throw abortError();

      if (ACTIVE_JOB_STATUSES.has(keyframeResults[index]?.status) && keyframeResults[index]?.jobId) {
        const jobId = keyframeResults[index].jobId;
        activeRun.currentJobId = jobId;
        showVideoProgress(`第 ${index + 1}/${storyboard.keyframes.length} 个关键帧已有任务 ${jobId.slice(0, 8)}，正在等待完成…`, 'busy');
        const job = await waitForJob(jobId, { signal: activeRun.controller.signal });
        if (job.status !== 'succeeded') throw new Error(job.error || job.progress?.message || `第 ${index + 1} 帧生成失败：${job.status}`);
        const item = firstResultItem(job);
        if (!item) throw new Error(`第 ${index + 1} 帧没有返回可用图片。`);
        keyframeResults[index] = { status: 'succeeded', jobId, item, prompt: keyframeResults[index]?.prompt || job.payload?.prompt || job.promptPreview || '' };
        renderResults();
        onSavedImages?.([item]);
        continue;
      }

      const frame = storyboard.keyframes[index];
      const payload = framePayload({ frame, index, imageInfo });
      keyframeResults[index] = { ...keyframeResults[index], status: 'queued', prompt: payload.prompt, error: '' };
      renderResults();
      showVideoProgress(`正在提交第 ${index + 1}/${storyboard.keyframes.length} 个关键帧到生图队列…`, 'busy');
      await runSingleGeneration({
        payload,
        signal: activeRun.controller.signal,
        progressMessage: (jobId) => `第 ${index + 1}/${storyboard.keyframes.length} 个关键帧任务 ${jobId.slice(0, 8)} 已入队，等待完成…`,
        onQueued: (jobId) => {
          keyframeResults[index] = { ...keyframeResults[index], status: 'running', jobId };
          renderResults();
        },
        onSucceeded: (job, item) => {
          keyframeResults[index] = { status: 'succeeded', jobId: job.id, item, prompt: payload.prompt };
          renderResults();
          onSavedImages?.([item]);
        }
      });
      try {
        await saveVideoProject(projectStatusFromKeyframes('generating'));
      } catch (saveErr) {
        addLog('error', 'video.project.save_failed', { error: saveErr.message || String(saveErr) });
      }
      showVideoProgress(`第 ${index + 1}/${storyboard.keyframes.length} 个关键帧完成。`, 'ok');
    }

    const completed = completedKeyframeCount();
    const status = completed >= storyboard.keyframes.length ? 'completed' : 'generating';
    try { await saveVideoProject(status); } catch {}
    addLog('info', 'video.keyframes.completed', {
      model: $('videoImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
      profileName: imageInfo.profile.name,
      interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      keyframeCount: storyboard.keyframes.length,
      completed,
      projectId: currentProjectId
    });
    setStatus(Number.isInteger(onlyIndex) ? '关键帧生成完成' : '视频关键帧生成完成', 'ok', 2200);
    showVideoProgress(completed >= storyboard.keyframes.length
      ? '关键帧已全部完成；现在可以选择相邻区间生成帧间图，例如 1-2、2-3。'
      : `已完成 ${completed}/${storyboard.keyframes.length} 个关键帧，可继续生成剩余关键帧。`, 'ok');
  } catch (err) {
    const stopped = err.name === 'AbortError';
    const message = stopped ? '视频关键帧生成已停止。' : (err.message || String(err));
    const current = keyframeResults.findIndex((item) => item.status === 'running' || item.status === 'queued');
    if (current >= 0 && keyframeResults[current]?.status !== 'succeeded') {
      keyframeResults[current] = { ...keyframeResults[current], status: stopped ? 'cancelled' : 'failed', error: message };
      renderResults();
    }
    showVideoError(stopped ? '' : message);
    addLog(stopped ? 'info' : 'error', stopped ? 'video.keyframes.stopped' : 'video.keyframes.failed', {
      profileName: imageInfo.profile.name,
      durationMs: Date.now() - started,
      error: message,
      projectId: currentProjectId
    });
    try { await saveVideoProject(stopped ? 'stopped' : 'failed'); } catch {}
    setStatus(stopped ? '视频关键帧生成已停止' : '视频关键帧生成失败', stopped ? 'ok' : 'err', 2200);
    showVideoProgress(stopped ? '已停止；再次点击生成会跳过已完成关键帧并继续。' : message, stopped ? 'muted' : 'err');
  } finally {
    activeRun = null;
    setBusy(false);
    renderResults();
  }
}

async function generateBetween(fromIndex, { onSavedImages } = {}) {
  showVideoError('');
  if (!storyboard?.keyframes?.length) return showVideoError('请先生成关键帧规划。');
  try { syncStoryboardFromEditors(); } catch (err) { return showVideoError(err?.message || String(err)); }
  let imageInfo;
  try { imageInfo = resolveProfileConfig('image'); } catch (err) { return showVideoError(err.message || String(err)); }
  if (!imageInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: `视频 ${fromIndex}-${fromIndex + 1} 帧间图任务` });
    if (!ok) return;
  }
  try { await saveVideoProject('generating'); } catch (err) { return showVideoError(`视频项目保存失败：${err.message || String(err)}`); }

  const key = `${fromIndex}-${fromIndex + 1}`;
  activeRun = { controller: new AbortController(), currentJobId: '', stopped: false, type: 'between' };
  setBusy(true);
  const started = Date.now();
  try {
    const payload = betweenPayload({ fromIndex, imageInfo });
    betweenResults[key] = { ...betweenResults[key], status: 'queued', prompt: payload.prompt, error: '' };
    renderResults();
    showVideoProgress(`正在提交 ${key} 帧间图到生图队列…`, 'busy');
    await runSingleGeneration({
      payload,
      signal: activeRun.controller.signal,
      progressMessage: (jobId) => `${key} 帧间图任务 ${jobId.slice(0, 8)} 已入队，等待完成…`,
      onQueued: (jobId) => {
        betweenResults[key] = { ...betweenResults[key], status: 'running', jobId };
        renderResults();
      },
      onSucceeded: (job, item) => {
        betweenResults[key] = { status: 'succeeded', jobId: job.id, item, prompt: payload.prompt };
        renderResults();
        onSavedImages?.([item]);
      }
    });
    try { await saveVideoProject(projectStatusFromKeyframes('generating')); } catch {}
    addLog('info', 'video.between.completed', {
      fromIndex,
      toIndex: fromIndex + 1,
      profileName: imageInfo.profile.name,
      interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      projectId: currentProjectId
    });
    setStatus(`${key} 帧间图生成完成`, 'ok', 1800);
    showVideoProgress(`${key} 帧间图已完成；可继续选择其他已完成相邻关键帧区间。`, 'ok');
  } catch (err) {
    const stopped = err.name === 'AbortError';
    const message = stopped ? '帧间图生成已停止。' : (err.message || String(err));
    betweenResults[key] = { ...betweenResults[key], status: stopped ? 'cancelled' : 'failed', error: message };
    renderResults();
    showVideoError(stopped ? '' : message);
    setStatus(stopped ? '帧间图生成已停止' : '帧间图生成失败', stopped ? 'ok' : 'err', 2200);
    showVideoProgress(stopped ? '已停止帧间图生成。' : message, stopped ? 'muted' : 'err');
  } finally {
    activeRun = null;
    setBusy(false);
    renderResults();
  }
}

function stopVideoRun() {
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

function videoFrameKindFromJob(job = {}) {
  return job.payload?.videoFrameKind || job.videoFrameKind || '';
}

function videoFrameIndexFromJob(job = {}) {
  const n = Number(job.payload?.videoFrameIndex ?? job.videoFrameIndex);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function videoBetweenKeyFromJob(job = {}) {
  const from = Number(job.payload?.videoFromIndex ?? job.videoFromIndex);
  const to = Number(job.payload?.videoToIndex ?? job.videoToIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) return '';
  return `${from}-${to}`;
}

function latestJob(matches = []) {
  return matches.sort((a, b) => {
    const ar = ACTIVE_JOB_STATUSES.has(a.status) ? 0 : 1;
    const br = ACTIVE_JOB_STATUSES.has(b.status) ? 0 : 1;
    if (ar !== br) return ar - br;
    return Number(b.updatedAt || b.finishedAt || b.createdAt || 0) - Number(a.updatedAt || a.finishedAt || a.createdAt || 0);
  })[0] || null;
}

function loadVideoProject(detail = {}) {
  const project = detail.project || detail;
  if (!project?.id) return;
  currentProjectId = project.id;
  currentProjectPrompt = normalizeProjectPrompt(project.prompt);
  storyboard = project.storyboard && Array.isArray(project.storyboard.keyframes)
    ? normalizeVideoStoryboard(project.storyboard, {
      prompt: project.prompt || '',
      keyframeLimit: project.keyframeCount || project.storyboard.keyframes.length,
      maxReferenceCount: (project.references || detail.references || []).length
    })
    : null;
  const promptEl = $('videoPrompt');
  if (promptEl) {
    promptEl.value = project.prompt || '';
    writeStringScoped(VIDEO_PROMPT_DRAFT_KEY, promptEl.value);
  }
  const existingLimit = Number(project.keyframeCount || storyboard?.keyframes?.length || 0);
  if (existingLimit) syncVideoKeyframeLimit(existingLimit);
  else if ($('videoKeyframeLimit')) $('videoKeyframeLimit').value = '';
  setSelectValue('videoSize', project.size);
  setSelectValue('videoQuality', project.quality);
  setSelectValue('videoOutputFormat', project.outputFormat);
  writeVideoConfig(project.config || {});
  const chatModel = $('videoChatModel');
  if (chatModel && project.chatModel) {
    chatModel.value = project.chatModel;
    chatModel.dataset.userEdited = '1';
  }
  const imageModel = $('videoImageModel');
  if (imageModel && project.imageModel) {
    imageModel.value = project.imageModel;
    imageModel.dataset.userEdited = '1';
  }

  projectReferences = normalizeReferenceList(project.references || detail.references || []);
  const images = Array.isArray(detail.images) ? detail.images : [];
  const jobs = Array.isArray(detail.jobs) ? detail.jobs : [];
  const keyframeImages = images.filter((item) => item.videoFrameKind === 'keyframe' || (!item.videoFrameKind && item.videoFrameIndex));
  const betweenImages = images.filter((item) => item.videoFrameKind === 'between');

  keyframeResults = storyboard?.keyframes?.length
    ? storyboard.keyframes.map((_, index) => {
      const frameNo = index + 1;
      const image = keyframeImages.find((item) => Number(item.videoFrameIndex) === frameNo) || null;
      if (image) return { status: 'succeeded', item: image, prompt: image.prompt || '' };
      const job = latestJob(jobs.filter((item) => videoFrameKindFromJob(item) === 'keyframe' && videoFrameIndexFromJob(item) === frameNo));
      return generatedEntryFromJob(job) || { status: 'pending' };
    })
    : keyframeImages.map((item) => ({ status: 'succeeded', item, prompt: item.prompt || '' }));

  betweenResults = Object.create(null);
  for (const item of betweenImages) {
    const from = Number(item.videoFromIndex);
    const to = Number(item.videoToIndex);
    if (Number.isInteger(from) && Number.isInteger(to)) {
      betweenResults[`${from}-${to}`] = { status: 'succeeded', item, prompt: item.prompt || '' };
    }
  }
  for (const job of jobs) {
    if (videoFrameKindFromJob(job) !== 'between') continue;
    const key = videoBetweenKeyFromJob(job);
    if (!key || betweenResults[key]?.status === 'succeeded') continue;
    betweenResults[key] = generatedEntryFromJob(job) || betweenResults[key] || { status: job.status || 'pending' };
  }

  renderAll();
  showVideoError('');
  const activeJobs = [
    ...keyframeResults,
    ...Object.values(betweenResults)
  ].filter((item) => ACTIVE_JOB_STATUSES.has(item.status) && item.jobId).length;
  showVideoProgress(activeJobs
    ? `已导入视频项目，并恢复 ${activeJobs} 个进行中的任务；再次点击生成会等待这些任务，避免重复提交。`
    : '已导入视频项目，可继续编辑关键帧、生成关键帧或生成帧间图。', 'ok');
}

function bindEvents({ onSavedImages } = {}) {
  $('videoAnalyze')?.addEventListener('click', analyzeStoryboard);
  $('videoGenerateKeyframes')?.addEventListener('click', () => generateKeyframes({ onSavedImages }));
  $('videoStop')?.addEventListener('click', stopVideoRun);
  $('videoReferenceUpload')?.addEventListener('change', uploadVideoReferences);
  $('videoPrompt')?.addEventListener('input', () => {
    writeStringScoped(VIDEO_PROMPT_DRAFT_KEY, $('videoPrompt').value);
  });
  $('videoKeyframeLimit')?.addEventListener('change', () => syncVideoKeyframeLimit());
  $('videoKeyframeLimit')?.addEventListener('blur', () => syncVideoKeyframeLimit());
  $('videoChatModel')?.addEventListener('input', () => { $('videoChatModel').dataset.userEdited = '1'; });
  $('videoImageModel')?.addEventListener('input', () => { $('videoImageModel').dataset.userEdited = '1'; });
  $('videoResults')?.addEventListener('click', (ev) => {
    const keyframeBtn = ev.target.closest('[data-video-generate-keyframe]');
    if (keyframeBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const index = Number(keyframeBtn.dataset.videoGenerateKeyframe);
      if (Number.isInteger(index)) generateKeyframes({ onSavedImages, onlyIndex: index });
      return;
    }
    const betweenBtn = ev.target.closest('[data-video-generate-between]');
    if (betweenBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const fromIndex = Number(betweenBtn.dataset.videoGenerateBetween);
      if (Number.isInteger(fromIndex)) generateBetween(fromIndex, { onSavedImages });
    }
  });
  window.addEventListener('video-project-import', (ev) => loadVideoProject(ev.detail || {}));
}

export function mountVideoPanel({ onSavedImages } = {}) {
  if (mounted) return;
  mounted = true;
  renderOptions();
  updateProfileDefaults();
  renderAll();
  const draft = readStringScoped(VIDEO_PROMPT_DRAFT_KEY, '');
  if (draft && $('videoPrompt')) $('videoPrompt').value = draft;
  bindEvents({ onSavedImages });
  onProfilesChanged(updateProfileDefaults);
  setBusy(false);
  $('videoGenerateKeyframes')?.toggleAttribute('disabled', true);
}
