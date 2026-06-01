// 漫画工作流面板：故事 → 分镜 → 逐格生图。

import { $, escapeHtml, setStatus } from './dom.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, OUTPUT_FORMATS, QUALITIES, SIZES } from '../../shared/constants.js';
import { getChatConfig, getEffectiveProfile, getImageConfig, onProfilesChanged, usesSystemDefault } from './profiles.js';
import { apiFetch } from './auth.js';
import { submitGenerationJob } from './jobs.js';
import { addLog } from './logs.js';
import { addPromptHistory } from './prompts.js';
import { readStringScoped, writeStringScoped } from './state.js';
import {
  COMIC_PANEL_LIMITS,
  buildComicImagePrompt,
  buildComicStoryboardMessages,
  clampComicPanelCount,
  comicReferenceSpecs,
  comicStyleOptions,
  getComicStyleTemplate,
  parseComicStoryboardResponse
} from '../../shared/comic-workflow.js';

const COMIC_STORY_DRAFT_KEY = 'image-key-manager.comicStoryDraft.v1';
const STORYBOARD_TIMEOUT_MS = 180_000;
const JOB_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const FINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

let mounted = false;
let storyboard = null;
let generatedPanels = [];
let activeRun = null;

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
    count.min = String(COMIC_PANEL_LIMITS.min);
    count.max = String(COMIC_PANEL_LIMITS.max);
    count.value = String(COMIC_PANEL_LIMITS.default);
  }
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
      <p>先输入小故事并点击“生成分镜”。这里会出现角色设定、风格圣经和逐格画面提示词。</p>
    </div>`;
    return;
  }

  box.dataset.empty = 'false';
  const characters = storyboard.characters?.length
    ? storyboard.characters.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>：${escapeHtml([
      item.role,
      item.visualSignature,
      item.costume,
      item.expressionRules
    ].filter(Boolean).join('；'))}</li>`).join('')
    : '<li>模型未提取到明确角色；生成时会按故事主体保持一致。</li>';

  const panels = storyboard.panels.map((panel, index) => `<article class="comic-panel-card" data-comic-panel="${index}">
    <header>
      <span class="comic-panel-index">#${index + 1}</span>
      <div>
        <strong>${escapeHtml(panel.beat || `分镜 ${index + 1}`)}</strong>
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
      <span>本格生图提示词（可改）</span>
      <textarea rows="5" data-comic-panel-prompt="${index}">${escapeHtml(panel.imagePrompt || '')}</textarea>
    </label>
  </article>`).join('');

  box.innerHTML = `
    <section class="comic-bible">
      <div>
        <p class="eyebrow">Storyboard</p>
        <h3>${escapeHtml(storyboard.title)}</h3>
        <p>${escapeHtml(storyboard.logline || '已生成分镜设计。')}</p>
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
      <p>分镜确认后点击“逐格生成图片”。生成时会把首格/上一格作为上下文参考，尽量锁定角色和画风。</p>
    </div>`;
    return;
  }

  list.dataset.empty = 'false';
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
      cancelled: '已停止'
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
        <span>#${index + 1} ${escapeHtml(statusLabel)}</span>
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
  const story = $('comicStory')?.value.trim() || '';
  if (!story) return showComicError('请先输入一个小故事。');

  let profileInfo;
  try {
    profileInfo = resolveProfileConfig('chat');
  } catch (err) {
    return showComicError(err.message || String(err));
  }

  const styleId = $('comicStyle')?.value;
  const panelCount = clampComicPanelCount($('comicPanelCount')?.value);
  const model = $('comicChatModel')?.value.trim() || profileInfo.config.defaultModel || DEFAULT_CHAT_MODEL;
  const payload = {
    name: profileInfo.profile.name,
    useSystemDefault: profileInfo.systemMode,
    model,
    messages: buildComicStoryboardMessages({ story, styleId, panelCount }),
    response_format: { type: 'json_object' },
    max_completion_tokens: 2200
  };
  if (!profileInfo.systemMode) {
    payload.chatBaseUrl = profileInfo.config.baseUrl;
    payload.chatApiKey = profileInfo.config.apiKey;
  }

  setBusy(true);
  setStatus('正在生成漫画分镜…', 'busy');
  showComicProgress(`正在调用 ${model} 分析故事并生成 ${panelCount} 格分镜…`, 'busy');
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORYBOARD_TIMEOUT_MS);
  try {
    const resp = await apiFetch('/api/chat', {
      method: 'POST',
      body: payload,
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    storyboard = parseComicStoryboardResponse(extractChatText(data), { story, styleId, panelCount });
    generatedPanels = [];
    renderStoryboard();
    renderComicResults();
    $('comicGenerate').disabled = false;
    addPromptHistory(story, {
      source: 'comic',
      title: storyboard.title || story.slice(0, 28),
      tags: ['漫画', '分镜', getComicStyleTemplate(styleId).label],
      model
    });
    addLog('info', 'comic.storyboard.generated', {
      model,
      profileName: profileInfo.profile.name,
      interfaceMode: profileInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      panelCount,
      styleId
    });
    setStatus('漫画分镜已生成', 'ok', 1800);
    showComicProgress('分镜已生成。可微调每格提示词后逐格生成图片。', 'ok');
  } catch (err) {
    const message = err.name === 'AbortError'
      ? '分镜生成超时，请缩短故事或稍后重试。'
      : (err.message || String(err));
    showComicError(message);
    addLog('error', 'comic.storyboard.failed', {
      model,
      profileName: profileInfo.profile.name,
      durationMs: Date.now() - started,
      error: message
    });
    setStatus('漫画分镜失败', 'err', 2200);
    showComicProgress('');
  } finally {
    clearTimeout(timeoutId);
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
    const timeoutId = setTimeout(() => fail(new Error('等待生图任务完成超时。')), JOB_WAIT_TIMEOUT_MS);
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
    n: 1
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
  if (!storyboard?.panels?.length) return showComicError('请先生成分镜。');
  syncStoryboardFromEditors();

  let imageInfo;
  try {
    imageInfo = resolveProfileConfig('image');
  } catch (err) {
    return showComicError(err.message || String(err));
  }

  const useContext = $('comicUseContext')?.checked !== false;
  activeRun = { controller: new AbortController(), currentJobId: '', stopped: false };
  generatedPanels = storyboard.panels.map(() => ({ status: 'pending' }));
  renderComicResults();
  setBusy(true);
  setStatus('漫画逐格生成中…', 'busy');

  let anchorId = '';
  let previousId = '';
  const started = Date.now();
  try {
    for (let i = 0; i < storyboard.panels.length; i += 1) {
      if (activeRun.controller.signal.aborted) throw abortError();
      const panel = storyboard.panels[i];
      const references = comicReferenceSpecs({ anchorId, previousId, enabled: useContext });
      const payload = panelPayload({ panel, index: i, imageInfo, references });
      generatedPanels[i] = { ...generatedPanels[i], status: 'queued', prompt: payload.prompt };
      renderComicResults();
      showComicProgress(`正在提交第 ${i + 1}/${storyboard.panels.length} 格到生图队列…`, 'busy');

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
      showComicProgress(`第 ${i + 1}/${storyboard.panels.length} 格已入队，等待完成…`, 'busy');

      const job = await waitForJob(jobId, { signal: activeRun.controller.signal });
      if (job.status !== 'succeeded') {
        throw new Error(job.error || job.progress?.message || `第 ${i + 1} 格生成失败：${job.status}`);
      }
      const item = firstResultItem(job);
      if (!item) throw new Error(`第 ${i + 1} 格没有返回可用图片。`);
      const imageId = imageIdFromItem(item);
      if (imageId) {
        if (!anchorId) anchorId = imageId;
        previousId = imageId;
      }
      generatedPanels[i] = { status: 'succeeded', jobId, item, prompt: payload.prompt };
      renderComicResults();
      onSavedImages?.([item]);
      showComicProgress(`第 ${i + 1}/${storyboard.panels.length} 格完成。${i + 1 < storyboard.panels.length ? '继续下一格…' : ''}`, 'ok');
    }

    addLog('info', 'comic.generate.completed', {
      model: $('comicImageModel')?.value.trim() || imageInfo.config.defaultModel || DEFAULT_IMAGE_MODEL,
      profileName: imageInfo.profile.name,
      interfaceMode: imageInfo.systemMode ? 'system' : 'custom',
      durationMs: Date.now() - started,
      panelCount: storyboard.panels.length,
      styleId: storyboard.styleId,
      useContext
    });
    setStatus('漫画生成完成', 'ok', 2200);
    showComicProgress('漫画已逐格生成完成，可在“图库”查看与管理。', 'ok');
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
    setStatus(stopped ? '漫画生成已停止' : '漫画生成失败', stopped ? 'ok' : 'err', 2200);
    showComicProgress(stopped ? '已停止，不会继续提交后续分镜。' : message, stopped ? 'muted' : 'err');
  } finally {
    activeRun = null;
    setBusy(false);
    if (storyboard) $('comicGenerate').disabled = false;
  }
}

function stopComicRun() {
  if (!activeRun) return;
  activeRun.stopped = true;
  activeRun.controller.abort();
  cancelCurrentJob();
}

function bindEvents({ onSavedImages } = {}) {
  $('comicAnalyze')?.addEventListener('click', analyzeStoryboard);
  $('comicGenerate')?.addEventListener('click', () => generateComic({ onSavedImages }));
  $('comicStop')?.addEventListener('click', stopComicRun);
  $('comicStyle')?.addEventListener('change', () => {
    renderStyleGuide();
    if (storyboard) {
      syncStoryboardFromEditors();
      storyboard.styleId = $('comicStyle').value;
      storyboard.styleLabel = getComicStyleTemplate(storyboard.styleId).label;
      renderStoryboard();
    }
  });
  $('comicStory')?.addEventListener('input', () => {
    writeStringScoped(COMIC_STORY_DRAFT_KEY, $('comicStory').value);
  });
  $('comicChatModel')?.addEventListener('input', () => { $('comicChatModel').dataset.userEdited = '1'; });
  $('comicImageModel')?.addEventListener('input', () => { $('comicImageModel').dataset.userEdited = '1'; });
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
