// 视频工作流面板：提示词 + 项目参考图 -> 关键帧规划 -> 关键帧图 -> 相邻帧间图。

import { $, escapeHtml, setStatus } from './dom.js';
import { form as dialogForm } from './dialog.js';
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
import { createImagePreviewController } from './image-preview.js';
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
const VIDEO_TIMELINE_SCALE = 1_000_000;
const VIDEO_BETWEEN_COUNT_LIMITS = Object.freeze({
  min: 1,
  max: 8,
  defaultCoarse: 4,
  defaultRefine: 4
});

let mounted = false;
let storyboard = null;
let currentProjectId = '';
let currentProjectPrompt = '';
let projectReferences = [];
let keyframeResults = [];
let betweenResults = Object.create(null);
let activeStoryboardRequest = null;
let videoPromptEditorOpen = false;
const handledVideoFinalJobIds = new Set();
const videoPreviewController = createImagePreviewController({
  ariaLabel: '视频图片预览',
  closeLabel: '关闭视频图片预览',
  closeAttribute: 'data-video-preview-close'
});

const STATIC_VIDEO_PROMPT_FIELDS = {
  videoPrompt: {
    title: '修改视频提示词',
    label: '视频提示词',
    rows: 14,
    placeholder: '描述你想生成的视频内容、主体、场景和情绪。'
  },
  videoGlobalStyle: {
    title: '修改统一画风 / 角色 / 场景约束',
    label: '统一画风 / 角色 / 场景约束',
    rows: 9,
    placeholder: '例如：电影感，浅景深，霓虹反光；主角服装和角色特征保持一致。'
  },
  videoGlobalMotion: {
    title: '修改统一运动与镜头规则',
    label: '统一运动与镜头规则',
    rows: 8,
    placeholder: '例如：镜头运动、动作连续方向、帧间图过渡规则。'
  },
  videoGlobalNegative: {
    title: '修改负面约束',
    label: '负面约束',
    rows: 7,
    placeholder: '例如：不要文字、Logo、水印、UI 边框；不要突然更换服装或画风。'
  }
};

const VIDEO_PROMPT_EDITABLE_SELECTOR = [
  '#videoPrompt',
  '#videoGlobalStyle',
  '#videoGlobalMotion',
  '#videoGlobalNegative',
  '[data-video-keyframe-prompt]',
  '[data-video-transition-prompt]',
  '[data-video-keyframe-prompt-preview]'
].join(',');

function text(value = '') {
  return String(value ?? '').trim();
}

function setPromptTextareaValue(el, value) {
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function updateKeyframePrompt(index, value) {
  if (!storyboard?.keyframes?.[index]) return;
  const next = text(value);
  storyboard.keyframes[index].imagePrompt = next;
  document.querySelectorAll(`[data-video-keyframe-prompt="${index}"]`).forEach((el) => {
    setPromptTextareaValue(el, next);
  });
  keyframeResults[index] = { ...(keyframeResults[index] || { status: 'pending' }), prompt: next };
  renderResults();
  setStatus(`K${index + 1} 关键帧提示词已更新`, 'ok', 1600);
}

function updateTransitionPrompt(fromIndex, value) {
  ensureStoryboardTransitions();
  const transition = storyboard?.transitions?.[fromIndex - 1];
  if (!transition) return;
  const next = text(value);
  transition.imagePrompt = next;
  document.querySelectorAll(`[data-video-transition-prompt="${fromIndex}"]`).forEach((el) => {
    setPromptTextareaValue(el, next);
  });
  const key = `${fromIndex}-${fromIndex + 1}`;
  if (betweenResults[key]) betweenResults[key] = { ...betweenResults[key], prompt: next };
  renderResults();
  setStatus(`${key} 帧间图提示词已更新`, 'ok', 1600);
}

function videoPromptBindingFromTarget(target) {
  if (!target) return null;
  const staticField = target.id ? STATIC_VIDEO_PROMPT_FIELDS[target.id] : null;
  if (staticField) {
    return {
      ...staticField,
      getValue: () => target.value || '',
      setValue: (value) => {
        const next = text(value);
        setPromptTextareaValue(target, next);
        if (target.id === 'videoPrompt') writeStringScoped(VIDEO_PROMPT_DRAFT_KEY, next);
        setStatus(`${staticField.label}已更新`, 'ok', 1600);
      }
    };
  }

  const keyframeRaw = target.dataset?.videoKeyframePrompt ?? target.dataset?.videoKeyframePromptPreview;
  if (keyframeRaw !== undefined) {
    const index = Number(keyframeRaw);
    if (!Number.isInteger(index) || !storyboard?.keyframes?.[index]) return null;
    const frame = storyboard.keyframes[index];
    return {
      title: `修改 K${index + 1} 关键帧提示词`,
      label: `K${index + 1} 生图提示词`,
      rows: 14,
      placeholder: '描述这一关键帧的主体、动作、构图、光线和画面细节。',
      getValue: () => frame.imagePrompt || target.value || keyframeResults[index]?.prompt || '',
      setValue: (value) => updateKeyframePrompt(index, value)
    };
  }

  const transitionRaw = target.dataset?.videoTransitionPrompt;
  if (transitionRaw !== undefined) {
    const fromIndex = Number(transitionRaw);
    if (!Number.isInteger(fromIndex) || fromIndex < 1) return null;
    const transition = transitionFor(fromIndex);
    return {
      title: `修改 ${fromIndex}-${fromIndex + 1} 帧间图提示词`,
      label: `${fromIndex}-${fromIndex + 1} 帧间图提示词`,
      rows: 12,
      placeholder: '描述两张关键帧之间的自然过渡、动作承接、镜头运动和画面细节。',
      getValue: () => transition.imagePrompt || target.value || '',
      setValue: (value) => updateTransitionPrompt(fromIndex, value)
    };
  }

  return null;
}

async function openVideoPromptEditor(target) {
  if (videoPromptEditorOpen) return;
  try {
    if (storyboard?.keyframes?.length) syncStoryboardFromEditors();
  } catch {
    // Keep the editor available even if another transient field cannot be synced.
  }
  const binding = videoPromptBindingFromTarget(target);
  if (!binding) return;
  videoPromptEditorOpen = true;
  try {
    const original = binding.getValue();
    const result = await dialogForm({
      title: binding.title || '修改提示词',
      dialogClass: 'video-prompt-dialog',
      fields: [{
        name: 'prompt',
        label: binding.label || '提示词',
        type: 'textarea',
        value: original,
        rows: binding.rows || 12,
        placeholder: binding.placeholder || '输入提示词…',
        spellcheck: false
      }],
      confirmText: '保存提示词',
      cancelText: '取消'
    });
    if (!result.ok) return;
    const next = text(result.values.prompt);
    if (next === text(original)) return;
    binding.setValue(next);
  } finally {
    videoPromptEditorOpen = false;
  }
}

function videoPromptEditorTargetFromEvent(ev) {
  const target = ev.target?.closest?.(VIDEO_PROMPT_EDITABLE_SELECTOR);
  const panel = $('videoPanel');
  if (!target || !panel?.contains(target)) return null;
  return target;
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
  syncVideoBetweenCount('videoBetweenCoarseCount', VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse);
  syncVideoBetweenCount('videoBetweenRefineCount', VIDEO_BETWEEN_COUNT_LIMITS.defaultRefine);
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

function clampVideoBetweenCount(value, fallback = VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse) {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(VIDEO_BETWEEN_COUNT_LIMITS.max, Math.max(VIDEO_BETWEEN_COUNT_LIMITS.min, base));
}

function syncVideoBetweenCount(id, fallback = VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse) {
  const input = $(id);
  const count = clampVideoBetweenCount(input?.value, fallback);
  if (input) {
    input.min = String(VIDEO_BETWEEN_COUNT_LIMITS.min);
    input.max = String(VIDEO_BETWEEN_COUNT_LIMITS.max);
    input.value = String(count);
  }
  return count;
}

function videoBetweenCoarseCount() {
  return syncVideoBetweenCount('videoBetweenCoarseCount', VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse);
}

function videoBetweenRefineCount() {
  return syncVideoBetweenCount('videoBetweenRefineCount', VIDEO_BETWEEN_COUNT_LIMITS.defaultRefine);
}

function keyframeTick(index) {
  return Math.max(1, Math.floor(Number(index) || 1)) * VIDEO_TIMELINE_SCALE;
}

function normalizeTimelineTick(value) {
  const n = Math.floor(Number(value) || 0);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return n < VIDEO_TIMELINE_SCALE ? n * VIDEO_TIMELINE_SCALE : n;
}

function betweenPointKey(pointTick) {
  return String(normalizeTimelineTick(pointTick));
}

function segmentKey(fromTick, toTick) {
  return `${normalizeTimelineTick(fromTick)}-${normalizeTimelineTick(toTick)}`;
}

function ticksBetween(fromTick, toTick, count) {
  const start = normalizeTimelineTick(fromTick);
  const end = normalizeTimelineTick(toTick);
  const safeCount = clampVideoBetweenCount(count, VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse);
  if (!start || !end || end <= start) return [];
  const gap = end - start;
  if (gap <= safeCount) return [];
  return Array.from({ length: safeCount }, (_, index) => (
    Math.round(start + (gap * (index + 1)) / (safeCount + 1))
  )).filter((tick, index, list) => tick > start && tick < end && list.indexOf(tick) === index);
}

function pointLabel(pointTick) {
  const tick = normalizeTimelineTick(pointTick);
  if (!tick) return '';
  const whole = Math.floor(tick / VIDEO_TIMELINE_SCALE);
  const rest = tick - whole * VIDEO_TIMELINE_SCALE;
  if (!rest) return String(whole);

  // 第一层粗帧默认展示成用户熟悉的 1.1 / 1.2 / 1.3 / 1.4。
  const coarseDenominator = VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse + 1;
  const coarseSlot = Math.round((rest / VIDEO_TIMELINE_SCALE) * coarseDenominator);
  const coarseTick = Math.round((coarseSlot * VIDEO_TIMELINE_SCALE) / coarseDenominator);
  if (coarseSlot > 0 && coarseSlot < coarseDenominator && Math.abs(rest - coarseTick) <= 2) {
    return `${whole}.${coarseSlot}`;
  }

  const decimal = (tick / VIDEO_TIMELINE_SCALE).toFixed(4).replace(/0+$/, '').replace(/[.]$/, '');
  return decimal || String(whole);
}

function baseIntervalIndexForTick(tick) {
  const value = normalizeTimelineTick(tick);
  const max = storyboard?.keyframes?.length || 0;
  if (!value || max < 2) return 1;
  const raw = Math.floor((value - 1) / VIDEO_TIMELINE_SCALE);
  return Math.min(Math.max(1, raw), max - 1);
}

function updateBetweenEntry(pointTick, patch = {}) {
  const positionTick = normalizeTimelineTick(pointTick);
  if (!positionTick) return null;
  const key = betweenPointKey(positionTick);
  const existing = betweenResults[key] || {};
  betweenResults[key] = {
    ...existing,
    positionTick,
    fromTick: normalizeTimelineTick(patch.fromTick ?? existing.fromTick) || existing.fromTick || 0,
    toTick: normalizeTimelineTick(patch.toTick ?? existing.toTick) || existing.toTick || 0,
    ...patch,
    positionTick
  };
  return betweenResults[key];
}

function normalizeProjectPrompt(value = '') {
  return text(value);
}

function readVideoConfig() {
  return {
    style: text($('videoGlobalStyle')?.value),
    motion: text($('videoGlobalMotion')?.value),
    negative: text($('videoGlobalNegative')?.value),
    betweenCoarseCount: videoBetweenCoarseCount(),
    betweenRefineCount: videoBetweenRefineCount()
  };
}

function writeVideoConfig(config = {}) {
  if ($('videoGlobalStyle')) $('videoGlobalStyle').value = config.style || '';
  if ($('videoGlobalMotion')) $('videoGlobalMotion').value = config.motion || '';
  if ($('videoGlobalNegative')) $('videoGlobalNegative').value = config.negative || '';
  if ($('videoBetweenCoarseCount')) {
    $('videoBetweenCoarseCount').value = String(clampVideoBetweenCount(
      config.betweenCoarseCount,
      VIDEO_BETWEEN_COUNT_LIMITS.defaultCoarse
    ));
  }
  if ($('videoBetweenRefineCount')) {
    $('videoBetweenRefineCount').value = String(clampVideoBetweenCount(
      config.betweenRefineCount,
      VIDEO_BETWEEN_COUNT_LIMITS.defaultRefine
    ));
  }
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
          <textarea class="video-prompt-popout-target" data-video-keyframe-prompt="${index}" rows="7" spellcheck="false" title="点击弹窗编辑提示词">${escapeHtml(frame.imagePrompt || frame.beat || '')}</textarea>
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
    <button class="image-preview-trigger" type="button" data-video-result-preview aria-label="${escapeHtml(alt)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />
    </button>
    <div class="card-actions"><a href="${escapeHtml(download)}" download>下载</a></div>
  </div>`;
}

function previewEntryFromResultCard(card) {
  if (!card) return null;
  if (card.hasAttribute('data-video-keyframe-result')) {
    const index = Number(card.dataset.videoKeyframeResult);
    if (!Number.isInteger(index)) return null;
    return {
      entry: keyframeResults[index],
      alt: `关键帧 ${index + 1}`
    };
  }
  if (card.hasAttribute('data-video-between-result')) {
    const key = card.dataset.videoBetweenResult || '';
    if (!key) return null;
    return {
      entry: betweenResults[key],
      alt: `帧间图 ${pointLabel(key)}`
    };
  }
  return null;
}

function openVideoResultPreview(trigger) {
  const card = trigger?.closest?.('[data-video-keyframe-result], [data-video-between-result]');
  const preview = previewEntryFromResultCard(card);
  const entry = preview?.entry || {};
  const src = imageUrl(entry.item || entry);
  if (!src) return false;
  return videoPreviewController.open({
    src,
    alt: trigger?.getAttribute?.('aria-label') || preview?.alt || entry.prompt || '生成图片',
    trigger
  });
}

function closeVideoResultPreview() {
  return videoPreviewController.close();
}

function renderKeyframeResultCard(index) {
  const frame = storyboard?.keyframes?.[index] || {};
  const entry = keyframeResults[index] || { status: 'pending' };
  const status = entry.status || 'pending';
  const prompt = entry.prompt || frame.imagePrompt || '';
  const active = isActiveEntry(entry);
  return `<article class="image-card gallery-card comic-result-card video-keyframe-result" data-status="${escapeHtml(status)}" data-video-keyframe-result="${index}">
    ${resultImageHtml(entry, `第 ${index + 1} 个关键帧`)}
    <div class="image-meta"><span>K${index + 1}</span><span>${escapeHtml(statusLabel(status))}</span></div>
    <div class="image-meta compact-meta"><span>${escapeHtml(frame.beat || `关键帧 ${index + 1}`)}</span><span>${escapeHtml(entry.jobId ? entry.jobId.slice(0, 8) : '')}</span></div>
    ${entry.error ? `<p class="prompt-preview is-empty">${escapeHtml(entry.error)}</p>` : `<p class="prompt-preview video-prompt-preview-button" data-video-keyframe-prompt-preview="${index}" role="button" tabindex="0" title="${escapeHtml(prompt ? `点击修改提示词：${prompt}` : '点击修改提示词')}">${escapeHtml(prompt || '暂无提示词')}</p>`}
    <div class="comic-result-actions">
      <button type="button" class="ghost small" data-video-generate-keyframe="${index}" ${active ? 'disabled' : ''}>${active ? '已入队' : (imageIdFromItem(entry.item || {}) ? '重新生成' : '生成这一帧')}</button>
    </div>
  </article>`;
}

function transitionFor(fromIndex) {
  ensureStoryboardTransitions();
  return storyboard?.transitions?.[fromIndex - 1] || { from: fromIndex, to: fromIndex + 1, imagePrompt: '' };
}

function imageEntryForTick(tick) {
  const normalized = normalizeTimelineTick(tick);
  if (!normalized) return null;
  if (normalized % VIDEO_TIMELINE_SCALE === 0) {
    const index = normalized / VIDEO_TIMELINE_SCALE;
    return keyframeResults[index - 1] || null;
  }
  return betweenResults[betweenPointKey(normalized)] || null;
}

function imageIdForTick(tick) {
  return imageIdFromItem(imageEntryForTick(tick)?.item || {});
}

function isActiveEntry(entry = {}) {
  return ACTIVE_JOB_STATUSES.has(entry?.status);
}

function isSucceededEntry(entry = {}) {
  return entry?.status === 'succeeded' && Boolean(imageIdFromItem(entry.item || {}));
}

function hasQueueableBetweenTargets(segment = {}) {
  const normalized = normalizeBetweenSegment(segment);
  if (!normalized) return false;
  return normalized.targetTicks.some((pointTick) => {
    const entry = betweenResults[betweenPointKey(pointTick)] || {};
    if (isActiveEntry(entry)) return false;
    if (!normalized.force && isSucceededEntry(entry)) return false;
    return true;
  });
}

function frameForTick(tick) {
  const normalized = normalizeTimelineTick(tick);
  if (normalized % VIDEO_TIMELINE_SCALE === 0) {
    const index = normalized / VIDEO_TIMELINE_SCALE;
    return storyboard?.keyframes?.[index - 1] || {
      beat: `关键帧 ${index}`,
      imagePrompt: `关键帧 ${index}`
    };
  }
  const entry = betweenResults[betweenPointKey(normalized)] || {};
  const label = pointLabel(normalized);
  return {
    beat: `帧间图 ${label}`,
    imagePrompt: entry.prompt || `位于 ${label} 的过渡画面`,
    notes: entry.error || ''
  };
}

function intervalBetweenEntries(fromIndex) {
  const start = keyframeTick(fromIndex);
  const end = keyframeTick(fromIndex + 1);
  return Object.values(betweenResults)
    .map((entry) => ({
      ...entry,
      positionTick: normalizeTimelineTick(entry.positionTick ?? entry.videoFrameIndex)
    }))
    .filter((entry) => entry.positionTick > start && entry.positionTick < end)
    .sort((a, b) => a.positionTick - b.positionTick);
}

function timelinePointsForInterval(fromIndex) {
  const start = keyframeTick(fromIndex);
  const end = keyframeTick(fromIndex + 1);
  return [
    { tick: start, label: pointLabel(start), type: 'keyframe', entry: keyframeResults[fromIndex - 1] || { status: 'pending' } },
    ...intervalBetweenEntries(fromIndex).map((entry) => ({
      tick: entry.positionTick,
      label: pointLabel(entry.positionTick),
      type: 'between',
      entry
    })),
    { tick: end, label: pointLabel(end), type: 'keyframe', entry: keyframeResults[fromIndex] || { status: 'pending' } }
  ];
}

function timelineThumbHtml(point = {}) {
  const entry = point.entry || { status: 'pending' };
  const status = entry.status || 'pending';
  const src = imageUrl(entry.item || entry);
  const isBetween = point.type === 'between';
  const key = betweenPointKey(point.tick);
  const active = isActiveEntry(entry);
  const action = isBetween
    ? `<button type="button" class="ghost small" data-video-regenerate-between-point="${escapeHtml(key)}" ${active ? 'disabled' : ''}>${active ? '已入队' : (imageIdFromItem(entry.item || {}) ? '重生' : '重试')}</button>`
    : '';
  return `<div class="video-timeline-point ${escapeHtml(point.type || '')}" data-status="${escapeHtml(status)}" ${isBetween ? `data-video-between-result="${escapeHtml(key)}"` : ''}>
    <div class="video-timeline-thumb">
      ${src
        ? `<button class="image-preview-trigger" type="button" data-video-result-preview aria-label="${escapeHtml(point.label || '帧间图')}"><img src="${escapeHtml(src)}" alt="${escapeHtml(point.label || '')}" loading="lazy" /></button>`
        : `<span>${escapeHtml(point.type === 'keyframe' ? 'K' : 'B')}</span>`}
    </div>
    <div class="video-timeline-label"><strong>${escapeHtml(point.label || '')}</strong><span>${escapeHtml(statusLabel(status))}</span></div>
    ${entry.error ? `<p class="video-timeline-error">${escapeHtml(entry.error)}</p>` : ''}
    ${action}
  </div>`;
}

function refineButtonHtml(fromTick, toTick, { label = '', disabled = false } = {}) {
  const fromLabel = pointLabel(fromTick);
  const toLabel = pointLabel(toTick);
  const title = label || `${fromLabel}-${toLabel}`;
  const hasTargets = hasQueueableBetweenTargets({ fromTick, toTick, count: videoBetweenRefineCount() });
  return `<button type="button" class="ghost small" data-video-refine-segment="${escapeHtml(segmentKey(fromTick, toTick))}" ${disabled || !hasTargets ? 'disabled' : ''}>细化 ${escapeHtml(title)}</button>`;
}

function renderRefineControls(points = []) {
  if (points.length <= 2) {
    return '<p class="hint video-between-hint">先生成粗帧，再按 1-1.1、1.1-1.2 这类小段继续细化。</p>';
  }
  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    const ready = Boolean(imageIdForTick(left.tick) && imageIdForTick(right.tick));
    segments.push(refineButtonHtml(left.tick, right.tick, {
      label: `${left.label}-${right.label}`,
      disabled: !ready
    }));
  }
  return `<div class="video-between-refine-grid">${segments.join('')}</div>`;
}

function renderBetweenSlot(fromIndex) {
  const toIndex = fromIndex + 1;
  const key = `${fromIndex}-${toIndex}`;
  const leftId = imageIdForTick(keyframeTick(fromIndex));
  const rightId = imageIdForTick(keyframeTick(toIndex));
  const ready = Boolean(leftId && rightId);
  const transition = transitionFor(fromIndex);
  const entries = intervalBetweenEntries(fromIndex);
  const points = timelinePointsForInterval(fromIndex);
  const completed = entries.filter((entry) => imageIdFromItem(entry.item || {})).length;
  const active = entries.filter((entry) => ACTIVE_JOB_STATUSES.has(entry.status)).length;
  const failed = entries.filter((entry) => entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'timeout').length;
  const status = active ? 'running' : (failed ? 'failed' : (completed ? 'succeeded' : 'pending'));
  const coarseCount = videoBetweenCoarseCount();
  const refineCount = videoBetweenRefineCount();
  const coarseHasTargets = hasQueueableBetweenTargets({
    fromTick: keyframeTick(fromIndex),
    toTick: keyframeTick(toIndex),
    count: coarseCount
  });
  const refineAllHasTargets = refineSegmentsForInterval(fromIndex)
    .some((segment) => hasQueueableBetweenTargets(segment));
  return `<article class="image-card gallery-card comic-result-card video-between-result video-between-segment" data-status="${escapeHtml(status)}" data-video-between-segment="${fromIndex}">
    <div class="video-between-header">
      <div>
        <div class="image-meta"><span>${escapeHtml(key)} 帧间图</span><span>${escapeHtml(statusLabel(status))}</span></div>
        <p class="hint">先补 ${coarseCount} 张粗帧；满意后，可在相邻小段内每次再补 ${refineCount} 张细化帧。</p>
      </div>
      <button type="button" class="primary small" data-video-generate-between-coarse="${fromIndex}" ${ready && coarseHasTargets ? '' : 'disabled'}>生成/补齐 ${coarseCount} 张粗帧</button>
    </div>
    <div class="video-between-timeline">
      ${points.map(timelineThumbHtml).join('')}
    </div>
    <label class="field video-transition-prompt-field">
      <span>${escapeHtml(key)} 帧间图基础提示词</span>
      <textarea class="video-prompt-popout-target" data-video-transition-prompt="${fromIndex}" rows="5" spellcheck="false" title="点击弹窗编辑提示词">${escapeHtml(transition.imagePrompt || '')}</textarea>
    </label>
    <div class="comic-result-actions video-between-actions">
      ${renderRefineControls(points)}
      <button type="button" class="ghost small" data-video-refine-all-between="${fromIndex}" ${ready && points.length > 2 && refineAllHasTargets ? '' : 'disabled'}>细化全部小段</button>
    </div>
    ${ready ? '' : '<p class="hint video-between-hint">两端关键帧都完成后才能生成这个区间的帧间图。</p>'}
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
  $('videoGenerateKeyframes')?.toggleAttribute('disabled', !storyboard?.keyframes?.length || Boolean(activeStoryboardRequest));
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

function betweenPayload({ fromTick, toTick, pointTick, slot = 1, total = 1, imageInfo }) {
  const startTick = normalizeTimelineTick(fromTick);
  const endTick = normalizeTimelineTick(toTick);
  const targetTick = normalizeTimelineTick(pointTick);
  const fromLabel = pointLabel(startTick);
  const toLabel = pointLabel(endTick);
  const targetLabel = pointLabel(targetTick);
  const baseIndex = baseIntervalIndexForTick(startTick);
  const transition = transitionFor(baseIndex);
  const fromFrame = frameForTick(startTick);
  const toFrame = frameForTick(endTick);
  const fromId = imageIdForTick(startTick);
  const toId = imageIdForTick(endTick);
  if (!fromId || !toId) throw new Error(`请先完成 ${fromLabel} 和 ${toLabel} 两端画面。`);
  const referenceIds = [fromId, toId];
  const baseStartId = imageIdForTick(keyframeTick(baseIndex));
  const baseEndId = imageIdForTick(keyframeTick(baseIndex + 1));
  for (const id of [baseStartId, baseEndId]) {
    if (id && !referenceIds.includes(id)) referenceIds.push(id);
  }
  const targetLine = `目标时间点：${targetLabel}，这是 ${fromLabel}-${toLabel} 之间第 ${slot}/${total} 张帧间图；动作和构图必须严格落在两端之间，不要提前到达终点，也不要退回起点。`;
  const prompt = buildVideoBetweenPrompt({
    storyboard,
    fromFrame,
    toFrame,
    transition: {
      ...transition,
      imagePrompt: [transition.imagePrompt, targetLine].filter(Boolean).join('\n')
    },
    projectPrompt: normalizeProjectPrompt($('videoPrompt')?.value || ''),
    config: readVideoConfig(),
    fromLabel,
    toLabel,
    targetLabel,
    segmentLabel: `${fromLabel}-${toLabel}`
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
    references: referenceIds.map((id) => ({ type: 'gallery', id })),
    videoProjectId: currentProjectId || undefined,
    videoFrameKind: 'between',
    videoFrameIndex: targetTick,
    videoFromIndex: startTick,
    videoToIndex: endTick
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

async function queueSingleGeneration({ payload, progressMessage, onQueued }) {
  const accepted = await submitGenerationJob(payload);
  const job = accepted.job || {};
  const jobId = accepted.jobId || job.id;
  if (!jobId) throw new Error('服务端没有返回生图任务 ID。');
  onQueued?.(jobId, job);
  showVideoProgress(progressMessage(jobId, job), 'busy');
  return { jobId, job };
}

function keyframeGenerationIndexes(onlyIndex = null) {
  if (Number.isInteger(onlyIndex)) return [onlyIndex];
  return storyboard?.keyframes?.map((_, index) => index) || [];
}

function markKeyframeQueued(index, payload, jobId = '', job = {}) {
  const status = ACTIVE_JOB_STATUSES.has(job.status) ? job.status : 'queued';
  keyframeResults[index] = {
    ...(keyframeResults[index] || { status: 'pending' }),
    status,
    jobId,
    prompt: payload.prompt,
    error: ''
  };
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

  ensureKeyframeResultSlots();
  renderResults();
  const started = Date.now();
  const indexes = keyframeGenerationIndexes(onlyIndex);
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const index of indexes) {
    const existing = keyframeResults[index] || { status: 'pending' };
    const existingId = imageIdFromItem(existing.item || {});
    if (isActiveEntry(existing)) {
      skipped += 1;
      continue;
    }
    if (!Number.isInteger(onlyIndex) && existing.status === 'succeeded' && existingId) {
      skipped += 1;
      continue;
    }

    try {
      const frame = storyboard.keyframes[index];
      const payload = framePayload({ frame, index, imageInfo });
      markKeyframeQueued(index, payload);
      renderResults();
      showVideoProgress(`正在提交第 ${index + 1}/${storyboard.keyframes.length} 个关键帧到生图队列…`, 'busy');
      const { job } = await queueSingleGeneration({
        payload,
        progressMessage: (jobId) => `第 ${index + 1}/${storyboard.keyframes.length} 个关键帧任务 ${jobId.slice(0, 8)} 已入队；你可以继续提交其他关键帧或帧间图。`,
        onQueued: (jobId, queuedJob) => {
          markKeyframeQueued(index, payload, jobId, queuedJob);
          renderResults();
        }
      });
      queued += 1;
      if (FINAL_STATUSES.has(job.status)) {
        await applyVideoGenerationJobUpdate(job, { onSavedImages });
      }
    } catch (err) {
      failed += 1;
      const message = err?.message || String(err);
      errors.push(`K${index + 1}: ${message}`);
      keyframeResults[index] = {
        ...(keyframeResults[index] || { status: 'pending' }),
        status: 'failed',
        error: message
      };
      renderResults();
    }
  }

  try { await saveVideoProject(projectStatusFromKeyframes('generating')); } catch {}
  addLog(failed ? 'error' : 'info', failed ? 'video.keyframes.queue_failed' : 'video.keyframes.queued', {
    model: $('videoImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
    profileName: imageInfo.profile.name,
    interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
    durationMs: Date.now() - started,
    keyframeCount: storyboard.keyframes.length,
    queued,
    skipped,
    failed,
    projectId: currentProjectId
  });
  if (failed) {
    const message = errors[0] || '部分关键帧提交失败。';
    showVideoError(message);
    setStatus('部分关键帧入队失败', 'err', 2200);
    showVideoProgress(`已入队 ${queued} 个关键帧，${failed} 个提交失败。${message}`, 'err');
    return;
  }
  setStatus(queued ? '关键帧任务已入队' : '没有新的关键帧需要入队', queued ? 'ok' : 'muted', 1800);
  showVideoProgress(queued
    ? `已入队 ${queued} 个关键帧任务${skipped ? `，跳过 ${skipped} 个已完成/进行中的关键帧` : ''}；完成后会自动回填。`
    : `没有新的关键帧需要生成，已跳过 ${skipped} 个已完成/进行中的关键帧。`, queued ? 'busy' : 'muted');
}

function normalizeBetweenSegment(segment = {}) {
  const fromTick = normalizeTimelineTick(segment.fromTick);
  const toTick = normalizeTimelineTick(segment.toTick);
  if (!fromTick || !toTick || toTick <= fromTick) return null;
  const targetTicks = Array.isArray(segment.targetTicks)
    ? segment.targetTicks.map(normalizeTimelineTick).filter((tick) => tick > fromTick && tick < toTick)
    : ticksBetween(fromTick, toTick, segment.count ?? videoBetweenRefineCount());
  const uniqueTargets = [...new Set(targetTicks)].sort((a, b) => a - b);
  if (!uniqueTargets.length) return null;
  return {
    ...segment,
    fromTick,
    toTick,
    targetTicks: uniqueTargets,
    label: segment.label || `${pointLabel(fromTick)}-${pointLabel(toTick)}`
  };
}

function segmentFromKey(raw = '') {
  const [from, to] = String(raw || '').split('-').map(normalizeTimelineTick);
  return from && to && to > from ? { fromTick: from, toTick: to } : null;
}

function refineSegmentsForInterval(fromIndex) {
  const points = timelinePointsForInterval(fromIndex);
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    if (!imageIdForTick(left.tick) || !imageIdForTick(right.tick)) continue;
    out.push({
      fromTick: left.tick,
      toTick: right.tick,
      count: videoBetweenRefineCount(),
      label: `${left.label}-${right.label}`
    });
  }
  return out;
}

async function generateBetweenSegments(segments = [], { onSavedImages, taskLabel = '视频帧间图任务' } = {}) {
  showVideoError('');
  if (!storyboard?.keyframes?.length) return showVideoError('请先生成关键帧规划。');
  try { syncStoryboardFromEditors(); } catch (err) { return showVideoError(err?.message || String(err)); }
  const normalizedSegments = (Array.isArray(segments) ? segments : [segments])
    .map(normalizeBetweenSegment)
    .filter(Boolean);
  if (!normalizedSegments.length) return showVideoError('没有可生成的帧间图区间。');

  let imageInfo;
  try { imageInfo = resolveProfileConfig('image'); } catch (err) { return showVideoError(err.message || String(err)); }
  if (!imageInfo.systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel });
    if (!ok) return;
  }
  try { await saveVideoProject('generating'); } catch (err) { return showVideoError(`视频项目保存失败：${err.message || String(err)}`); }

  const started = Date.now();
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const segment of normalizedSegments) {
    const total = segment.targetTicks.length;
    for (let i = 0; i < total; i += 1) {
      const pointTick = segment.targetTicks[i];
      const pointKey = betweenPointKey(pointTick);
      const existing = betweenResults[pointKey] || {};
      const existingId = imageIdFromItem(existing.item || {});
      if (existing.status === 'succeeded' && existingId && !segment.force) {
        skipped += 1;
        continue;
      }
      if (isActiveEntry(existing)) {
        skipped += 1;
        continue;
      }

      try {
        const payload = betweenPayload({
          fromTick: segment.fromTick,
          toTick: segment.toTick,
          pointTick,
          slot: i + 1,
          total,
          imageInfo
        });
        updateBetweenEntry(pointTick, {
          fromTick: segment.fromTick,
          toTick: segment.toTick,
          status: 'queued',
          prompt: payload.prompt,
          error: ''
        });
        renderResults();
        showVideoProgress(`正在提交 ${pointLabel(pointTick)}（${segment.label} 第 ${i + 1}/${total} 张）到生图队列…`, 'busy');
        const { job } = await queueSingleGeneration({
          payload,
          progressMessage: (jobId) => `${pointLabel(pointTick)} 任务 ${jobId.slice(0, 8)} 已入队；不影响其他关键帧或帧间图继续入队。`,
          onQueued: (jobId, queuedJob) => {
            updateBetweenEntry(pointTick, {
              fromTick: segment.fromTick,
              toTick: segment.toTick,
              status: ACTIVE_JOB_STATUSES.has(queuedJob.status) ? queuedJob.status : 'queued',
              jobId,
              prompt: payload.prompt,
              error: ''
            });
            renderResults();
          }
        });
        queued += 1;
        if (FINAL_STATUSES.has(job.status)) {
          await applyVideoGenerationJobUpdate(job, { onSavedImages });
        }
      } catch (err) {
        failed += 1;
        const message = err?.message || String(err);
        errors.push(`${pointLabel(pointTick)}: ${message}`);
        updateBetweenEntry(pointTick, {
          fromTick: segment.fromTick,
          toTick: segment.toTick,
          status: 'failed',
          error: message
        });
        renderResults();
      }
    }
  }

  try { await saveVideoProject(projectStatusFromKeyframes('generating')); } catch {}
  addLog(failed ? 'error' : 'info', failed ? 'video.between.queue_failed' : 'video.between.queued', {
    segmentCount: normalizedSegments.length,
    queued,
    skipped,
    failed,
    profileName: imageInfo.profile.name,
    interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
    durationMs: Date.now() - started,
    projectId: currentProjectId
  });
  if (failed) {
    const message = errors[0] || '部分帧间图提交失败。';
    showVideoError(message);
    setStatus('部分帧间图入队失败', 'err', 2200);
    showVideoProgress(`已入队 ${queued} 张帧间图，${failed} 张提交失败。${message}`, 'err');
    return;
  }
  setStatus(queued ? '帧间图任务已入队' : '没有新的帧间图需要入队', queued ? 'ok' : 'muted', 1800);
  showVideoProgress(queued
    ? `已入队 ${queued} 张帧间图${skipped ? `，跳过 ${skipped} 张已完成/进行中的帧` : ''}；完成后会自动回填，可继续提交不相关的关键帧或小段。`
    : `没有新帧需要生成，已跳过 ${skipped} 张已完成/进行中的帧。`, queued ? 'busy' : 'muted');
}

function stopVideoRun() {
  if (activeStoryboardRequest) {
    activeStoryboardRequest.stopped = true;
    activeStoryboardRequest.controller.abort();
    cancelCurrentStoryboardJob();
    return;
  }
  showVideoProgress('普通生图任务已独立加入左侧队列；如需取消，请在队列中取消对应任务。', 'muted');
}

function videoFrameKindFromJob(job = {}) {
  return job.payload?.videoFrameKind || job.videoFrameKind || '';
}

function videoFrameIndexFromJob(job = {}) {
  const n = Number(job.payload?.videoFrameIndex ?? job.videoFrameIndex);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function videoBetweenMetaFromSource(source = {}) {
  const payload = source.payload || source;
  const fromTick = normalizeTimelineTick(
    payload.videoFromIndex ?? payload.video_from_index ?? source.videoFromIndex ?? source.video_from_index
  );
  const toTick = normalizeTimelineTick(
    payload.videoToIndex ?? payload.video_to_index ?? source.videoToIndex ?? source.video_to_index
  );
  let positionTick = normalizeTimelineTick(
    payload.videoFrameIndex ?? payload.video_frame_index ?? source.videoFrameIndex ?? source.video_frame_index
  );
  if (!positionTick && fromTick && toTick && toTick > fromTick) {
    positionTick = Math.round((fromTick + toTick) / 2);
  }
  return {
    fromTick,
    toTick,
    positionTick,
    key: positionTick ? betweenPointKey(positionTick) : ''
  };
}

function videoProjectIdFromJob(job = {}) {
  return text(job.payload?.videoProjectId ?? job.videoProjectId ?? job.projectId);
}

function isCurrentVideoGenerationJob(job = {}) {
  const kind = videoFrameKindFromJob(job);
  if (kind !== 'keyframe' && kind !== 'between') return false;
  const projectId = videoProjectIdFromJob(job);
  return Boolean(projectId && currentProjectId && projectId === currentProjectId);
}

function videoEntryFromJob(job = {}) {
  const prompt = job.payload?.prompt || job.promptPreview || '';
  const item = firstResultItem(job);
  if (job.status === 'succeeded') {
    return item
      ? { status: 'succeeded', jobId: job.id, item, prompt, error: '' }
      : { status: 'failed', jobId: job.id, prompt, error: '生图任务没有返回可用图片。' };
  }
  return generatedEntryFromJob(job) || {
    status: job.status === 'timeout' ? 'failed' : (job.status || 'failed'),
    jobId: job.id,
    prompt,
    error: job.error || job.progress?.message || ''
  };
}

async function applyVideoGenerationJobUpdate(job = {}, { onSavedImages } = {}) {
  if (!job?.id || !FINAL_STATUSES.has(job.status) || !isCurrentVideoGenerationJob(job)) return false;
  if (handledVideoFinalJobIds.has(job.id)) return true;
  handledVideoFinalJobIds.add(job.id);

  const entry = videoEntryFromJob(job);
  const item = entry.status === 'succeeded' ? firstResultItem(job) : null;
  const kind = videoFrameKindFromJob(job);
  if (kind === 'keyframe') {
    const frameNo = videoFrameIndexFromJob(job);
    const index = frameNo ? frameNo - 1 : -1;
    if (!storyboard?.keyframes?.[index]) return false;
    keyframeResults[index] = {
      ...(keyframeResults[index] || { status: 'pending' }),
      ...entry,
      prompt: entry.prompt || keyframeResults[index]?.prompt || ''
    };
    renderResults();
    if (item) onSavedImages?.([item]);
    setStatus(entry.status === 'succeeded' ? `K${frameNo} 已完成` : `K${frameNo} 生成失败`, entry.status === 'succeeded' ? 'ok' : 'err', 1600);
    showVideoProgress(entry.status === 'succeeded'
      ? `关键帧 K${frameNo} 已回填。`
      : `关键帧 K${frameNo} 生成失败：${entry.error || job.status}`, entry.status === 'succeeded' ? 'ok' : 'err');
  } else {
    const meta = videoBetweenMetaFromSource(job);
    if (!meta.key || !meta.positionTick) return false;
    updateBetweenEntry(meta.positionTick, {
      ...entry,
      prompt: entry.prompt || betweenResults[meta.key]?.prompt || '',
      fromTick: meta.fromTick,
      toTick: meta.toTick
    });
    renderResults();
    if (item) onSavedImages?.([item]);
    setStatus(entry.status === 'succeeded' ? `${pointLabel(meta.positionTick)} 已完成` : `${pointLabel(meta.positionTick)} 生成失败`, entry.status === 'succeeded' ? 'ok' : 'err', 1600);
    showVideoProgress(entry.status === 'succeeded'
      ? `帧间图 ${pointLabel(meta.positionTick)} 已回填。`
      : `帧间图 ${pointLabel(meta.positionTick)} 生成失败：${entry.error || job.status}`, entry.status === 'succeeded' ? 'ok' : 'err');
  }

  try {
    await saveVideoProject(projectStatusFromKeyframes('generating'));
  } catch (err) {
    addLog('error', 'video.project.save_failed', { error: err.message || String(err), projectId: currentProjectId });
  }
  return true;
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
    const meta = videoBetweenMetaFromSource(item);
    if (!meta.key) continue;
    betweenResults[meta.key] = {
      status: 'succeeded',
      item,
      prompt: item.prompt || '',
      fromTick: meta.fromTick,
      toTick: meta.toTick,
      positionTick: meta.positionTick
    };
  }
  for (const job of jobs) {
    if (videoFrameKindFromJob(job) !== 'between') continue;
    const meta = videoBetweenMetaFromSource(job);
    const key = meta.key;
    if (!key || betweenResults[key]?.status === 'succeeded') continue;
    betweenResults[key] = {
      ...(generatedEntryFromJob(job) || betweenResults[key] || { status: job.status || 'pending' }),
      fromTick: meta.fromTick,
      toTick: meta.toTick,
      positionTick: meta.positionTick
    };
  }

  renderAll();
  showVideoError('');
  const activeJobs = [
    ...keyframeResults,
    ...Object.values(betweenResults)
  ].filter((item) => ACTIVE_JOB_STATUSES.has(item.status) && item.jobId).length;
  showVideoProgress(activeJobs
    ? `已导入视频项目，并恢复 ${activeJobs} 个进行中的任务；再次点击生成会跳过这些任务，其他不相关帧仍可继续入队。`
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
  $('videoBetweenCoarseCount')?.addEventListener('change', () => { videoBetweenCoarseCount(); renderResults(); });
  $('videoBetweenCoarseCount')?.addEventListener('blur', () => { videoBetweenCoarseCount(); renderResults(); });
  $('videoBetweenRefineCount')?.addEventListener('change', () => { videoBetweenRefineCount(); renderResults(); });
  $('videoBetweenRefineCount')?.addEventListener('blur', () => { videoBetweenRefineCount(); renderResults(); });
  $('videoChatModel')?.addEventListener('input', () => { $('videoChatModel').dataset.userEdited = '1'; });
  $('videoImageModel')?.addEventListener('input', () => { $('videoImageModel').dataset.userEdited = '1'; });
  $('videoPanel')?.addEventListener('click', (ev) => {
    const promptTarget = videoPromptEditorTargetFromEvent(ev);
    if (!promptTarget) return;
    ev.preventDefault();
    ev.stopPropagation();
    openVideoPromptEditor(promptTarget);
  });
  $('videoPanel')?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const promptTarget = videoPromptEditorTargetFromEvent(ev);
    if (!promptTarget?.matches?.('[data-video-keyframe-prompt-preview]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    openVideoPromptEditor(promptTarget);
  });
  $('videoResults')?.addEventListener('click', (ev) => {
    const previewBtn = ev.target.closest('[data-video-result-preview]');
    if (previewBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      openVideoResultPreview(previewBtn);
      return;
    }
    const keyframeBtn = ev.target.closest('[data-video-generate-keyframe]');
    if (keyframeBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const index = Number(keyframeBtn.dataset.videoGenerateKeyframe);
      if (Number.isInteger(index)) generateKeyframes({ onSavedImages, onlyIndex: index });
      return;
    }
    const coarseBtn = ev.target.closest('[data-video-generate-between-coarse]');
    if (coarseBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const fromIndex = Number(coarseBtn.dataset.videoGenerateBetweenCoarse);
      if (Number.isInteger(fromIndex)) {
        generateBetweenSegments([{
          fromTick: keyframeTick(fromIndex),
          toTick: keyframeTick(fromIndex + 1),
          count: videoBetweenCoarseCount(),
          label: `${fromIndex}-${fromIndex + 1} 粗帧`
        }], { onSavedImages, taskLabel: `视频 ${fromIndex}-${fromIndex + 1} 粗帧间图任务` });
      }
      return;
    }
    const refineBtn = ev.target.closest('[data-video-refine-segment]');
    if (refineBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const segment = segmentFromKey(refineBtn.dataset.videoRefineSegment);
      if (segment) {
        generateBetweenSegments([{ ...segment, count: videoBetweenRefineCount() }], {
          onSavedImages,
          taskLabel: `视频 ${pointLabel(segment.fromTick)}-${pointLabel(segment.toTick)} 细化帧任务`
        });
      }
      return;
    }
    const refineAllBtn = ev.target.closest('[data-video-refine-all-between]');
    if (refineAllBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const fromIndex = Number(refineAllBtn.dataset.videoRefineAllBetween);
      if (Number.isInteger(fromIndex)) {
        generateBetweenSegments(refineSegmentsForInterval(fromIndex), {
          onSavedImages,
          taskLabel: `视频 ${fromIndex}-${fromIndex + 1} 全部小段细化任务`
        });
      }
      return;
    }
    const retryPointBtn = ev.target.closest('[data-video-regenerate-between-point]');
    if (retryPointBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const pointTick = normalizeTimelineTick(retryPointBtn.dataset.videoRegenerateBetweenPoint);
      const entry = betweenResults[betweenPointKey(pointTick)] || {};
      if (pointTick && entry.fromTick && entry.toTick) {
        generateBetweenSegments([{
          fromTick: entry.fromTick,
          toTick: entry.toTick,
          targetTicks: [pointTick],
          force: true,
          label: `${pointLabel(entry.fromTick)}-${pointLabel(entry.toTick)}`
        }], { onSavedImages, taskLabel: `视频 ${pointLabel(pointTick)} 帧间图重生任务` });
      }
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeVideoResultPreview();
  });
  window.addEventListener('video-project-import', (ev) => loadVideoProject(ev.detail || {}));
  window.addEventListener('generation-job-finished', (ev) => {
    applyVideoGenerationJobUpdate(ev.detail?.job, { onSavedImages });
  });
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
