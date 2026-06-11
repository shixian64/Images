import { generationJobs } from './db.js';
import { publicReferencePayload } from './reference-images.js';

export function compactGenerationResult(body = {}) {
  const out = { ...(body || {}) };
  if (Array.isArray(out.data)) {
    out.data = out.data.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const next = { ...item };
      // Never persist inline image payloads in the job table. A failed save can
      // still leave save_error next to the original b64_json item, and storing
      // that blob would inflate SQLite/SSE payloads dramatically.
      delete next.b64_json;
      // Upstream URL outputs can be temporary/signed and can also bypass local
      // storage/quota boundaries when mirroring failed. Keep only local_url /
      // localUrl from the gallery mirror; failed saves retain save_error.
      delete next.url;
      return next;
    });
  }
  return out;
}

function publicPayload(payload = {}) {
  const out = { ...(payload || {}) };
  if (Array.isArray(out.referenceImages)) {
    out.referenceImages = publicReferencePayload(out.referenceImages);
  }
  return out;
}

export function serializeJob(job, { includeUser = false } = {}) {
  if (!job) return null;
  const result = job.result ?? null;
  const payload = publicPayload(job.payload || {});
  const out = {
    id: job.id,
    userId: job.user_id,
    status: job.status,
    priority: Number(job.priority) || 0,
    promptPreview: job.prompt_preview || '',
    profileName: job.profile_name || '',
    model: job.model || '',
    n: Number(job.n) || 1,
    payload,
    result,
    error: job.error_message || '',
    progress: job.progress || null,
    createdAt: Number(job.created_at) || null,
    startedAt: Number(job.started_at) || null,
    finishedAt: Number(job.finished_at) || null,
    updatedAt: Number(job.updated_at) || null,
    attempts: Number(job.attempts) || 0,
    cancelRequested: Boolean(job.cancel_requested),
    position: job.status === 'queued' ? generationJobs.queuePosition(job.id) : null
  };
  if (includeUser) {
    out.user = {
      id: job.user_id,
      username: job.user_username || '',
      email: job.user_email || '',
      role: job.user_role || ''
    };
  }
  return out;
}
