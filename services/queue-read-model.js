import { generationJobs, users } from './db.js';
import { serializeJob } from './queue-serialization.js';
import { isActiveJobStatus, TERMINAL_JOB_STATUSES } from './queue-status.js';

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

function httpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
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

export function queueStats({ activeCount = 0 } = {}) {
  const storedStats = generationJobs.stats();
  const byStatus = storedStats.byStatus || {};
  const terminal = TERMINAL_JOB_STATUSES
    .reduce((sum, status) => sum + (Number(byStatus[status]) || 0), 0);
  const succeeded = Number(byStatus.succeeded) || 0;
  return {
    byStatus,
    active: Math.max(0, Math.floor(Number(activeCount) || 0)),
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

export function isActiveStatus(status) {
  return isActiveJobStatus(status);
}
