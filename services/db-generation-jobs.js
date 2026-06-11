// SQLite repository for generation job queue rows.

import { randomUUID } from 'node:crypto';

const JOB_JSON_FIELDS = new Set(['payload_json', 'result_json', 'progress_json']);
export const JOB_RESULT_MAX_JSON_CHARS = 80_000;
export const JOB_PROGRESS_MAX_JSON_CHARS = 10_000;

function parseJob(row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of JOB_JSON_FIELDS) {
    const publicKey = key.replace(/_json$/, '');
    const value = row[key];
    if (value === null || value === undefined || value === '') {
      out[publicKey] = key === 'payload_json' ? {} : null;
    } else {
      try { out[publicKey] = JSON.parse(value); } catch { out[publicKey] = null; }
    }
  }
  out.n = Number(out.n) || 1;
  out.priority = Number(out.priority) || 0;
  out.attempts = Number(out.attempts) || 0;
  out.cancel_requested = Number(out.cancel_requested) || 0;
  return out;
}

function truncateJsonText(value, maxChars) {
  const text = String(value ?? '');
  const max = Math.max(0, Math.floor(Number(maxChars) || 0));
  if (text.length <= max) return text;
  if (max <= 3) return '.'.repeat(max);
  return `${text.slice(0, max - 3)}...`;
}

function compactJsonString(json, maxChars) {
  const out = {
    truncated: true,
    originalJsonChars: json.length,
    preview: ''
  };
  const overhead = JSON.stringify(out).length;
  out.preview = truncateJsonText(json, Math.max(0, maxChars - overhead - 1));
  while (JSON.stringify(out).length > maxChars && out.preview.length > 0) {
    out.preview = truncateJsonText(out.preview, Math.max(0, out.preview.length - 256));
  }
  return JSON.stringify(out);
}

function jobPayload(value, fallback = null, { maxJsonChars = null } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return fallback;
  const json = JSON.stringify(value);
  if (json === undefined) return fallback;
  if (!maxJsonChars || json.length <= maxJsonChars) return json;
  return compactJsonString(json, maxJsonChars);
}

function jobResultPayload(value) {
  return jobPayload(value, null, { maxJsonChars: JOB_RESULT_MAX_JSON_CHARS });
}

function jobProgressPayload(value) {
  return jobPayload(value, null, { maxJsonChars: JOB_PROGRESS_MAX_JSON_CHARS });
}

function parseJobPayloadJson(value) {
  if (value === null || value === undefined || value === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isQuotaManagedJobPayload(payload = {}) {
  return payload?.useSystemDefault === true || payload?.interfaceMode === 'system';
}

export function createGenerationJobRepository({ open }) {
  const repo = {
    create({ id, userId, status = 'queued', priority = 0, payload, promptPreview, profileName, model, n }) {
      const db = open();
      const now = Date.now();
      const jobId = id || randomUUID();
      db.prepare(`
        INSERT INTO generation_jobs
        (id, user_id, status, priority, payload_json, prompt_preview, profile_name, model, n,
         result_json, error_message, progress_json, created_at, started_at, finished_at, updated_at, attempts, cancel_requested)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, 0, 0)
      `).run(
        jobId,
        userId,
        status,
        Math.floor(Number(priority) || 0),
        JSON.stringify(payload || {}),
        promptPreview || null,
        profileName || null,
        model || null,
        Math.max(1, Math.floor(Number(n) || 1)),
        now,
        now
      );
      return repo.findById(jobId);
    },
    findById(id) {
      return parseJob(open().prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id));
    },
    listByUser(userId, { activeLimit = 100, recentLimit = 50 } = {}) {
      const db = open();
      const active = db.prepare(`
        SELECT * FROM generation_jobs
        WHERE user_id = ? AND status IN ('queued', 'running')
        ORDER BY
          CASE status WHEN 'running' THEN 0 ELSE 1 END,
          priority DESC,
          created_at ASC
        LIMIT ?
      `).all(userId, Math.max(1, Math.floor(activeLimit)));
      const recent = db.prepare(`
        SELECT * FROM generation_jobs
        WHERE user_id = ? AND status NOT IN ('queued', 'running')
        ORDER BY COALESCE(finished_at, updated_at, created_at) DESC
        LIMIT ?
      `).all(userId, Math.max(1, Math.floor(recentLimit)));
      return [...active, ...recent].map(parseJob);
    },
    listByComicProject(userId, projectId, { limit = 1000, scanLimit = 5000 } = {}) {
      const rows = open().prepare(`
        SELECT * FROM generation_jobs
        WHERE user_id = ?
        ORDER BY
          CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
          CASE WHEN status IN ('queued', 'running') THEN priority ELSE 0 END DESC,
          CASE WHEN status IN ('queued', 'running') THEN created_at ELSE -COALESCE(finished_at, updated_at, created_at) END ASC
        LIMIT ?
      `).all(userId, Math.max(1, Math.floor(Number(scanLimit) || 5000))).map(parseJob);
      const id = String(projectId || '');
      return rows
        .filter((job) => String(job?.payload?.comicProjectId || '') === id)
        .slice(0, Math.max(1, Math.floor(Number(limit) || 1000)));
    },
    listAll({ limit = 200, status = '', userId = '' } = {}) {
      const db = open();
      const clauses = [];
      const args = [];
      if (status) {
        clauses.push('j.status = ?');
        args.push(status);
      }
      if (userId) {
        clauses.push('j.user_id = ?');
        args.push(userId);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT j.*, u.username AS user_username, u.email AS user_email, u.role AS user_role
        FROM generation_jobs j
        LEFT JOIN users u ON u.id = j.user_id
        ${where}
        ORDER BY
          CASE j.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
          CASE WHEN j.status IN ('queued', 'running') THEN j.priority ELSE 0 END DESC,
          CASE WHEN j.status IN ('queued', 'running') THEN j.created_at ELSE -COALESCE(j.finished_at, j.updated_at, j.created_at) END ASC
        LIMIT ?
      `).all(...args, Math.max(1, Math.floor(limit)));
      return rows.map(parseJob);
    },
    stats() {
      const db = open();
      const byStatus = {};
      for (const row of db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM generation_jobs
        GROUP BY status
      `).all()) {
        if (!row?.status) continue;
        byStatus[row.status] = Number(row.count) || 0;
      }
      const duration = db.prepare(`
        SELECT COUNT(*) AS count, AVG(finished_at - started_at) AS avg_ms
        FROM generation_jobs
        WHERE status = 'succeeded'
          AND started_at IS NOT NULL
          AND finished_at IS NOT NULL
      `).get();
      const completedDurations = Number(duration?.count) || 0;
      return {
        byStatus,
        completedDurations,
        avgSuccessDurationMs: completedDurations ? Math.round(Number(duration?.avg_ms) || 0) : null
      };
    },
    queuedBatch(limit = 50, excludedUserIds = []) {
      const args = [];
      let excludedSql = '';
      const ids = [...new Set((excludedUserIds || []).filter(Boolean))];
      if (ids.length) {
        excludedSql = `AND user_id NOT IN (${ids.map(() => '?').join(',')})`;
        args.push(...ids);
      }
      args.push(Math.max(1, Math.floor(limit)));
      return open().prepare(`
        SELECT * FROM generation_jobs
        WHERE status = 'queued' AND cancel_requested = 0
        ${excludedSql}
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      `).all(...args).map(parseJob);
    },
    claimQueued(id, { startedAt = Date.now(), attempts = 0, progress = null } = {}) {
      const db = open();
      const now = Date.now();
      const result = db.prepare(`
        UPDATE generation_jobs
        SET status = 'running',
            started_at = ?,
            finished_at = NULL,
            result_json = NULL,
            error_message = NULL,
            progress_json = ?,
            attempts = ?,
            cancel_requested = 0,
            updated_at = ?
        WHERE id = ?
          AND status = 'queued'
          AND cancel_requested = 0
      `).run(
        startedAt,
        progress === null || progress === undefined ? null : jobProgressPayload(progress || {}),
        Math.max(0, Math.floor(Number(attempts) || 0)),
        now,
        id
      );
      if ((result.changes || 0) !== 1) return null;
      return repo.findById(id);
    },
    updateStatus(id, status, patch = {}) {
      const db = open();
      const current = repo.findById(id);
      if (!current) return null;
      const next = {
        started_at: patch.startedAt === undefined ? current.started_at : patch.startedAt,
        finished_at: patch.finishedAt === undefined ? current.finished_at : patch.finishedAt,
        result_json: patch.result === undefined ? current.result_json : jobResultPayload(patch.result),
        error_message: patch.errorMessage === undefined ? current.error_message : (patch.errorMessage || null),
        progress_json: patch.progress === undefined ? current.progress_json : jobProgressPayload(patch.progress),
        attempts: patch.attempts === undefined ? current.attempts : Math.max(0, Math.floor(Number(patch.attempts) || 0)),
        cancel_requested: patch.cancelRequested === undefined
          ? current.cancel_requested
          : (patch.cancelRequested ? 1 : 0)
      };
      db.prepare(`
        UPDATE generation_jobs
        SET status = ?,
            started_at = ?,
            finished_at = ?,
            result_json = ?,
            error_message = ?,
            progress_json = ?,
            attempts = ?,
            cancel_requested = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        status,
        next.started_at ?? null,
        next.finished_at ?? null,
        next.result_json ?? null,
        next.error_message ?? null,
        next.progress_json ?? null,
        next.attempts,
        next.cancel_requested,
        Date.now(),
        id
      );
      return repo.findById(id);
    },
    updateProgress(id, progress) {
      open().prepare(`
        UPDATE generation_jobs
        SET progress_json = ?, updated_at = ?
        WHERE id = ?
      `).run(jobProgressPayload(progress || {}), Date.now(), id);
      return repo.findById(id);
    },
    updatePayload(id, payload) {
      open().prepare(`
        UPDATE generation_jobs
        SET payload_json = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(payload || {}), Date.now(), id);
      return repo.findById(id);
    },
    requestCancel(id) {
      open().prepare(`
        UPDATE generation_jobs
        SET cancel_requested = 1, updated_at = ?
        WHERE id = ?
      `).run(Date.now(), id);
      return repo.findById(id);
    },
    updatePriority(id, priority) {
      open().prepare(`
        UPDATE generation_jobs
        SET priority = ?, updated_at = ?
        WHERE id = ?
      `).run(Math.floor(Number(priority) || 0), Date.now(), id);
      return repo.findById(id);
    },
    resetForRetry(id, { priority = null } = {}) {
      const current = repo.findById(id);
      if (!current) return null;
      open().prepare(`
        UPDATE generation_jobs
        SET status = 'queued',
            priority = ?,
            result_json = NULL,
            error_message = NULL,
            progress_json = NULL,
            started_at = NULL,
            finished_at = NULL,
            attempts = 0,
            cancel_requested = 0,
            updated_at = ?
        WHERE id = ?
      `).run(priority === null ? current.priority : Math.floor(Number(priority) || 0), Date.now(), id);
      return repo.findById(id);
    },
    recoverRunningAsFailed(reason = 'server_restart') {
      const now = Date.now();
      const res = open().prepare(`
        UPDATE generation_jobs
        SET status = 'failed',
            error_message = ?,
            finished_at = ?,
            updated_at = ?
        WHERE status = 'running'
      `).run(reason, now, now);
      return res.changes || 0;
    },
    queuedOlderThan(cutoffMs, limit = 1000) {
      return open().prepare(`
        SELECT * FROM generation_jobs
        WHERE status = 'queued' AND created_at < ?
        ORDER BY created_at ASC
        LIMIT ?
      `).all(cutoffMs, Math.max(1, Math.floor(Number(limit) || 1000))).map(parseJob);
    },
    countQueued({ userId = '', statuses = ['queued'] } = {}) {
      const states = Array.isArray(statuses) && statuses.length ? statuses : ['queued'];
      const args = [...states];
      let where = `status IN (${states.map(() => '?').join(',')})`;
      if (userId) {
        where += ' AND user_id = ?';
        args.push(userId);
      }
      return open().prepare(`SELECT COUNT(*) AS n FROM generation_jobs WHERE ${where}`).get(...args)?.n || 0;
    },
    pendingCallCount(userId, { quotaManagedOnly = false } = {}) {
      if (!userId) return 0;
      const rows = open().prepare(`
        SELECT n, payload_json
        FROM generation_jobs
        WHERE user_id = ? AND status IN ('queued', 'running')
      `).all(userId);
      return rows.reduce((sum, row) => {
        if (quotaManagedOnly && !isQuotaManagedJobPayload(parseJobPayloadJson(row.payload_json))) return sum;
        return sum + (Number(row.n) || 0);
      }, 0);
    },
    pendingCallCountBySignupIp(signupIp, { quotaManagedOnly = false } = {}) {
      if (!signupIp) return 0;
      const rows = open().prepare(`
        SELECT j.n, j.payload_json
        FROM generation_jobs j
        JOIN users u ON u.id = j.user_id
        WHERE u.signup_ip = ? AND u.role != 'admin' AND j.status IN ('queued', 'running')
      `).all(signupIp);
      return rows.reduce((sum, row) => {
        if (quotaManagedOnly && !isQuotaManagedJobPayload(parseJobPayloadJson(row.payload_json))) return sum;
        return sum + (Number(row.n) || 0);
      }, 0);
    },
    queuePosition(id) {
      const job = repo.findById(id);
      if (!job || job.status !== 'queued') return null;
      const row = open().prepare(`
        SELECT COUNT(*) AS n
        FROM generation_jobs
        WHERE status = 'queued'
          AND (
            priority > ?
            OR (priority = ? AND created_at < ?)
            OR (priority = ? AND created_at = ? AND id <= ?)
          )
      `).get(job.priority, job.priority, job.created_at, job.priority, job.created_at, id);
      return Number(row?.n) || 1;
    }
  };
  return repo;
}
