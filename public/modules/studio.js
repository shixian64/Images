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

const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;
const PROMPT_OPTIMIZE_TIMEOUT_MS = 3 * 60 * 1000;
const PROMPT_SOURCE = Object.freeze({
  manual: 'manual',
  optimized: 'optimized'
});

let studioPreviewItems = [];
let studioPreviewPrompt = '';
let previewModal = null;
let lastPreviewTrigger = null;
let selectedPromptSource = PROMPT_SOURCE.manual;

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

function ensurePreviewModal() {
  if (previewModal) return previewModal;

  const modal = document.createElement('div');
  modal.className = 'image-preview-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '原图预览');
  modal.innerHTML = `
    <div class="image-preview-backdrop" data-preview-close></div>
    <div class="image-preview-frame">
      <button class="image-preview-close" type="button" aria-label="关闭原图预览" data-preview-close>×</button>
      <img class="image-preview-image" alt="" />
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => {
    if (ev.target?.hasAttribute?.('data-preview-close')) closePreviewModal();
  });

  previewModal = modal;
  return previewModal;
}

function openPreviewModal(item, trigger) {
  const src = imageSrcFromItem(item || {});
  if (!src) return;

  const prompt = item?.revised_prompt || item?.revisedPrompt || studioPreviewPrompt || '';
  lastPreviewTrigger = trigger || null;
  const modal = ensurePreviewModal();
  const img = modal.querySelector('.image-preview-image');
  img.src = src;
  img.alt = (prompt || '生成图片原图').slice(0, 120);
  modal.hidden = false;
  document.body.classList.add('preview-open');
  modal.querySelector('.image-preview-close')?.focus();
}

function closePreviewModal() {
  if (!previewModal || previewModal.hidden) return;
  const img = previewModal.querySelector('.image-preview-image');
  previewModal.hidden = true;
  if (img) img.removeAttribute('src');
  document.body.classList.remove('preview-open');
  lastPreviewTrigger?.focus?.();
  lastPreviewTrigger = null;
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
    return `<article class="image-card">
      <button class="image-preview-trigger" type="button" data-studio-index="${index}" aria-label="放大查看第 ${index + 1} 张生成图">
        <img src="${escapeHtml(src)}" alt="${altBase || `Generated image ${index + 1}`}" />
      </button>
      <div class="card-actions">
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
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

function buildPromptOptimizationMessages(prompt) {
  return [
    {
      role: 'system',
      content: [
        '你是专业的 AI 生图提示词优化助手。',
        '将用户的中文想法改写成更稳定、更具体、更适合图像生成模型的提示词。',
        '保留用户明确指定的主体、风格、构图、文字、禁忌和语种；不要改变核心意图。',
        '补足画面主体、环境、构图、镜头、光线、色彩、材质、细节和负面约束。',
        '按 3-5 个自然段组织输出，每段聚焦一个维度，段落之间用空行分隔。',
        '只输出优化后的完整提示词，不要解释，不要 Markdown，不要编号。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `请优化下面的生图提示词：\n\n${prompt}`
    }
  ];
}

function extractChatText(data = {}) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content ?? data?.choices?.[0]?.text ?? data?.output_text ?? data?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('');
  }
  return String(content || '');
}

function cleanOptimizedPrompt(text) {
  let value = String(text || '').trim();
  const fence = value.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fence) value = fence[1].trim();
  const quotePairs = [
    ['"', '"'],
    ['“', '”'],
    ["'", "'"]
  ];
  for (const [left, right] of quotePairs) {
    if (value.startsWith(left) && value.endsWith(right)) {
      value = value.slice(left.length, -right.length).trim();
      break;
    }
  }
  return value;
}

function splitLongParagraph(paragraph, maxLength = 96) {
  const text = String(paragraph || '').trim();
  if (!text || text.length <= maxLength) return text ? [text] : [];

  const parts = text.match(/[^，,、]+[，,、]?/g) || [text];
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (current && current.length + piece.length > maxLength) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function formatOptimizedPromptParagraphs(text) {
  const value = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!value) return '';

  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  const paragraphs = [];
  for (const block of blocks.length ? blocks : [value]) {
    const sentences = block.match(/[^。！？!?；;：:]+[。！？!?；;：:]?/g) || [block];
    let current = '';

    for (const sentence of sentences) {
      const piece = sentence.trim();
      if (!piece) continue;
      if (current && current.length + piece.length > 110) {
        paragraphs.push(...splitLongParagraph(current));
        current = piece;
      } else {
        current += piece;
      }

      if (/[。！？!?；;：:]$/.test(piece) && current.length >= 38) {
        paragraphs.push(...splitLongParagraph(current));
        current = '';
      }
    }

    if (current.trim()) paragraphs.push(...splitLongParagraph(current));
  }

  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
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
  if (!systemMode) {
    payload.baseUrl = image.baseUrl;
    payload.apiKey = image.apiKey;
  }

  addPromptHistory(prompt, {
    source: 'studio',
    title: prompt.slice(0, 28),
    tags: ['生成'],
    model: payload.model,
    size: payload.size,
    quality: payload.quality,
    outputFormat: payload.output_format,
    promptSource: promptInfo.source
  });

  $('generate').disabled = true;
  setStatus('生成中…', 'busy');
  showTaskProgress('generate', `正在调用 ${payload.model} …`);

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const data = await requestGenerate(payload, controller, started);

    const items = data?.data || [];
    renderImages(items, prompt);
    if (items.some((item) => item.local_url || item.localUrl) || data?.saved?.length) {
      onSavedImages?.(items);
    }
    const durationMs = Date.now() - started;

    addLog('info', 'image.generate.success', {
      model: payload.model,
      profileName: profile.name,
      apiKey: systemMode ? 'system-default' : image.apiKey,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      imageCount: items.length,
      size: payload.size,
      quality: payload.quality,
      prompt,
      promptSource: promptInfo.source
    });
    setStatus(`完成 · ${durationMs}ms`, 'ok', 2000);
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err.name === 'AbortError'
      ? '生成请求超时，请稍后重试或检查接口配置。'
      : (err.message || String(err));
    showError(message);
    addLog('error', 'image.generate.failed', {
      model: payload.model,
      profileName: profile.name,
      apiKey: systemMode ? 'system-default' : image.apiKey,
      interfaceMode: systemMode ? 'system' : 'custom',
      durationMs,
      error: message,
      prompt,
      promptSource: promptInfo.source
    });
    setStatus('失败', 'err', 2000);
  } finally {
    clearTimeout(timeoutId);
    $('generate').disabled = false;
    showTaskProgress('generate', '');
  }
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
  $('gallery').addEventListener('click', (ev) => {
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
}
