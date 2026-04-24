// Studio 面板：生成器 + 预估耗时 + ⌘⏎ 快捷键 + Prompt 草稿。
// 对应 docs §5.3 Studio 详细设计 + §5.1 键盘友好 + §5.6 状态与反馈。

import { $, escapeHtml, setStatus } from './dom.js';
import { KEYS, readString, writeString } from './state.js';
import {
  DEFAULT_MODEL, OUTPUT_FORMATS, QUALITIES, SIZES,
  estimateDurationMs
} from '../../shared/constants.js';
import { getActiveProfile, onProfilesChanged } from './profiles.js';
import { addLog } from './logs.js';

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

function formatEstimate(ms) {
  if (ms < 1000) return `预估耗时 <1s`;
  const secs = Math.round(ms / 1000);
  return `预估耗时 ~${secs}s（基于参数的本地估算）`;
}

function updateEstimate() {
  const ms = estimateDurationMs($('size').value, $('quality').value);
  const n = Math.max(1, Number($('n').value) || 1);
  $('estimate').textContent = formatEstimate(ms * n);
}

function updatePromptCount() {
  const len = ($('prompt').value || '').length;
  $('promptCount').textContent = len;
}

function updateActiveChip() {
  const p = getActiveProfile();
  $('activeConfigName').textContent = p ? `${p.name || '未命名'} · ${p.baseUrl || ''}` : '-';
  const dot = document.querySelector('#activeProfileChip .dot');
  if (dot) dot.dataset.status = p?.testStatus === 'ok' ? 'ok'
    : p?.testStatus === 'err' ? 'err'
    : p?.status === 'active' ? 'warn' : 'unknown';
  // Profile 切换后，把 model 预填成其 default（仅当用户没改过）
  if (p?.defaultModel && $('model').dataset.userEdited !== '1') {
    $('model').value = p.defaultModel;
  }
}

function showError(message) {
  const el = $('error');
  el.hidden = !message;
  el.textContent = message || '';
}

function showProgress(message) {
  const el = $('progress');
  if (!message) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = message;
}

function imageSrcFromItem(item) {
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

function renderImages(items, prompt) {
  const gallery = $('gallery');
  if (!items.length) {
    gallery.dataset.empty = 'true';
    gallery.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⚠</div>
        <p>接口返回成功，但 <code>data[]</code> 为空。</p>
      </div>`;
    return;
  }
  gallery.dataset.empty = 'false';
  const altBase = escapeHtml((prompt || '').slice(0, 100));
  gallery.innerHTML = items.map((item, index) => {
    const src = imageSrcFromItem(item);
    const revised = item.revised_prompt
      ? `<p class="revised">${escapeHtml(item.revised_prompt)}</p>`
      : '';
    const stem = `image-${Date.now()}-${index + 1}`;
    return `<article class="image-card">
      <img src="${src}" alt="${altBase || `Generated image ${index + 1}`}" />
      <div class="card-actions">
        <a href="${src}" download="${stem}.png">下载</a>
      </div>
      <div class="image-meta"><span>#${index + 1}</span></div>
      ${revised}
    </article>`;
  }).join('');
}

async function generate() {
  showError('');
  const profile = getActiveProfile();
  if (!profile) return showError('请先在"配置"页面创建接口配置。');
  if (profile.status !== 'active') return showError('当前接口未启用，请在"配置"页面切换为"启用"。');
  if (!profile.apiKey) return showError('当前配置缺少 API Key。');

  const prompt = $('prompt').value.trim();
  if (!prompt) return showError('请填写提示词。');

  const payload = {
    name: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: $('model').value.trim() || profile.defaultModel || DEFAULT_MODEL,
    prompt,
    size: $('size').value,
    quality: $('quality').value,
    output_format: $('output_format').value,
    n: Math.max(1, Number($('n').value) || 1)
  };

  $('generate').disabled = true;
  setStatus('生成中…', 'busy');
  showProgress(`正在调用 ${payload.model} …`);

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);
  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const items = data?.data || [];
    renderImages(items, prompt);
    const durationMs = Date.now() - started;

    addLog('info', 'image.generate.success', {
      model: payload.model,
      profileName: profile.name,
      apiKey: profile.apiKey,
      durationMs,
      imageCount: items.length,
      size: payload.size,
      quality: payload.quality,
      prompt
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
      apiKey: profile.apiKey,
      durationMs,
      error: message,
      prompt
    });
    setStatus('失败', 'err', 2000);
  } finally {
    clearTimeout(timeoutId);
    $('generate').disabled = false;
    showProgress('');
  }
}

// 外部调用：把日志里的 prompt 回填到 Studio。
export function loadPromptFromLog(prompt) {
  if (!prompt) return;
  $('prompt').value = prompt;
  writeString(KEYS.promptDraft, prompt);
  updatePromptCount();
}

export function mountStudioPanel() {
  populateOptions();

  // 恢复 Prompt 草稿
  const draft = readString(KEYS.promptDraft, '');
  if (draft) $('prompt').value = draft;
  updatePromptCount();
  updateEstimate();
  updateActiveChip();

  // 参数变化 → 更新预估
  for (const id of ['size', 'quality', 'n']) {
    $(id).addEventListener('change', updateEstimate);
    $(id).addEventListener('input', updateEstimate);
  }

  $('prompt').addEventListener('input', () => {
    updatePromptCount();
    writeString(KEYS.promptDraft, $('prompt').value);
  });

  // 标记用户手动改过 model，之后 profile 切换不再覆盖
  $('model').addEventListener('input', () => { $('model').dataset.userEdited = '1'; });

  $('generate').addEventListener('click', generate);

  // ⌘/Ctrl + Enter：在 textarea 内也能触发
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      generate();
    }
  });

  // Profile 更新时刷新 chip 和 default model
  onProfilesChanged(updateActiveChip);
}
