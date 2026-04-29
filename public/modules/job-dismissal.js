// 生成队列「清空已完成」的本地持久化状态。
// 只隐藏当前用户已清空的完成记录，不删除服务端任务历史。

import { KEYS, readJsonScoped, writeJsonScoped } from './state.js';

const MAX_DISMISSED_DONE_JOBS = 500;

function normalizeDismissedKeys(value, { max = MAX_DISMISSED_DONE_JOBS } = {}) {
  const seen = new Set();
  const normalized = [];
  const list = Array.isArray(value) || value instanceof Set ? [...value] : [];
  for (const item of list) {
    const key = typeof item === 'string' ? item.trim() : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized.slice(-Math.max(1, Math.floor(Number(max) || MAX_DISMISSED_DONE_JOBS)));
}

export function doneJobDismissalKey(job = {}) {
  if (!job?.id || !job?.status) return '';
  const version = Number(job.finishedAt || job.updatedAt || job.createdAt || 0) || 0;
  return `${job.id}:${job.status}:${version}`;
}

export function readDismissedDoneJobs() {
  return new Set(normalizeDismissedKeys(readJsonScoped(KEYS.jobQueueDismissedDone, [])));
}

export function writeDismissedDoneJobs(keys, options = {}) {
  const normalized = normalizeDismissedKeys(keys, options);
  writeJsonScoped(KEYS.jobQueueDismissedDone, normalized);
  return new Set(normalized);
}

export function isDoneJobDismissed(job, dismissedKeys) {
  if (!job?.id || !dismissedKeys?.has) return false;
  const key = doneJobDismissalKey(job);
  // 兼容可能存在的旧版 ID-only 记录；新版使用带状态/时间戳的版本化 key。
  return Boolean(key && (dismissedKeys.has(key) || dismissedKeys.has(job.id)));
}

export function removeDismissalsForJobIds(keys, jobIds, options = {}) {
  const next = new Set(keys || []);
  let changed = false;

  for (const rawId of jobIds || []) {
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id) continue;
    if (next.delete(id)) changed = true;

    const prefix = `${id}:`;
    for (const key of [...next]) {
      if (key.startsWith(prefix)) {
        next.delete(key);
        changed = true;
      }
    }
  }

  return changed ? writeDismissedDoneJobs(next, options) : next;
}
