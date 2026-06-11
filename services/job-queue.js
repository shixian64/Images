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
  cleanupReferenceJobFiles
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
import { emitJob, emitQueueRefresh } from './queue-events.js';
import { queueStats as queueStatsSnapshot } from './queue-read-model.js';
import { compactGenerationResult, serializeJob } from './queue-serialization.js';
import { checkQueueCapacity } from './queue-capacity.js';
import { createQueueActions } from './queue-actions.js';
import {
  forgetTransientSecret,
  getTransientSecret,
  rememberTransientSecret,
  runtimeBodyForJob
} from './queue-transient-secrets.js';
import { logger } from '../utils/logger.js';

const TICK_MS = 5_000;
let started = false;
let schedulerTimer = null;
let kicking = false;
let stopped = false;

const activeJobs = new Map();

export { getQueueSettings, normalizeQueueSettings } from './queue-settings.js';
export {
  onJobUpdate,
  queueEventWatermark,
  replayAdminJobEvents,
  replaySingleJobEvents,
  replayUserJobEvents,
  subscribeAdminJobs,
  subscribeJob,
  subscribeUserJobs
} from './queue-events.js';
export {
  getAdminJob,
  getAdminJobs,
  getJobForUser,
  getUserJobs,
  isActiveStatus,
  queueRuntimeInfo
} from './queue-read-model.js';
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

function timeoutMsForJob(job, settings = getQueueSettings()) {
  if (settings.execution_timeout_ms) return settings.execution_timeout_ms;
  return isComicStoryboardPayload(job?.payload)
    ? getComicStoryboardTimeoutMs()
    : getImageGenerationTimeoutMs();
}

function compactJobResult(job, body = {}) {
  return isComicStoryboardPayload(job?.payload) ? (body || {}) : compactGenerationResult(body);
}

function isRestartRecoverableJob(job) {
  return job?.payload?.useSystemDefault === true || job?.payload?.interfaceMode === 'system';
}

function cleanupRecoveredFailedJob(job) {
  if (!job?.id) return;
  cleanupReferenceJobFiles(job.id).catch((err) => {
    logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
  });
}

function recoverRunningJobsOnStartup() {
  const running = generationJobs.listAll({ limit: 10000, status: 'running' });
  const result = { failed: 0, requeued: 0 };
  for (const job of running) {
    if (isRestartRecoverableJob(job)) {
      const requeued = generationJobs.resetForRetry(job.id, { priority: job.priority });
      if (requeued) result.requeued += 1;
      continue;
    }

    const failed = generationJobs.updateStatus(job.id, 'failed', {
      finishedAt: Date.now(),
      errorMessage: 'server_restart',
      progress: { stage: 'failed', message: '服务已重启，运行中的个人接口任务无法恢复' }
    });
    if (failed) {
      result.failed += 1;
      cleanupRecoveredFailedJob(failed);
      syncComicProjectStatusForJob(failed);
    }
  }
  return result;
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
        transientSecret: getTransientSecret(running.id),
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
    if (!requeued) forgetTransientSecret(job.id);
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
    forgetTransientSecret(job.id);
    cleanupReferenceJobFiles(job.id).catch((err) => {
      logger.warn('job.reference_cleanup_failed', { jobId: job.id, error: err?.message || String(err) });
    });
    changed += 1;
    emitJobStatus(cancelled, 'job');
  }

  if (changed) {
    logger.warn('job.queue_wait_timeout', { cancelled: changed, maxWaitMs: wait });
    // Refresh snapshots so remaining queued jobs get updated positions.
    emitQueueRefresh({ reason: 'queue_wait_timeout', changed });
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
  const recovered = recoverRunningJobsOnStartup();
  if (recovered.failed || recovered.requeued) {
    logger.warn('job.recovered_running_on_startup', recovered);
  }
  cleanupExpiredReferenceJobFiles().then((removed) => {
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
      forgetTransientSecret(jobId);
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

export function queueStats() {
  return queueStatsSnapshot({ activeCount: activeJobs.size });
}

const queueActions = createQueueActions({ activeJobs, kickScheduler, emitJobStatus });

export const { cancelJob, retryJob, updateJobPriority } = queueActions;
