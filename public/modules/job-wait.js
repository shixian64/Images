const DEFAULT_FINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

export function createAbortError(message = '已停止任务。') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export async function fetchGenerationJob(jobId, { apiFetch }) {
  const resp = await apiFetch('/api/jobs', { headers: { accept: 'application/json' } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return (Array.isArray(data.items) ? data.items : []).find((job) => job.id === jobId) || null;
}

export function waitForGenerationJob(jobId, {
  signal,
  fetchJob,
  eventTarget = globalThis.window,
  timeoutMs = 20 * 60 * 1000,
  pollMs = 4000,
  finalStatuses = DEFAULT_FINAL_STATUSES,
  abortErrorFactory = createAbortError
} = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let polling = false;

    const cleanup = () => {
      done = true;
      clearTimeout(timeoutId);
      clearInterval(pollId);
      eventTarget?.removeEventListener?.('generation-job-finished', onFinished);
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
    const onAbort = () => fail(abortErrorFactory());
    const timeoutId = setTimeout(() => fail(new Error('等待任务完成超时。')), timeoutMs);
    const pollId = setInterval(async () => {
      if (polling || done || !fetchJob) return;
      polling = true;
      try {
        const job = await fetchJob(jobId);
        if (job && finalStatuses.has(job.status)) finish(job);
      } catch {
        // SSE/event dispatch is the main path; polling failures should not
        // break the wait loop because the next poll or finish event may still
        // arrive.
      } finally {
        polling = false;
      }
    }, pollMs);

    eventTarget?.addEventListener?.('generation-job-finished', onFinished);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export async function cancelGenerationJob(jobId, { apiFetch }) {
  if (!jobId) return false;
  try {
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    return true;
  } catch {
    // Cancellation is best-effort; the job may already be final.
    return false;
  }
}
