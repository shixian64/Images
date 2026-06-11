// Persistent image generation queue: SQLite-backed jobs + single-process scheduler.

import { randomUUID } from 'node:crypto';
import { generationJobs, users } from './db.js';
import {
  prepareImageGenerationJob,
  runImageGeneration,
  getImageGenerationTimeoutMs
} from './image-generation.js';
import {
  assertCanGenerate,
  tryAcquireConcurrentSlot,
  tryAcquireGlobalGenerationSlot,
  getGlobalConcurrentLimit
} from './quota.js';
import {
  cleanupExpiredReferenceJobFiles,
  cleanupReferenceJobFiles,
  stageReferenceImages
} from './reference-images.js';
import {
  getComicStoryboardTimeoutMs,
  isComicStoryboardPayload,
  prepareComicStoryboardJob,
  runComicStoryboardJob
} from './comic-storyboard-jobs.js';
import {
  getQueueSettings,
  persistQueueSettings,
  priorityForUser
} from './queue-settings.js';
import { compactGenerationResult, serializeJob } from './queue-serialization.js';
import { logger } from '../utils/logger.js';

const TICK_MS = 5_000;
const ACTIVE_STATUSES = new Set(['queued', 'running']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

const RUNTIME_INFO = Object.freeze({
  backend: 'sqlite-single-process',
  distributed: false,
  volatileSecrets: true,
  restartPolicy: Object.freeze({
    running: 'mark_failed',
    systemQueued: 'resume_from_sqlite',
    customQueued: 'requires_same_node_process_secret'
  }),
  scaleOutReady: false
});

let started = false;
let schedulerTimer = null;
let kicking = false;
let stopped = false;

const activeJobs = new Map();
const transientJobSecrets = new Map();
const userSubscribers = new Map();
const jobSubscribers = new Map();
const adminSubscribers = new Set();
const jobListeners = new Map();

export { getQueueSettings, normalizeQueueSettings } from './queue-settings.js';
export { compactGenerationResult, serializeJob } from './queue-serialization.js';

export function setQueueSettings(patch = {}, updatedBy = null) {
  const next = persistQueueSettings(patch, updatedBy);
  kickScheduler();
  return next;
}

function httpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function safeWriteSse(res, event, data = {}) {
  if (!res || res.destroyed || res.writableEnded) return false;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function addSubscriber(map, key, res) {
  const set = map.get(key) || new Set();
  set.add(res);
  map.set(key, set);
  return () => {
    set.delete(res);
    if (!set.size) map.delete(key);
  };
}

export function subscribeUserJobs(userId, res) {
  return addSubscriber(userSubscribers, userId, res);
}

export function subscribeJob(jobId, res) {
  return addSubscriber(jobSubscribers, jobId, res);
}

export function subscribeAdminJobs(res) {
  adminSubscribers.add(res);
  return () => adminSubscribers.delete(res);
}

export function onJobUpdate(jobId, handler) {
  const set = jobListeners.get(jobId) || new Set();
  set.add(handler);
  jobListeners.set(jobId, set);
  return () => {
    set.delete(handler);
    if (!set.size) jobListeners.delete(jobId);
  };
}

function emitTo(set, event, data) {
  for (const res of [...(set || [])]) {
    if (!safeWriteSse(res, event, data)) set.delete(res);
  }
}

function emitJob(job, event = 'job') {
  const payload = serializeJob(job, { includeUser: false });
  if (!payload) return;
  emitTo(userSubscribers.get(job.user_id), event, payload);
  emitTo(jobSubscribers.get(job.id), event, payload);
  const adminPayload = serializeJob(job, { includeUser: true });
  emitTo(adminSubscribers, event, adminPayload);
  for (const handler of [...(jobListeners.get(job.id) || [])]) {
    try { handler(payload, event); } catch { /* listener errors must not break scheduler */ }
  }
}

function syncComicProjectStatusForJob(job) {
  const projectId = job?.payload?.comicProjectId;
  if (!projectId || !job?.user_id) return;
  import('./comic-projects.js')
    .then(({ syncComicProjectStatus }) => syncComicProjectStatus(projectId, { userId: job.user_id }))
    .catch((err) => {
      if (err?.message === 'comic project not found') return;
      logger.warn('job.comic_project_status_sync_failed', {
        jobId: job.id,
        projectId,
        userId: job.user_id,
        error: err?.message || String(err)
      });
    });
}

function emitJobStatus(job, event = 'job') {
  emitJob(job, event);
  syncComicProjectStatusForJob(job);
}

function rememberTransientSecret(jobId, secret) {
  if (!secret?.apiKey) return;
  transientJobSecrets.set(jobId, { ...secret });
}

function timeoutMsForJob(job, settings = getQueueSettings()) {
  if (settings.execution_timeout_ms) return settings.execution_timeout_ms;
  return isComicStoryboardPayload(job?.payload)
    ? getComicStoryboardTimeoutMs()
    : getImageGenerationTimeoutMs();
}

function compactJobResult(job, body = {}) {
  return isComicStoryboardPayload(job?.payload) ? (body || {}) : compactGenerationResult(body);
}

function runtimeBodyForJob(job) {
  const payload = { ...(job.payload || {}) };
  if (payload.useSystemDefault === true || payload.interfaceMode === 'system') {
    return { ...payload, useSystemDefault: true, interfaceMode: 'system' };
  }
  const secret = transientJobSecrets.get(job.id);
  if (!secret?.apiKey) {
    throw httpError(
      400,
      '个人接口密钥只保存在当前进程内存中；服务重启或任务完成后该任务无法继续，请从 Studio 重新提交。',
      'transient_secret_missing'
    );
  }
  return {
    ...payload,
    useSystemDefault: false,
    interfaceMode: 'custom',
    baseUrl: secret.baseUrl || secret.imageBaseUrl || payload.baseUrl || payload.imageBaseUrl,
    imageBaseUrl: secret.imageBaseUrl || secret.baseUrl || payload.imageBaseUrl || payload.baseUrl,
    apiKey: secret.apiKey,
    imageApiKey: secret.apiKey
  };
}

function checkQueueCapacity(userInfo, settings) {
  const pendingStatuses = ['queued', 'running'];
  const userPending = Number(generationJobs.countQueued({ userId: userInfo.id, statuses: pendingStatuses })) || 0;
  const globalPending = Number(generationJobs.countQueued({ statuses: pendingStatuses })) || 0;
  if (settings.max_pending_per_user && userPending >= settings.max_pending_per_user) {
    throw httpError(429, `你的待处理任务已达上限（${userPending}/${settings.max_pending_per_user}）`, 'user_queue_full');
  }
  if (settings.max_pending_global && globalPending >= settings.max_pending_global) {
    throw httpError(429, `全局待处理生成任务已满（${globalPending}/${settings.max_pending_global}）`, 'global_queue_full');
  }
}

export async function enqueueImageGeneration(body, userInfo) {
  if (!userInfo?.id) throw httpError(401, 'unauthorized');
  const freshUser = users.findById(userInfo.id) || userInfo;
  const settings = getQueueSettings();
  if (settings.maintenance_mode) {
    throw httpError(503, '生成队列维护中，请稍后再试。', 'queue_maintenance');
  }

  const id = randomUUID();
  let prepared;
  try {
    prepared = await prepareImageGenerationJob(body || {}, { jobId: id, userInfo: freshUser });
    checkQueueCapacity(freshUser, settings);

    if (freshUser.role !== 'admin') {
      const check = assertCanGenerate(freshUser.id, {
        n: prepared.requestedImages,
        includeQueued: prepared.usingSystemDefault,
        checkCallLimits: prepared.usingSystemDefault,
        checkStorage: true
      });
      if (!check.ok) {
        logger.warn('image.queue.quota_exceeded', {
          userId: freshUser.id,
          code: check.code,
          model: prepared.model
        });
        throw httpError(429, check.message, check.code);
      }
    }
  } catch (err) {
    await cleanupReferenceJobFiles(id);
    throw err;
  }

  let job;
  try {
    job = generationJobs.create({
      id,
      userId: freshUser.id,
      status: 'queued',
      priority: priorityForUser(freshUser, settings),
      payload: prepared.payload,
      promptPreview: prepared.promptPreview,
      profileName: prepared.profileName,
      model: prepared.model,
      n: prepared.requestedImages
    });
    rememberTransientSecret(id, prepared.transientSecret);
  } catch (err) {
    await cleanupReferenceJobFiles(id);
    throw err;
  }

  logger.info('job.enqueued', {
    jobId: job.id,
    userId: freshUser.id,
    model: prepared.model,
    n: prepared.requestedImages,
    usingSystemDefault: prepared.usingSystemDefault,
    priority: job.priority
  });
  emitJob(job, 'job');
  syncComicProjectStatusForJob(job);
  kickScheduler();
  return serializeJob(job);
}

export async function enqueueComicStoryboard(body, userInfo) {
  if (!userInfo?.id) throw httpError(401, 'unauthorized');
  const freshUser = users.findById(userInfo.id) || userInfo;
  const settings = getQueueSettings();
  if (settings.maintenance_mode) {
    throw httpError(503, '生成队列维护中，请稍后再试。', 'queue_maintenance');
  }

  const id = randomUUID();
  const prepared = await prepareComicStoryboardJob(body || {}, { jobId: id, userInfo: freshUser });
  checkQueueCapacity(freshUser, settings);

  if (freshUser.role !== 'admin' && prepared.usingSystemDefault) {
    const check = assertCanGenerate(freshUser.id, {
      n: prepared.requestedCalls,
      includeQueued: true,
      checkCallLimits: true,
      checkStorage: false
    });
    if (!check.ok) {
      logger.warn('comic.storyboard.quota_exceeded', {
        userId: freshUser.id,
        code: check.code,
        model: prepared.model
      });
      throw httpError(429, check.message, check.code);
    }
  }

  let job;
  try {
    job = generationJobs.create({
      id,
      userId: freshUser.id,
      status: 'queued',
      priority: priorityForUser(freshUser, settings),
      payload: prepared.payload,
      promptPreview: prepared.promptPreview,
      profileName: prepared.profileName,
      model: prepared.model,
      n: prepared.requestedCalls
    });
    rememberTransientSecret(id, prepared.transientSecret);
  } catch (err) {
    throw err;
  }

  logger.info('comic.storyboard.enqueued', {
    jobId: job.id,
    userId: freshUser.id,
    model: prepared.model,
    usingSystemDefault: prepared.usingSystemDefault,
    priority: job.priority
  });
  emitJob(job, 'job');
  kickScheduler();
  return serializeJob(job);
}

function acquireSlotsForJob(job, userInfo) {
  const globalSlot = tryAcquireGlobalGenerationSlot();
  if (!globalSlot.ok) return { ok: false, reason: 'global', detail: globalSlot };

  let userSlot = { ok: true, release: () => {} };
  if (userInfo?.role !== 'admin') {
    userSlot = tryAcquireConcurrentSlot(job.user_id);
    if (!userSlot.ok) {
      globalSlot.release?.();
      return { ok: false, reason: 'user', detail: userSlot };
    }
  }

  return {
    ok: true,
    release: () => {
      userSlot.release?.();
      globalSlot.release?.();
    }
  };
}

function requeueOrFail(job, attempts, errorMessage, settings) {
  const maxRetries = Number(settings.max_retries) || 0;
  if (attempts <= maxRetries) {
    const updated = generationJobs.updateStatus(job.id, 'queued', {
      startedAt: null,
      finishedAt: null,
      attempts,
      errorMessage,
      progress: { stage: 'retry', message: `失败后重试排队中（${attempts}/${maxRetries}）` },
      cancelRequested: false
    });
    logger.warn('job.retry_queued', { jobId: job.id, attempts, maxRetries, error: errorMessage });
    emitJobStatus(updated, 'job');
    return updated;
  }
  const updated = generationJobs.updateStatus(job.id, 'failed', {
    finishedAt: Date.now(),
    attempts,
    errorMessage,
    progress: { stage: 'failed', message: errorMessage }
  });
  logger.warn('job.failed', { jobId: job.id, attempts, error: errorMessage });
  emitJobStatus(updated, 'job');
  return updated;
}

async function executeJob(job, slot, userInfo) {
  const settings = getQueueSettings();
  const attempts = (Number(job.attempts) || 0) + 1;
  const startedAt = Date.now();
  let wallTimedOut = false;
  let requeued = false;
  const controller = new AbortController();
  const timeoutMs = timeoutMsForJob(job, settings);
  const timeoutId = timeoutMs ? setTimeout(() => {
    wallTimedOut = true;
    controller.abort();
  }, timeoutMs) : null;
  timeoutId?.unref?.();

  const running = generationJobs.claimQueued(job.id, {
    startedAt,
    attempts,
    progress: { stage: 'started', message: '任务已开始执行', elapsedMs: 0 }
  });
  if (!running) {
    if (timeoutId) clearTimeout(timeoutId);
    slot.release?.();
    logger.info('job.claim_skipped', {
      jobId: job.id,
      userId: job.user_id,
      status: generationJobs.findById(job.id)?.status || 'missing'
    });
    kickScheduler();
    return null;
  }

  activeJobs.set(job.id, { controller, startedAt, release: slot.release, userId: job.user_id });
  logger.info('job.started', { jobId: job.id, userId: job.user_id, attempts, model: job.model });
  emitJobStatus(running, 'job');

  try {
    const onProgress = (progress) => {
      const latest = generationJobs.updateProgress(job.id, progress);
      emitJob(latest, 'job');
    };
    const result = isComicStoryboardPayload(running.payload)
      ? await runComicStoryboardJob(running.payload, userInfo, {
        transientSecret: transientJobSecrets.get(running.id),
        signal: controller.signal,
        timeoutMs,
        onProgress
      })
      : await runImageGeneration(runtimeBodyForJob(running), userInfo, {
        signal: controller.signal,
        timeoutMs,
        onProgress
      });

    const latest = generationJobs.findById(job.id);
    if (latest && latest.status !== 'running') return latest;
    if (latest?.cancel_requested) {
      const cancelled = generationJobs.updateStatus(job.id, 'cancelled', {
        finishedAt: Date.now(),
        attempts,
        errorMessage: 'cancelled',
        progress: { stage: 'cancelled', message: '任务已取消' },
        cancelRequested: true
      });
      logger.info('job.cancelled', { jobId: job.id, userId: job.user_id, running: true });
      emitJobStatus(cancelled, 'job');
      return cancelled;
    }

    if (wallTimedOut) {
      const timedOut = generationJobs.updateStatus(job.id, 'timeout', {
        finishedAt: Date.now(),
        attempts,
        errorMessage: 'generation timeout',
        progress: { stage: 'timeout', message: '任务执行超时' }
      });
      logger.warn('job.timeout', { jobId: job.id, userId: job.user_id, timeoutMs });
      emitJobStatus(timedOut, 'job');
      return timedOut;
    }

    if (result.status >= 200 && result.status < 300) {
      const succeeded = generationJobs.updateStatus(job.id, 'succeeded', {
        finishedAt: Date.now(),
        attempts,
        result: compactJobResult(running, result.body),
        errorMessage: null,
        progress: { stage: 'succeeded', message: '生成完成' }
      });
      logger.info('job.succeeded', { jobId: job.id, userId: job.user_id, attempts, model: job.model });
      emitJobStatus(succeeded, 'job');
      return succeeded;
    }

    const errorMessage = result.body?.error || `HTTP ${result.status}`;
    if (result.status === 504) {
      const timedOut = generationJobs.updateStatus(job.id, 'timeout', {
        finishedAt: Date.now(),
        attempts,
        errorMessage,
        progress: { stage: 'timeout', message: errorMessage }
      });
      logger.warn('job.timeout', { jobId: job.id, userId: job.user_id, error: errorMessage });
      emitJobStatus(timedOut, 'job');
      return timedOut;
    }

    const updated = requeueOrFail(job, attempts, errorMessage, settings);
    requeued = updated?.status === 'queued';
    return updated;
  } catch (err) {
    const latest = generationJobs.findById(job.id);
    if (latest && latest.status !== 'running') return latest;
    if (latest?.cancel_requested || err?.name === 'AbortError') {
      const status = wallTimedOut ? 'timeout' : 'cancelled';
      const message = wallTimedOut ? 'generation timeout' : 'cancelled';
      const updated = generationJobs.updateStatus(job.id, status, {
        finishedAt: Date.now(),
        attempts,
        errorMessage: message,
        progress: { stage: status, message: status === 'timeout' ? '任务执行超时' : '任务已取消' },
        cancelRequested: latest?.cancel_requested || false
      });
      logger.warn(`job.${status}`, { jobId: job.id, userId: job.user_id, error: err.message || String(err) });
      emitJobStatus(updated, 'job');
      return updated;
    }
    const message = err?.message || String(err);
    const updated = requeueOrFail(job, attempts, message, settings);
    requeued = updated?.status === 'queued';
    return updated;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    activeJobs.delete(job.id);
    slot.release?.();
    if (!requeued) transientJobSecrets.delete(job.id);
    if (!requeued) cleanupReferenceJobFiles(job.id).catch((err) => {
      logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
    });
    kickScheduler();
  }
}

function queuedWaitCleanup(settings = getQueueSettings()) {
  const wait = Number(settings.max_wait_ms) || 0;
  if (!wait) return;
  const staleJobs = generationJobs.queuedOlderThan(Date.now() - wait);
  if (!staleJobs.length) return;

  let changed = 0;
  for (const job of staleJobs) {
    const latest = generationJobs.findById(job.id);
    if (!latest || latest.status !== 'queued') continue;
    const cancelled = generationJobs.updateStatus(job.id, 'cancelled', {
      finishedAt: Date.now(),
      errorMessage: 'queue_wait_timeout',
      progress: { stage: 'cancelled', message: '队列等待超时，任务已取消' },
      cancelRequested: true
    });
    transientJobSecrets.delete(job.id);
    cleanupReferenceJobFiles(job.id).catch((err) => {
      logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
    });
    changed += 1;
    emitJobStatus(cancelled, 'job');
  }

  if (changed) {
    logger.warn('job.queue_wait_timeout', { cancelled: changed, maxWaitMs: wait });
    // Refresh snapshots so remaining queued jobs get updated positions.
    emitTo(adminSubscribers, 'refresh', { reason: 'queue_wait_timeout', changed });
    for (const set of userSubscribers.values()) {
      emitTo(set, 'refresh', { reason: 'queue_wait_timeout', changed });
    }
  }
}

async function schedulerLoop() {
  if (stopped || kicking) return;
  kicking = true;
  try {
    const settings = getQueueSettings();
    queuedWaitCleanup(settings);
    if (settings.maintenance_mode) return;

    while (true) {
      const globalLimit = getGlobalConcurrentLimit();
      if (globalLimit && activeJobs.size >= globalLimit) return;

      const excluded = new Set();
      let startedAny = false;
      while (true) {
        const [job] = generationJobs.queuedBatch(1, [...excluded]);
        if (!job) return;
        const userInfo = users.findById(job.user_id);
        if (!userInfo || userInfo.status !== 'active') {
          const failed = generationJobs.updateStatus(job.id, 'failed', {
            finishedAt: Date.now(),
            errorMessage: userInfo ? 'user disabled' : 'user not found',
            progress: { stage: 'failed', message: userInfo ? '用户已停用' : '用户不存在' }
          });
          logger.warn('job.failed_user_unavailable', { jobId: job.id, userId: job.user_id });
          emitJobStatus(failed, 'job');
          continue;
        }

        const slot = acquireSlotsForJob(job, userInfo);
        if (!slot.ok && slot.reason === 'user') {
          excluded.add(job.user_id);
          continue;
        }
        if (!slot.ok) return;

        startedAny = true;
        executeJob(job, slot, userInfo).catch((err) => {
          logger.error('job.execute_unhandled', { jobId: job.id, error: err?.message || String(err) });
        });
        break;
      }
      if (!startedAny) return;
    }
  } finally {
    kicking = false;
  }
}

export function kickScheduler() {
  if (stopped || !started) return;
  queueMicrotask(() => schedulerLoop().catch((err) => {
    logger.error('job.scheduler_failed', { error: err?.message || String(err) });
  }));
}

export function startJobQueue() {
  if (started) return;
  started = true;
  stopped = false;
  const recoveringComicJobs = generationJobs
    .listAll({ limit: 10000, status: 'running' })
    .filter((job) => job?.payload?.comicProjectId);
  const recovered = generationJobs.recoverRunningAsFailed('server_restart');
  for (const job of recoveringComicJobs) {
    syncComicProjectStatusForJob({ ...job, status: 'failed' });
  }
  if (recovered) logger.warn('job.recovered_running_as_failed', { recovered });
  cleanupExpiredReferenceJobFiles(recovered ? { ttlMs: 0 } : undefined).then((removed) => {
    if (removed) logger.info('job.reference_cleanup_expired', { removed });
  }).catch((err) => {
    logger.warn('job.reference_cleanup_expired_failed', { error: err?.message || String(err) });
  });
  schedulerTimer = setInterval(kickScheduler, TICK_MS);
  schedulerTimer.unref?.();
  kickScheduler();
}

export function stopJobQueue() {
  stopped = true;
  started = false;
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  for (const [jobId, active] of activeJobs.entries()) {
    const current = generationJobs.findById(jobId);
    if (current?.status === 'running') {
      const failed = generationJobs.updateStatus(jobId, 'failed', {
        finishedAt: Date.now(),
        errorMessage: 'server_shutdown',
        progress: { stage: 'failed', message: '服务正在停止，运行中的任务已中止' }
      });
      transientJobSecrets.delete(jobId);
      cleanupReferenceJobFiles(jobId).catch((err) => {
        logger.warn('job.reference_cleanup_failed', { jobId, error: err?.message || String(err) });
      });
      emitJobStatus(failed, 'job');
    }
    try { active.controller.abort(); } catch { /* noop */ }
    try { active.release?.(); } catch { /* noop */ }
    activeJobs.delete(jobId);
  }
}

export function getUserJobs(userId, opts = {}) {
  return generationJobs.listByUser(userId, opts).map((job) => serializeJob(job));
}

export function getJobForUser(jobId, userInfo, { allowAdmin = false } = {}) {
  const job = generationJobs.findById(jobId);
  if (!job) throw httpError(404, 'job not found');
  if (!allowAdmin && job.user_id !== userInfo?.id) throw httpError(404, 'job not found');
  return serializeJob(job, { includeUser: allowAdmin });
}

export function getAdminJobs({ limit = 200, status = '', userId = '' } = {}) {
  return generationJobs.listAll({ limit, status, userId }).map((job) => serializeJob(job, { includeUser: true }));
}

export function getAdminJob(jobId) {
  const job = generationJobs.findById(jobId);
  if (!job) return null;
  const user = job.user_id ? users.findById(job.user_id) : null;
  return serializeJob({
    ...job,
    user_username: user?.username || '',
    user_email: user?.email || '',
    user_role: user?.role || ''
  }, { includeUser: true });
}

export function queueStats() {
  const storedStats = generationJobs.stats();
  const byStatus = storedStats.byStatus || {};
  const terminal = ['succeeded', 'failed', 'timeout', 'cancelled']
    .reduce((sum, status) => sum + (Number(byStatus[status]) || 0), 0);
  const succeeded = Number(byStatus.succeeded) || 0;
  return {
    byStatus,
    active: activeJobs.size,
    runtime: queueRuntimeInfo(),
    successRate: terminal ? Math.round((succeeded / terminal) * 1000) / 10 : null,
    avgSuccessDurationMs: storedStats.avgSuccessDurationMs ?? null
  };
}

export function queueRuntimeInfo() {
  return {
    ...RUNTIME_INFO,
    restartPolicy: { ...RUNTIME_INFO.restartPolicy }
  };
}

export function cancelJob(jobId, userInfo, { admin = false } = {}) {
  const job = generationJobs.findById(jobId);
  if (!job) throw httpError(404, 'job not found');
  if (!admin && job.user_id !== userInfo?.id) throw httpError(404, 'job not found');
  if (TERMINAL_STATUSES.has(job.status)) return serializeJob(job, { includeUser: admin });

  if (job.status === 'queued') {
    const cancelled = generationJobs.updateStatus(job.id, 'cancelled', {
      finishedAt: Date.now(),
      errorMessage: 'cancelled',
      progress: { stage: 'cancelled', message: '任务已取消' },
      cancelRequested: true
    });
    transientJobSecrets.delete(job.id);
    cleanupReferenceJobFiles(job.id).catch((err) => {
      logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
    });
    logger.info('job.cancelled', { jobId: job.id, userId: job.user_id, running: false, by: userInfo?.id });
    emitJobStatus(cancelled, 'job');
    kickScheduler();
    return serializeJob(cancelled, { includeUser: admin });
  }

  if (job.status === 'running') {
    const requested = generationJobs.requestCancel(job.id);
    const active = activeJobs.get(job.id);
    if (active?.controller) active.controller.abort();
    else {
      const cancelled = generationJobs.updateStatus(job.id, 'cancelled', {
        finishedAt: Date.now(),
        errorMessage: 'cancelled',
        progress: { stage: 'cancelled', message: '任务已取消' },
        cancelRequested: true
      });
      cleanupReferenceJobFiles(job.id).catch((err) => {
        logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
      });
      emitJobStatus(cancelled, 'job');
      return serializeJob(cancelled, { includeUser: admin });
    }
    logger.info('job.cancel_requested', { jobId: job.id, userId: job.user_id, by: userInfo?.id });
    emitJobStatus(requested, 'job');
    return serializeJob(requested, { includeUser: admin });
  }

  throw httpError(409, 'job is not cancellable');
}

async function restageRetryReferences(job, userInfo) {
  const refs = Array.isArray(job.payload?.referenceImages) ? job.payload.referenceImages : [];
  if (!refs.length) return job;

  const galleryRefs = refs
    .map((item) => ({
      type: 'gallery',
      id: String(item?.originalId || item?.id || item?.galleryId || '').trim(),
      source: String(item?.source || '').trim().toLowerCase()
    }));
  if (!galleryRefs.every((item) => item.id && (!item.source || item.source === 'gallery'))) {
    throw httpError(400, '上传参考图任务需要从 Studio 重新提交，以便重新校验并暂存参考图。');
  }

  await cleanupReferenceJobFiles(job.id);
  const referenceImages = await stageReferenceImages({
    body: { references: galleryRefs.map((item) => ({ type: 'gallery', id: item.id })) },
    jobId: job.id,
    userInfo
  });
  return generationJobs.updatePayload(job.id, {
    ...(job.payload || {}),
    mode: 'edit',
    referenceImages,
    referenceImageCount: referenceImages.length
  });
}

export async function retryJob(jobId, userInfo) {
  const job = generationJobs.findById(jobId);
  if (!job) throw httpError(404, 'job not found');
  if (job.user_id !== userInfo?.id) throw httpError(404, 'job not found');
  if (!TERMINAL_STATUSES.has(job.status)) throw httpError(409, 'job is not finished');
  if (job.payload?.interfaceMode === 'custom' || job.payload?.useSystemDefault === false) {
    throw httpError(400, '个人接口任务需要从 Studio 重新提交，以便重新提供 API Key。');
  }
  const freshUser = users.findById(userInfo.id) || userInfo;
  if (freshUser.role !== 'admin') {
    const check = isComicStoryboardPayload(job.payload)
      ? assertCanGenerate(freshUser.id, {
        n: Number(job.n) || 1,
        includeQueued: true,
        checkCallLimits: true,
        checkStorage: false
      })
      : assertCanGenerate(freshUser.id, { n: Number(job.n) || 1, includeQueued: true });
    if (!check.ok) throw httpError(429, check.message, check.code);
  }
  checkQueueCapacity(freshUser, getQueueSettings());
  if (!isComicStoryboardPayload(job.payload)) await restageRetryReferences(job, freshUser);
  const updated = generationJobs.resetForRetry(job.id, { priority: priorityForUser(freshUser) });
  logger.info('job.retry_requested', { jobId: job.id, userId: job.user_id, by: userInfo?.id });
  emitJobStatus(updated, 'job');
  kickScheduler();
  return serializeJob(updated);
}

export function updateJobPriority(jobId, priority, userInfo) {
  const job = generationJobs.findById(jobId);
  if (!job) throw httpError(404, 'job not found');
  const updated = generationJobs.updatePriority(jobId, priority);
  logger.info('job.priority_updated', { jobId, priority: updated.priority, by: userInfo?.id });
  emitJob(updated, 'job');
  kickScheduler();
  return serializeJob(updated, { includeUser: true });
}

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(status);
}
