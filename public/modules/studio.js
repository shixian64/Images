// Studio 面板：生成器 + 预估耗时 + ⌘⏎ 快捷键 + Prompt 草稿。
// 对应 docs §5.3 Studio 详细设计 + §5.1 键盘友好 + §5.6 状态与反馈。

import { $, escapeHtml, setStatus } from './dom.js';
import { KEYS, readStringScoped, writeStringScoped } from './state.js';
import {
  DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, OUTPUT_FORMATS, QUALITIES, SIZES,
  estimateDurationMs
} from '../../shared/constants.js';
import { getChatConfig, getEffectiveProfile, getImageConfig, onProfilesChanged, usesSystemDefault } from './profiles.js';
import { addLog } from './logs.js';
import { addPromptHistory } from './prompts.js';
import { apiFetch } from './auth.js';
import { submitGenerationJob } from './jobs.js';
import { confirmVolatileCustomKeyUse } from './volatile-secrets.js';
import { createImagePreviewController } from './image-preview.js';
import {
  buildPromptOptimizationMessages,
  cleanOptimizedPrompt,
  extractChatText,
  formatOptimizedPromptParagraphs
} from './studio-prompt-optimizer.js';

const PROMPT_OPTIMIZE_TIMEOUT_MS = 3 * 60 * 1000;
const PROMPT_SOURCE = Object.freeze({
  manual: 'manual',
  optimized: 'optimized'
});

let studioPreviewItems = [];
let studioPreviewPrompt = '';
const previewController = createImagePreviewController({
  ariaLabel: '原图预览',
  closeLabel: '关闭原图预览',
  closeAttribute: 'data-preview-close'
});
let selectedPromptSource = PROMPT_SOURCE.manual;
const renderedQueueJobIds = new Set();
const loggedQueueFinalJobIds = new Set();
let referenceItems = [];
let referenceSeq = 0;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function referenceId(prefix = 'ref') {
  referenceSeq += 1;
  return `${prefix}-${Date.now()}-${referenceSeq}`;
}

function revokeReferencePreview(item) {
  if (item?.type === 'upload' && item.previewUrl) {
    try { URL.revokeObjectURL(item.previewUrl); } catch { /* noop */ }
  }
}

function referencePreview(item = {}) {
  return item.previewUrl || item.url || item.local_url || item.localUrl || '';
}

function renderReferences() {
  const list = $('referenceList');
  const clearBtn = $('clearReferences');
  if (!list) return;
  if (clearBtn) clearBtn.disabled = referenceItems.length === 0;
  if (!referenceItems.length) {
    list.dataset.empty = 'true';
    list.innerHTML = '<div class="reference-empty">还没有参考图。生成结果卡片可点“加入参考图”。</div>';
    return;
  }
  list.dataset.empty = 'false';
  list.innerHTML = referenceItems.map((item, index) => {
    const src = referencePreview(item);
    const name = item.filename || item.name || (item.type === 'upload' ? '上传图片' : '图库图片');
    const source = item.type === 'upload' ? '上传' : '图库';
    const bytes = formatBytes(item.bytes);
    return `<article class="reference-item" data-reference-id="${escapeHtml(item.clientId)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(`参考图 ${index + 1}`)}" />
      <button class="reference-remove" type="button" data-reference-remove aria-label="移除参考图 ${index + 1}">移除</button>
      <div class="reference-item-meta">
        <span title="${escapeHtml(name)}">#${index + 1} ${escapeHtml(source)}</span>
        <span>${escapeHtml(bytes)}</span>
      </div>
    </article>`;
  }).join('');
}

function addUploadReferences(files) {
  const images = Array.from(files || []).filter((file) => (
    /^image\/(png|jpeg|jpg|webp)$/i.test(file.type || '')
    || /\.(png|jpe?g|webp)$/i.test(file.name || '')
  ));
  if (!images.length) {
    showError('请选择 PNG、JPEG 或 WebP 图片作为参考图。');
    return;
  }
  for (const file of images) {
    referenceItems.push({
      clientId: referenceId('upload'),
      type: 'upload',
      file,
      previewUrl: URL.createObjectURL(file),
      filename: file.name || 'upload.png',
      mimeType: file.type || '',
      bytes: file.size || 0
    });
  }
  showError('');
  renderReferences();
  setStatus(`已加入 ${images.length} 张上传参考图`, 'ok', 1400);
}

function addGalleryReference(item = {}, { focusPrompt = false } = {}) {
  const galleryId = item.gallery_id || item.galleryId || item.id;
  if (!galleryId) {
    showError('这张图片还没有保存到本地图库，无法作为参考图。');
    return false;
  }
  if (referenceItems.some((ref) => ref.type === 'gallery' && ref.galleryId === galleryId)) {
    setStatus('参考图已存在', 'ok', 1000);
    if (focusPrompt) $('prompt')?.focus();
    return true;
  }
  referenceItems.push({
    clientId: referenceId('gallery'),
    type: 'gallery',
    galleryId,
    previewUrl: imageSrcFromItem(item),
    filename: item.file_name || item.filename || 'gallery-image',
    bytes: item.bytes || 0,
    mimeType: item.mime_type || item.mimeType || ''
  });
  renderReferences();
  setStatus('已加入参考图', 'ok', 1400);
  if (focusPrompt) {
    $('prompt')?.focus();
    showTaskProgress('generate', '已加入参考图，请描述要如何编辑这张图片。');
    setTimeout(() => showTaskProgress('generate', ''), 2200);
  }
  return true;
}

function removeReference(clientId) {
  const index = referenceItems.findIndex((item) => item.clientId === clientId);
  if (index < 0) return;
  const [removed] = referenceItems.splice(index, 1);
  revokeReferencePreview(removed);
  renderReferences();
}

function clearReferences() {
  referenceItems.forEach(revokeReferencePreview);
  referenceItems = [];
  renderReferences();
}

function buildGenerationRequestBody(payload) {
  if (!referenceItems.length) return payload;

  const references = [];
  const uploads = [];
  referenceItems.forEach((item) => {
    if (item.type === 'upload') {
      const uploadKey = `ref_upload_${uploads.length}`;
      references.push({ type: 'upload', uploadKey });
      uploads.push({ key: uploadKey, file: item.file });
    } else {
      references.push({ type: 'gallery', id: item.galleryId });
    }
  });

  if (!uploads.length) {
    return { ...payload, references };
  }

  const form = new FormData();
  form.append('payload', JSON.stringify({ ...payload, references }));
  uploads.forEach(({ key, file }) => form.append(key, file, file.name || `${key}.png`));
  return form;
}

function renderSelect(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items
    .map((it) => `<option value="${it.value}">${it.label}</option>`)
    .join('');
}

function populateOptions() {
  renderSelect('size', SIZES);
  renderSelect('quality', QUALITIES);
  renderSelect('output_format', OUTPUT_FORMATS);
}

async function refreshGenerationConfig() {
  const nInput = $('n');
  if (!nInput) return;
  const fallbackMax = Math.max(1, Number(nInput.max) || 1);
  try {
    const resp = await apiFetch('/api/generate/config', { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    const max = Math.max(1, Math.floor(Number(data.maxImagesPerRequest) || fallbackMax));
    nInput.max = String(max);
    nInput.title = `单次最多 ${max} 张`;
    if ((Number(nInput.value) || 1) > max) nInput.value = String(max);
    updateEstimate();
  } catch {
    nInput.max = String(fallbackMax);
    if ((Number(nInput.value) || 1) > fallbackMax) nInput.value = String(fallbackMax);
    updateEstimate();
  }
}

function formatEstimate(ms) {
  if (ms < 1000) return `预估耗时 <1s`;
  const secs = Math.round(ms / 1000);
  return `预估耗时 ~${secs}s（基于参数的本地估算）`;
}

function updateEstimate() {
  const ms = estimateDurationMs($('size').value, $('quality').value);
  const maxN = Math.max(1, Number($('n').max) || 1);
  const n = Math.min(maxN, Math.max(1, Number($('n').value) || 1));
  $('estimate').textContent = formatEstimate(ms * n);
}

function updatePromptCount() {
  const len = ($('prompt').value || '').length;
  $('promptCount').textContent = len;
}

function showOptimizedPromptPane(show = true) {
  const workbench = $('promptWorkbench');
  const field = $('promptOptimizedField');
  if (workbench) workbench.dataset.optimized = show ? 'true' : 'false';
  if (field) field.hidden = !show;
  syncPromptSourceToggle();
}

function updateOptimizedPromptCount() {
  const el = $('optimizedPromptCount');
  if (!el) return;
  el.textContent = ($('optimizedPrompt')?.value || '').length;
}

function hasOptimizedPrompt() {
  return Boolean($('optimizedPrompt')?.value.trim()) && !$('promptOptimizedField')?.hidden;
}

function syncPromptSourceToggle() {
  const canUseOptimized = hasOptimizedPrompt();
  if (selectedPromptSource === PROMPT_SOURCE.optimized && !canUseOptimized) {
    selectedPromptSource = PROMPT_SOURCE.manual;
  }

  const workbench = $('promptWorkbench');
  if (workbench) workbench.dataset.promptSource = selectedPromptSource;

  for (const btn of document.querySelectorAll('[data-prompt-source]')) {
    const source = btn.dataset.promptSource;
    const active = source === selectedPromptSource;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (source === PROMPT_SOURCE.optimized) btn.disabled = !canUseOptimized;
  }
}

function selectPromptSource(source) {
  if (source === PROMPT_SOURCE.optimized && !hasOptimizedPrompt()) {
    showError('优化后提示词还没有生成，请先点击“优化提示词”。');
    return;
  }
  selectedPromptSource = source === PROMPT_SOURCE.optimized
    ? PROMPT_SOURCE.optimized
    : PROMPT_SOURCE.manual;
  showError('');
  syncPromptSourceToggle();
}

function getGenerationPrompt() {
  if (selectedPromptSource === PROMPT_SOURCE.optimized) {
    const optimized = $('optimizedPrompt')?.value.trim() || '';
    return { prompt: optimized, source: 'optimized' };
  }
  return { prompt: $('prompt').value.trim(), source: 'original' };
}

function updateActiveChip() {
  const p = getEffectiveProfile();
  const image = getImageConfig(p);
  const mode = usesSystemDefault() ? '系统默认' : '个人覆盖';
  const name = p?.name || '未命名';
  $('activeConfigName').textContent = p ? name : '-';
  $('activeProfileChip')?.setAttribute('title', p ? `${mode} · 生图 ${image.baseUrl || ''}` : '');
  const dot = document.querySelector('#activeProfileChip .dot');
  if (dot) dot.dataset.status = image?.testStatus === 'ok' ? 'ok'
    : image?.testStatus === 'err' ? 'err'
    : p?.status === 'active' && image?.hasApiKey !== false ? 'warn' : 'unknown';
  // Profile 切换后，把 model 预填成其 default（仅当用户没改过）
  if (image?.defaultModel && $('model').dataset.userEdited !== '1') {
    $('model').value = image.defaultModel;
  }
}

function showError(message) {
  const el = $('error');
  el.hidden = !message;
  el.textContent = message || '';
}

function showTaskProgress(kind, message) {
  const el = kind === 'optimize' ? $('optimizeProgress') : $('generateProgress');
  if (!el) return;
  const grid = el.closest('.progress-grid');
  const messageEl = el.querySelector('[data-progress-message]');
  if (!message) {
    el.hidden = true;
    if (messageEl) messageEl.textContent = '';
    if (grid) {
      grid.hidden = !Array.from(grid.querySelectorAll('.progress-task')).some((item) => !item.hidden);
    }
    return;
  }
  el.hidden = false;
  if (grid) grid.hidden = false;
  if (messageEl) messageEl.textContent = message;
}

function imageSrcFromItem(item) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

function openPreviewModal(item, trigger) {
  const src = imageSrcFromItem(item || {});
  if (!src) return false;

  const prompt = item?.revised_prompt || item?.revisedPrompt || studioPreviewPrompt || '';
  return previewController.open({
    src,
    alt: prompt || '生成图片原图',
    trigger
  });
}

function closePreviewModal() {
  return previewController.close();
}

function renderImages(items, prompt) {
  const gallery = $('gallery');
  if (!items.length) {
    studioPreviewItems = [];
    studioPreviewPrompt = '';
    gallery.dataset.empty = 'true';
    gallery.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⚠</div>
        <p>接口返回成功，但 <code>data[]</code> 为空。</p>
      </div>`;
    return;
  }
  studioPreviewItems = items;
  studioPreviewPrompt = prompt || '';
  gallery.dataset.empty = 'false';
  const altBase = escapeHtml((prompt || '').slice(0, 100));
  gallery.innerHTML = items.map((item, index) => {
    const src = imageSrcFromItem(item);
    const stem = `image-${Date.now()}-${index + 1}`;
    const downloadName = item.file_name || `${stem}.png`;
    const saveError = item.save_error
      ? `<p class="revised">本地保存失败：${escapeHtml(item.save_error)}</p>`
      : '';
    const galleryId = item.gallery_id || item.galleryId || '';
    const refDisabled = galleryId ? '' : 'disabled';
    return `<article class="image-card">
      <button class="image-preview-trigger" type="button" data-studio-index="${index}" aria-label="放大查看第 ${index + 1} 张生成图">
        <img src="${escapeHtml(src)}" alt="${altBase || `Generated image ${index + 1}`}" />
      </button>
      <div class="card-actions">
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
        <button type="button" data-studio-add-reference="${index}" ${refDisabled}>加入参考图</button>
        <button type="button" data-studio-edit-reference="${index}" ${refDisabled}>继续编辑</button>
      </div>
      ${saveError}
    </article>`;
  }).join('');
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue;
    const index = line.indexOf(':');
    const field = index === -1 ? line : line.slice(0, index);
    let value = index === -1 ? '' : line.slice(index + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') dataLines.push(value);
  }
  return { event, data: dataLines.join('\n') };
}

async function readGenerateStream(resp, { onProgress } = {}) {
  if (!resp.body?.getReader) throw new Error('当前浏览器不支持流式读取。');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let streamError = null;

  const dispatch = (block) => {
    const parsed = parseSseBlock(block);
    if (!parsed.data) return;
    let data;
    try { data = JSON.parse(parsed.data); } catch { data = { message: parsed.data }; }
    if (parsed.event === 'progress') onProgress?.(data);
    if (parsed.event === 'result') result = data;
    if (parsed.event === 'error') streamError = data;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();

    let index;
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      dispatch(block);
      if (result || streamError) {
        try { await reader.cancel(); } catch { /* noop */ }
        break;
      }
    }

    if (done || result || streamError) break;
  }

  if (!result && !streamError && buffer.trim()) dispatch(buffer);
  if (streamError) throw new Error(streamError.error || `HTTP ${streamError.status || 500}`);
  if (result) return result;
  throw new Error('生成连接已结束，但服务端没有返回结果。');
}

async function requestGenerate(payload, controller, started) {
  const supportsStream = typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';
  if (supportsStream) {
    const resp = await apiFetch('/api/generate/stream', {
      method: 'POST',
      headers: { accept: 'text/event-stream' },
      body: payload,
      signal: controller.signal
    });
    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('text/event-stream')) {
      return readGenerateStream(resp, {
        onProgress: (event) => {
          const elapsedMs = Number(event?.elapsedMs) || (Date.now() - started);
          const elapsed = Math.max(1, Math.round(elapsedMs / 1000));
          showTaskProgress('generate', `${event?.message || '仍在生成中…'}（${elapsed}s）`);
        }
      });
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  const resp = await apiFetch('/api/generate', {
    method: 'POST',
    body: payload,
    signal: controller.signal
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

async function optimizePrompt() {
  showError('');
  const profile = getEffectiveProfile();
  const chat = getChatConfig(profile);
  const systemMode = usesSystemDefault();
  if (!profile) return showError('请先在"配置"页面创建接口配置。');
  if (profile.status !== 'active') return showError(systemMode
    ? '系统默认接口未启用，请联系管理员或在"配置"页面启用个人覆盖。'
    : '当前接口未启用，请在"配置"页面切换为"启用"。');
  if (systemMode && chat.hasApiKey === false) {
    return showError('系统默认对话接口缺少 API Key，请联系管理员或在"配置"页面启用个人覆盖。');
  }
  if (!systemMode && !chat.apiKey) return showError('当前配置缺少对话 API Key。');

  const sourcePrompt = $('prompt').value.trim();
  if (!sourcePrompt) return showError('请先填写需要优化的提示词。');

  showOptimizedPromptPane(true);
  $('optimizedPrompt').value = '';
  updateOptimizedPromptCount();
  syncPromptSourceToggle();

  const payload = {
    name: profile.name,
    useSystemDefault: systemMode,
    quotaPurpose: 'prompt_optimize',
    model: chat.defaultModel || DEFAULT_CHAT_MODEL,
    messages: buildPromptOptimizationMessages(sourcePrompt)
  };
  if (!systemMode) {
    payload.chatBaseUrl = chat.baseUrl;
    payload.chatApiKey = chat.apiKey;
  }

  const button = $('optimizePrompt');
  button.disabled = true;
  setStatus('优化提示词中…', 'busy');
  showTaskProgress('optimize', `正在调用对话模型 ${payload.model} 优化提示词…`);

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROMPT_OPTIMIZE_TIMEOUT_MS);
  try {
    const resp = await apiFetch('/api/chat', {
      method: 'POST',
      body: payload,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const optimized = formatOptimizedPromptParagraphs(cleanOptimizedPrompt(extractChatText(data)));
    if (!optimized) throw new Error('对话模型没有返回优化后的提示词。');
    $('optimizedPrompt').value = optimized;
    updateOptimizedPromptCount();
    selectPromptSource(PROMPT_SOURCE.optimized);

    const durationMs = Date.now() - started;
    addPromptHistory(optimized, {
      source: 'optimizer',
      title: optimized.slice(0, 28),
      tags: ['优化'],
      model: payload.model
    });
    addLog('info', 'prompt.optimize.success', {
      model: payload.model,
      profileName: profile.name,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      sourceLength: sourcePrompt.length,
      optimizedLength: optimized.length
    });
    setStatus(`提示词已优化 · ${durationMs}ms`, 'ok', 2000);
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err.name === 'AbortError'
      ? '提示词优化请求超时，请稍后重试或检查对话接口配置。'
      : (err.message || String(err));
    showError(message);
    addLog('error', 'prompt.optimize.failed', {
      model: payload.model,
      profileName: profile.name,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      error: message
    });
    setStatus('优化失败', 'err', 2000);
  } finally {
    clearTimeout(timeoutId);
    button.disabled = false;
    showTaskProgress('optimize', '');
  }
}

async function generate({ onSavedImages } = {}) {
  showError('');
  const profile = getEffectiveProfile();
  const image = getImageConfig(profile);
  const systemMode = usesSystemDefault();
  if (!profile) return showError('请先在"配置"页面创建接口配置。');
  if (profile.status !== 'active') return showError(systemMode
    ? '系统默认接口未启用，请联系管理员或在"配置"页面启用个人覆盖。'
    : '当前接口未启用，请在"配置"页面切换为"启用"。');
  if (systemMode && image.hasApiKey === false) {
    return showError('系统默认生图接口缺少 API Key，请联系管理员或在"配置"页面启用个人覆盖。');
  }
  if (!systemMode && !image.apiKey) return showError('当前配置缺少生图 API Key。');

  const promptInfo = getGenerationPrompt();
  const prompt = promptInfo.prompt;
  if (!prompt) return showError(promptInfo.source === 'optimized'
    ? '当前选择的是优化后提示词，请先点击“优化提示词”生成内容，或切回“手动输入提示词”。'
    : '请填写手动输入提示词。');
  if (!systemMode) {
    const ok = await confirmVolatileCustomKeyUse({ taskLabel: '生图任务' });
    if (!ok) return;
  }

  const payload = {
    name: profile.name,
    useSystemDefault: systemMode,
    model: $('model').value.trim() || image.defaultModel || DEFAULT_IMAGE_MODEL,
    prompt,
    size: $('size').value,
    quality: $('quality').value,
    output_format: $('output_format').value,
    n: Math.min(
      Math.max(1, Number($('n').max) || 1),
      Math.max(1, Number($('n').value) || 1)
    )
  };
  const referenceCount = referenceItems.length;
  if (!systemMode) {
    payload.baseUrl = image.baseUrl;
    payload.apiKey = image.apiKey;
  }
  const requestBody = buildGenerationRequestBody(payload);

  addPromptHistory(prompt, {
    source: 'studio',
    title: prompt.slice(0, 28),
    tags: referenceCount ? ['编辑', '参考图'] : ['生成'],
    model: payload.model,
    size: payload.size,
    quality: payload.quality,
    outputFormat: payload.output_format,
    promptSource: promptInfo.source,
    referenceCount
  });

  $('generate').disabled = true;
  setStatus('正在加入队列…', 'busy');
  showTaskProgress('generate', `正在提交 ${payload.model} 到${referenceCount ? '编辑' : '生成'}队列…`);

  const started = Date.now();
  try {
    const data = await submitGenerationJob(requestBody);
    const durationMs = Date.now() - started;
    addLog('info', 'image.generate.queued', {
      model: payload.model,
      profileName: profile.name,
      apiKey: systemMode ? 'system-default' : image.apiKey,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      jobId: data.jobId,
      queuePosition: data.position,
      size: payload.size,
      quality: payload.quality,
      prompt,
      promptSource: promptInfo.source,
      referenceCount,
      mode: referenceCount ? 'edit' : 'generate'
    });
    const positionText = data.position ? `，第 ${data.position} 位` : '';
    showTaskProgress('generate', `已加入队列${positionText}。可在左侧队列面板查看进度。`);
    setStatus(`已加入队列${positionText}`, 'ok', 2000);
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err.message || String(err);
    showError(message);
    addLog('error', 'image.generate.failed', {
      model: payload.model,
      profileName: profile.name,
      apiKey: systemMode ? 'system-default' : image.apiKey,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      error: message,
      prompt,
      promptSource: promptInfo.source,
      referenceCount,
      mode: referenceCount ? 'edit' : 'generate'
    });
    setStatus('失败', 'err', 2000);
  } finally {
    $('generate').disabled = false;
    setTimeout(() => showTaskProgress('generate', ''), 2200);
  }
}

function handleQueueJobSucceeded(job, { onSavedImages, force = false } = {}) {
  if (job?.payload?.jobType) return;
  if (!job?.id || (renderedQueueJobIds.has(job.id) && !force)) return;
  const result = job.result || {};
  const items = Array.isArray(result.data) ? result.data : [];
  const prompt = job.payload?.prompt || job.promptPreview || '';
  renderImages(items, prompt);
  renderedQueueJobIds.add(job.id);
  if (items.some((item) => item.local_url || item.localUrl) || result.saved?.length) {
    onSavedImages?.(items);
  }
  showTaskProgress('generate', '');
  showError('');
  setStatus(`队列任务完成 · ${job.model || 'image'}`, 'ok', 2200);
}

function handleQueueJobFinished(job, { onSavedImages } = {}) {
  if (job?.payload?.jobType) return;
  if (!job?.id || loggedQueueFinalJobIds.has(job.id)) return;
  loggedQueueFinalJobIds.add(job.id);
  if (job.status === 'succeeded') {
    handleQueueJobSucceeded(job, { onSavedImages });
    addLog('info', 'image.generate.completed', {
      jobId: job.id,
      model: job.model,
      profileName: job.profileName,
      interfaceMode: job.payload?.interfaceMode || (job.payload?.useSystemDefault ? 'system' : 'custom'),
      durationMs: job.startedAt && job.finishedAt ? job.finishedAt - job.startedAt : undefined,
      imageCount: Array.isArray(job.result?.data) ? job.result.data.length : 0,
      prompt: job.payload?.prompt || '',
      size: job.payload?.size,
      quality: job.payload?.quality
    });
    return;
  }
  const message = job.error || job.progress?.message || '生成失败';
  showError(message);
  addLog('error', 'image.generate.failed', {
    jobId: job.id,
    model: job.model,
    profileName: job.profileName,
    interfaceMode: job.payload?.interfaceMode || (job.payload?.useSystemDefault ? 'system' : 'custom'),
    durationMs: job.startedAt && job.finishedAt ? job.finishedAt - job.startedAt : undefined,
    error: message,
    prompt: job.payload?.prompt || ''
  });
  setStatus(`队列任务${job.status === 'cancelled' ? '已取消' : '失败'}`, 'err', 2200);
}

// 外部调用：把日志里的 prompt 回填到 Studio。
export function loadPromptFromLog(prompt) {
  if (!prompt) return;
  $('prompt').value = prompt;
  if ($('optimizedPrompt')) $('optimizedPrompt').value = '';
  showOptimizedPromptPane(false);
  selectedPromptSource = PROMPT_SOURCE.manual;
  writeStringScoped(KEYS.promptDraft, prompt);
  updatePromptCount();
  updateOptimizedPromptCount();
  syncPromptSourceToggle();
}

export function mountStudioPanel({ onSavedImages } = {}) {
  populateOptions();
  refreshGenerationConfig();

  // 恢复 Prompt 草稿
  const draft = readStringScoped(KEYS.promptDraft, '');
  if (draft) $('prompt').value = draft;
  updatePromptCount();
  updateOptimizedPromptCount();
  syncPromptSourceToggle();
  updateEstimate();
  updateActiveChip();

  // 参数变化 → 更新预估
  for (const id of ['size', 'quality', 'n']) {
    $(id).addEventListener('change', updateEstimate);
    $(id).addEventListener('input', updateEstimate);
  }

  $('prompt').addEventListener('input', () => {
    updatePromptCount();
    writeStringScoped(KEYS.promptDraft, $('prompt').value);
  });
  $('optimizedPrompt')?.addEventListener('input', () => {
    updateOptimizedPromptCount();
    syncPromptSourceToggle();
  });

  for (const btn of document.querySelectorAll('[data-prompt-source]')) {
    btn.addEventListener('click', () => selectPromptSource(btn.dataset.promptSource));
  }

  // 标记用户手动改过 model，之后 profile 切换不再覆盖
  $('model').addEventListener('input', () => { $('model').dataset.userEdited = '1'; });

  $('generate').addEventListener('click', () => generate({ onSavedImages }));
  $('optimizePrompt')?.addEventListener('click', optimizePrompt);
  $('referenceUpload')?.addEventListener('change', (ev) => {
    addUploadReferences(ev.target.files);
    ev.target.value = '';
  });
  $('clearReferences')?.addEventListener('click', clearReferences);
  $('referenceList')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-reference-remove]');
    if (!btn) return;
    const item = btn.closest('[data-reference-id]');
    removeReference(item?.dataset?.referenceId || '');
  });
  window.addEventListener('studio-add-reference-image', (ev) => {
    addGalleryReference(ev.detail?.item || {}, { focusPrompt: Boolean(ev.detail?.focusPrompt) });
  });
  window.addEventListener('generation-job-succeeded', (ev) => {
    handleQueueJobSucceeded(ev.detail?.job, { onSavedImages, force: Boolean(ev.detail?.force) });
  });
  window.addEventListener('generation-job-finished', (ev) => {
    handleQueueJobFinished(ev.detail?.job, { onSavedImages });
  });
  $('gallery').addEventListener('click', (ev) => {
    const addBtn = ev.target.closest('[data-studio-add-reference]');
    if (addBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const index = Number(addBtn.dataset.studioAddReference);
      addGalleryReference(studioPreviewItems[index]);
      return;
    }
    const editBtn = ev.target.closest('[data-studio-edit-reference]');
    if (editBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const index = Number(editBtn.dataset.studioEditReference);
      addGalleryReference(studioPreviewItems[index], { focusPrompt: true });
      return;
    }
    const trigger = ev.target.closest('.image-preview-trigger');
    if (!trigger) return;
    const index = Number(trigger.dataset.studioIndex);
    openPreviewModal(studioPreviewItems[index], trigger);
  });

  // ⌘/Ctrl + Enter：在 textarea 内也能触发
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePreviewModal();
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      generate({ onSavedImages });
    }
  });

  // Profile 更新时刷新 chip 和 default model
  onProfilesChanged(updateActiveChip);
  renderReferences();
}
