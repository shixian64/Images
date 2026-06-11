import { generationJobs, users } from './db.js';
import { assertCanGenerate } from './quota.js';
import { cleanupReferenceJobFiles, stageReferenceImages } from './reference-images.js';
import { isComicStoryboardPayload } from './comic-storyboard-jobs.js';
import { checkQueueCapacity } from './queue-capacity.js';
import { emitJob } from './queue-events.js';
import { getQueueSettings, priorityForUser } from './queue-settings.js';
import { serializeJob } from './queue-serialization.js';
import { isTerminalJobStatus } from './queue-status.js';
import { forgetTransientSecret } from './queue-transient-secrets.js';
import { httpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';

function cleanupReferencesLater(jobId) {
  cleanupReferenceJobFiles(jobId).catch((err) => {
    logger.warn('job.reference_cleanup_failed', { jobId, error: err?.message || String(err) });
  });
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

export function createQueueActions({ activeJobs, kickScheduler, emitJobStatus }) {
  function cancelJob(jobId, userInfo, { admin = false } = {}) {
    const job = generationJobs.findById(jobId);
    if (!job) throw httpError(404, 'job not found');
    if (!admin && job.user_id !== userInfo?.id) throw httpError(404, 'job not found');
    if (isTerminalJobStatus(job.status)) return serializeJob(job, { includeUser: admin });

    if (job.status === 'queued') {
      const cancelled = generationJobs.updateStatus(job.id, 'cancelled', {
        finishedAt: Date.now(),
        errorMessage: 'cancelled',
        progress: { stage: 'cancelled', message: '任务已取消' },
        cancelRequested: true
      });
      forgetTransientSecret(job.id);
      cleanupReferencesLater(job.id);
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
        cleanupReferencesLater(job.id);
        emitJobStatus(cancelled, 'job');
        return serializeJob(cancelled, { includeUser: admin });
      }
      logger.info('job.cancel_requested', { jobId: job.id, userId: job.user_id, by: userInfo?.id });
      emitJobStatus(requested, 'job');
      return serializeJob(requested, { includeUser: admin });
    }

    throw httpError(409, 'job is not cancellable');
  }

  async function retryJob(jobId, userInfo) {
    const job = generationJobs.findById(jobId);
    if (!job) throw httpError(404, 'job not found');
    if (job.user_id !== userInfo?.id) throw httpError(404, 'job not found');
    if (!isTerminalJobStatus(job.status)) throw httpError(409, 'job is not finished');
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

  function updateJobPriority(jobId, priority, userInfo) {
    const job = generationJobs.findById(jobId);
    if (!job) throw httpError(404, 'job not found');
    const updated = generationJobs.updatePriority(jobId, priority);
    logger.info('job.priority_updated', { jobId, priority: updated.priority, by: userInfo?.id });
    emitJob(updated, 'job');
    kickScheduler();
    return serializeJob(updated, { includeUser: true });
  }

  return { cancelJob, retryJob, updateJobPriority };
}
