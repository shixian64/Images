// Left dock generation queue: live SSE + compact operational controls.

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import {
  doneJobDismissalKey,
  isDoneJobDismissed,
  readDismissedDoneJobs,
  removeDismissalsForJobIds,
  writeDismissedDoneJobs
} from './job-dismissal.js';

let jobs = [];
let mounted = false;
let source = null;
let fallbackTimer = null;
let currentTabId = 'studioPanel';
let pendingSubmissions = 0;
let jobsInitialized = false;
let dismissedDone = new Set();
let dismissedDoneLoaded = false;
const notifiedFinal = new Set();

const FINAL = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);
const ACTIVE = new Set(['queued', 'running']);

function now() { return Date.now(); }

function statusLabel(status) {
  return {
    queued: '排队',
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时'
  }[status] || status || '-';
}

function statusTone(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'running') return 'busy';
  if (status === 'cancelled') return 'muted';
  return 'queued';
}

function formatTimeMs(ms) {
  const n = Number(ms) || 0;
  if (n <= 0) return '0s';
  const sec = Math.max(1, Math.round(n / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function imageSrcFromItem(item = {}) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

function firstThumb(job) {
  const items = Array.isArray(job?.result?.data) ? job.result.data : [];
  return imageSrcFromItem(items[0] || {});
}

function sortJobs(list) {
  return [...list].sort((a, b) => {
    const rank = { running: 0, queued: 1, succeeded: 2, failed: 2, timeout: 2, cancelled: 3 };
    const ar = rank[a.status] ?? 9;
    const br = rank[b.status] ?? 9;
    if (ar !== br) return ar - br;
    if (a.status === 'queued' || a.status === 'running') {
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return (a.createdAt || 0) - (b.createdAt || 0);
    }
    return (b.finishedAt || b.updatedAt || 0) - (a.finishedAt || a.updatedAt || 0);
  });
}

function ensureDismissedDoneLoaded() {
  if (dismissedDoneLoaded) return;
  dismissedDoneLoaded = true;
  dismissedDone = readDismissedDoneJobs();
}

function persistDismissedDone() {
  dismissedDone = writeDismissedDoneJobs(dismissedDone);
}

function resetDismissedDoneForActiveJobs(list) {
  ensureDismissedDoneLoaded();
  const activeIds = (Array.isArray(list) ? list : [])
    .filter((job) => job?.id && !FINAL.has(job.status))
    .map((job) => job.id);
  if (activeIds.length) dismissedDone = removeDismissalsForJobIds(dismissedDone, activeIds);
}

function isVisibleRecentJob(job) {
  ensureDismissedDoneLoaded();
  return FINAL.has(job.status) && !isDoneJobDismissed(job, dismissedDone);
}

function dismissDoneJob(jobId, { showToast = true } = {}) {
  ensureDismissedDoneLoaded();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !FINAL.has(job.status)) return false;
  const key = doneJobDismissalKey(job);
  if (!key) return false;
  dismissedDone.add(key);
  persistDismissedDone();
  renderQueue();
  if (showToast) setStatus('已从最近完成删除', 'ok', 1200);
  return true;
}

function notifyFinalJob(job) {
  if (!job?.id || !FINAL.has(job.status) || notifiedFinal.has(job.id)) return;
  notifiedFinal.add(job.id);
  window.dispatchEvent(new CustomEvent('generation-job-finished', { detail: { job } }));
  if (job.status === 'succeeded') {
    window.dispatchEvent(new CustomEvent('generation-job-succeeded', { detail: { job } }));
  }
}

function shouldNotifySnapshotJob(job, previous) {
  if (!job?.id || !FINAL.has(job.status) || notifiedFinal.has(job.id)) return false;
  if (previous && !FINAL.has(previous.status)) return true;
  if (!jobsInitialized) return false;
  return !previous;
}

function setJobs(next) {
  const previousById = new Map(jobs.map((job) => [job.id, job]));
  const nextJobs = sortJobs(Array.isArray(next) ? next : []);
  resetDismissedDoneForActiveJobs(nextJobs);
  for (const job of nextJobs) {
    if (shouldNotifySnapshotJob(job, previousById.get(job.id))) notifyFinalJob(job);
  }
  jobs = nextJobs;
  jobsInitialized = true;
  renderQueue();
}

function upsertJob(job, { notify = false } = {}) {
  if (!job?.id) return;
  resetDismissedDoneForActiveJobs([job]);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = { ...jobs[index], ...job };
  else jobs.push(job);
  jobs = sortJobs(jobs);

  if (notify) notifyFinalJob(job);
  renderQueue();
}

function emptyLine(text) {
  return `<div class="job-queue-empty">${escapeHtml(text)}</div>`;
}

function progressInfo(job) {
  if (job.status !== 'running') return { text: '' };
  const elapsed = Math.max(0, now() - (Number(job.startedAt) || now()));
  return { text: `已运行 ${formatTimeMs(elapsed)}` };
}

function hasActiveJobs() {
  return jobs.some((job) => ACTIVE.has(job.status));
}

function hasVisibleRecentJobs() {
  return jobs.some((job) => isVisibleRecentJob(job));
}

function isStudioTabActive() {
  return currentTabId === 'studioPanel' || currentTabId === 'comicPanel';
}

function updateQueueVisibility() {
  const hasVisibleQueue = pendingSubmissions > 0 || hasActiveJobs() || hasVisibleRecentJobs();
  const visible = isStudioTabActive() && hasVisibleQueue;
  const dock = $('jobQueueDock');
  const mobileBtn = $('jobQueueMobileButton');
  const main = $('main');

  document.body.classList.toggle('job-queue-visible', visible);
  main?.classList.toggle('job-queue-visible', visible);

  if (dock) dock.hidden = !visible;
  if (mobileBtn) {
    mobileBtn.hidden = !visible;
    if (!visible) mobileBtn.setAttribute('aria-expanded', 'false');
  }
  if (!visible) document.body.classList.remove('job-queue-open');
}

function jobMeta(job) {
  const payload = job.payload || {};
  return [job.model || payload.model, payload.size, payload.quality, `n=${job.n || payload.n || 1}`]
    .filter(Boolean)
    .join(' · ');
}

function renderJobCard(job, kind) {
  const prompt = job.promptPreview || job.payload?.prompt || '未命名任务';
  const tone = statusTone(job.status);
  const info = progressInfo(job);
  const canCancel = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'failed' || job.status === 'timeout';
  const canDismiss = kind === 'recent' && FINAL.has(job.status);
  const thumb = firstThumb(job);
  const position = job.status === 'queued' && job.position ? `<span>前面还有 ${Math.max(0, job.position - 1)} 位</span>` : '';
  const error = job.error ? `<p class="job-card-error">${escapeHtml(job.error)}</p>` : '';
  const progress = job.status === 'running'
    ? `<div class="job-card-time">${escapeHtml(info.text)}</div>`
    : '';
  const resultThumb = thumb
    ? `<button class="job-thumb" type="button" data-job-act="preview" title="查看结果"><img src="${escapeHtml(thumb)}" alt="" /></button>`
    : `<span class="job-status-dot" data-tone="${tone}" aria-hidden="true"></span>`;

  return `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}" data-status="${escapeHtml(job.status)}" data-kind="${kind}">
      <div class="job-card-main">
        ${resultThumb}
        <div class="job-card-text">
          <div class="job-card-title" title="${escapeHtml(prompt)}">${escapeHtml(prompt)}</div>
          <div class="job-card-meta">${escapeHtml(jobMeta(job) || '-')}</div>
          <div class="job-card-sub"><span>${statusLabel(job.status)}</span>${position}</div>
          ${progress}
          ${error}
        </div>
      </div>
      <div class="job-card-actions">
        ${canCancel ? `<button class="ghost small" data-job-act="cancel" title="取消任务">×</button>` : ''}
        ${canRetry ? `<button class="ghost small" data-job-act="retry">重试</button>` : ''}
        ${canDismiss ? `<button class="ghost small" data-job-act="dismiss" title="从最近完成删除">删除</button>` : ''}
      </div>
    </article>
  `;
}

function renderQueue() {
  const running = jobs.filter((job) => job.status === 'running');
  const queued = jobs.filter((job) => job.status === 'queued');
  const recent = jobs.filter((job) => isVisibleRecentJob(job)).slice(0, 6);

  const summary = $('jobQueueSummary');
  if (summary) {
    summary.innerHTML = `
      <span><strong>${queued.length}</strong> 排队</span>
      <span><strong>${running.length}</strong> 进行中</span>
    `;
  }
  const badge = $('jobQueueMobileBadge');
  if (badge) badge.textContent = String(queued.length + running.length);

  const runningEl = $('jobQueueRunning');
  if (runningEl) runningEl.innerHTML = running.length ? running.map((job) => renderJobCard(job, 'running')).join('') : emptyLine('当前没有执行中的任务。');
  const queuedEl = $('jobQueueQueued');
  if (queuedEl) queuedEl.innerHTML = queued.length ? queued.map((job) => renderJobCard(job, 'queued')).join('') : emptyLine('队列为空。');
  const recentEl = $('jobQueueRecent');
  if (recentEl) recentEl.innerHTML = recent.length ? recent.map((job) => renderJobCard(job, 'recent')).join('') : emptyLine('暂无完成记录。');

  updateQueueVisibility();
}

export async function refreshJobs({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/jobs');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setJobs(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    if (!silent) setStatus(`加载队列失败：${err?.message || err}`, 'err', 2200);
  }
}

function connectStream() {
  if (!('EventSource' in window)) {
    fallbackTimer = setInterval(() => refreshJobs({ silent: true }), 5_000);
    return;
  }
  try {
    source = new EventSource('/api/jobs/stream');
    source.addEventListener('snapshot', (ev) => {
      const data = JSON.parse(ev.data || '{}');
      setJobs(Array.isArray(data.items) ? data.items : []);
    });
    source.addEventListener('job', (ev) => {
      const job = JSON.parse(ev.data || '{}');
      upsertJob(job, { notify: true });
    });
    source.addEventListener('refresh', () => refreshJobs({ silent: true }));
    source.onerror = () => {
      // EventSource 会自动重连；同时低频拉一次，避免代理吞事件。
      refreshJobs({ silent: true });
    };
  } catch {
    fallbackTimer = setInterval(() => refreshJobs({ silent: true }), 5_000);
  }
}

async function cancelJob(jobId) {
  try {
    const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    if (data.job) upsertJob(data.job);
    setStatus('任务已取消', 'ok', 1200);
  } catch (err) {
    setStatus(`取消失败：${err?.message || err}`, 'err', 2200);
  }
}

async function retryJob(jobId) {
  try {
    const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    if (data.job) upsertJob(data.job);
    setStatus('任务已重新入队', 'ok', 1400);
  } catch (err) {
    setStatus(`重试失败：${err?.message || err}`, 'err', 2400);
  }
}

function openResultPreview(jobId) {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return;
  if (job.status === 'succeeded') {
    window.dispatchEvent(new CustomEvent('generation-job-succeeded', { detail: { job, force: true } }));
    setStatus('结果已回填到生成页', 'ok', 1200);
  }
}

function bindQueueEvents() {
  const dock = $('jobQueueDock');
  dock?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-job-act]');
    if (!btn) return;
    const card = btn.closest('[data-job-id]');
    const jobId = card?.dataset.jobId;
    if (!jobId) return;
    if (btn.dataset.jobAct === 'cancel') cancelJob(jobId);
    if (btn.dataset.jobAct === 'retry') retryJob(jobId);
    if (btn.dataset.jobAct === 'preview') openResultPreview(jobId);
    if (btn.dataset.jobAct === 'dismiss') dismissDoneJob(jobId);
  });
  $('jobQueueClearDone')?.addEventListener('click', () => {
    ensureDismissedDoneLoaded();
    const visibleDone = jobs.filter((job) => isVisibleRecentJob(job));
    visibleDone.forEach((job) => {
      const key = doneJobDismissalKey(job);
      if (key) dismissedDone.add(key);
    });
    if (visibleDone.length) persistDismissedDone();
    renderQueue();
    setStatus(visibleDone.length ? '已清空最近完成' : '没有可清空的完成记录', 'ok', 1200);
  });
  const mobileBtn = $('jobQueueMobileButton');
  mobileBtn?.addEventListener('click', () => {
    if (mobileBtn.hidden) return;
    const open = !document.body.classList.contains('job-queue-open');
    document.body.classList.toggle('job-queue-open', open);
    mobileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('app-tab-changed', (ev) => {
    currentTabId = ev.detail?.tabId || 'studioPanel';
    updateQueueVisibility();
  });
}

export async function submitGenerationJob(payload, { signal } = {}) {
  pendingSubmissions += 1;
  updateQueueVisibility();
  try {
    const resp = await apiFetch('/api/generate', {
      method: 'POST',
      body: payload,
      headers: { accept: 'application/json' },
      signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    if (data.job) upsertJob(data.job);
    else refreshJobs({ silent: true });
    return data;
  } finally {
    pendingSubmissions = Math.max(0, pendingSubmissions - 1);
    updateQueueVisibility();
  }
}

export function mountJobQueue() {
  if (mounted) return;
  mounted = true;
  currentTabId = document.querySelector('.tab-panel.active')?.id || 'studioPanel';
  updateQueueVisibility();
  bindQueueEvents();
  refreshJobs({ silent: true });
  connectStream();
  setInterval(renderQueue, 1_000).unref?.();
}
