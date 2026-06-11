import { serializeJob } from './queue-serialization.js';
import { queueEvents } from './db.js';
import { positiveIntFromEnv } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const userSubscribers = new Map();
const jobSubscribers = new Map();
const adminSubscribers = new Set();
const jobListeners = new Map();
const DEFAULT_QUEUE_EVENT_REPLAY_LIMIT = 200;
const DEFAULT_QUEUE_EVENT_LOG_MAX_ROWS = 5000;
let eventsSincePrune = 0;

function queueEventReplayLimit() {
  return positiveIntFromEnv('QUEUE_EVENT_REPLAY_LIMIT', DEFAULT_QUEUE_EVENT_REPLAY_LIMIT);
}

function queueEventLogMaxRows() {
  return positiveIntFromEnv('QUEUE_EVENT_LOG_MAX_ROWS', DEFAULT_QUEUE_EVENT_LOG_MAX_ROWS);
}

function safeWriteSse(res, event, data = {}, { id = null } = {}) {
  if (!res || res.destroyed || res.writableEnded) return false;
  try {
    if (id !== null && id !== undefined && id !== '') res.write(`id: ${id}\n`);
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

function maybePruneQueueEvents() {
  eventsSincePrune += 1;
  if (eventsSincePrune < 100) return;
  eventsSincePrune = 0;
  try {
    queueEvents.pruneToMaxRows(queueEventLogMaxRows());
  } catch (err) {
    logger.warn('queue.events_prune_failed', { error: err?.message || String(err) });
  }
}

function recordQueueEvent(entry) {
  try {
    const row = queueEvents.create(entry);
    maybePruneQueueEvents();
    return row;
  } catch (err) {
    logger.warn('queue.event_record_failed', { event: entry?.event, scope: entry?.scope, error: err?.message || String(err) });
    return null;
  }
}

function emitTo(set, event, data) {
  for (const res of [...(set || [])]) {
    if (!safeWriteSse(res, event, data)) set.delete(res);
  }
}

function emitRowTo(set, row) {
  for (const res of [...(set || [])]) {
    if (!safeWriteSse(res, row.event, row.payload, { id: row.id })) set.delete(res);
  }
}

function replayRows(res, rows = []) {
  let sent = 0;
  for (const row of rows) {
    if (safeWriteSse(res, row.event, row.payload, { id: row.id })) sent += 1;
  }
  return sent;
}

export function queueEventWatermark() {
  try {
    return queueEvents.latestId();
  } catch {
    return 0;
  }
}

export function replayUserJobEvents(userId, res, { afterId = 0, limit = queueEventReplayLimit() } = {}) {
  if (!afterId) return 0;
  return replayRows(res, queueEvents.listForUser(userId, { afterId, limit }));
}

export function replaySingleJobEvents(jobId, res, { afterId = 0, limit = queueEventReplayLimit() } = {}) {
  if (!afterId) return 0;
  return replayRows(res, queueEvents.listForJob(jobId, { afterId, limit }));
}

export function replayAdminJobEvents(res, { afterId = 0, limit = queueEventReplayLimit() } = {}) {
  if (!afterId) return 0;
  return replayRows(res, queueEvents.listForAdmin({ afterId, limit }));
}

export function emitQueueRefresh(data = {}) {
  const row = recordQueueEvent({ scope: 'global', event: 'refresh', payload: data });
  if (row) {
    emitRowTo(adminSubscribers, row);
  } else {
    emitTo(adminSubscribers, 'refresh', data);
  }
  for (const set of userSubscribers.values()) {
    if (row) emitRowTo(set, row);
    else emitTo(set, 'refresh', data);
  }
}

export function emitJob(job, event = 'job') {
  const payload = serializeJob(job, { includeUser: false });
  if (!payload) return;
  const userRow = recordQueueEvent({
    scope: 'user',
    event,
    userId: job.user_id,
    jobId: job.id,
    payload
  });
  if (userRow) {
    emitRowTo(userSubscribers.get(job.user_id), userRow);
    emitRowTo(jobSubscribers.get(job.id), userRow);
  } else {
    emitTo(userSubscribers.get(job.user_id), event, payload);
    emitTo(jobSubscribers.get(job.id), event, payload);
  }
  const adminPayload = serializeJob(job, { includeUser: true });
  const adminRow = recordQueueEvent({
    scope: 'admin',
    event,
    userId: job.user_id,
    jobId: job.id,
    payload: adminPayload
  });
  if (adminRow) emitRowTo(adminSubscribers, adminRow);
  else emitTo(adminSubscribers, event, adminPayload);
  for (const handler of [...(jobListeners.get(job.id) || [])]) {
    try { handler(payload, event); } catch { /* listener errors must not break scheduler */ }
  }
}
