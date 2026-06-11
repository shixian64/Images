// Left dock generation queue: live SSE + compact operational controls.

import { $, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import {
  doneJobDismissalKey,
  isDoneJobDismissed,
  readDismissedDoneJobs,
  removeDismissalsForJobIds,
  writeDismissedDoneJobs
} from './job-dismissal.js';
import {
  jobQueueSummaryHtml,
  renderJobListSection
} from './jobs-view.js';

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

function isImageGenerationJob(job = {}) {
  const type = job.payload?.jobType || '';
  return !type || type === 'image_generation';
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
  if (job.status === 'succeeded' && isImageGenerationJob(job)) {
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

function renderQueue() {
  const running = jobs.filter((job) => job.status === 'running');
  const queued = jobs.filter((job) => job.status === 'queued');
  const recent = jobs.filter((job) => isVisibleRecentJob(job));
  const nowMs = now();

  const summary = $('jobQueueSummary');
  if (summary) {
    summary.innerHTML = jobQueueSummaryHtml({
      queuedCount: queued.length,
      runningCount: running.length
    });
  }
  const badge = $('jobQueueMobileBadge');
  if (badge) badge.textContent = String(queued.length + running.length);

  const runningEl = $('jobQueueRunning');
  if (runningEl) runningEl.innerHTML = renderJobListSection(running, 'running', '当前没有执行中的任务。', { nowMs });
  const queuedEl = $('jobQueueQueued');
  if (queuedEl) queuedEl.innerHTML = renderJobListSection(queued, 'queued', '队列为空。', { nowMs });
  const recentEl = $('jobQueueRecent');
  if (recentEl) recentEl.innerHTML = renderJobListSection(recent, 'recent', '暂无完成记录。', { nowMs });

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
  if (job.status === 'succeeded' && isImageGenerationJob(job)) {
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
