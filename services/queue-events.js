import { serializeJob } from './queue-serialization.js';

const userSubscribers = new Map();
const jobSubscribers = new Map();
const adminSubscribers = new Set();
const jobListeners = new Map();

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

export function emitQueueRefresh(data = {}) {
  emitTo(adminSubscribers, 'refresh', data);
  for (const set of userSubscribers.values()) {
    emitTo(set, 'refresh', data);
  }
}

export function emitJob(job, event = 'job') {
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
