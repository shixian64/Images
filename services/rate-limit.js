// Sliding-window rate limiter. State is persisted in SQLite after the normal
// startup migration, with an in-memory fallback for isolated unit use before
// the rate_limits table exists.

import { positiveIntFromEnv } from '../utils/config.js';
import { rateLimits } from './db.js';

const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

const memoryStore = new Map();
let lastCleanupAt = 0;

function maxKeysFromEnv() {
  return positiveIntFromEnv('RATE_LIMIT_MAX_KEYS', DEFAULT_MAX_KEYS);
}

function cleanupIntervalMsFromEnv() {
  return positiveIntFromEnv('RATE_LIMIT_CLEANUP_INTERVAL_MS', DEFAULT_CLEANUP_INTERVAL_MS, { allowZero: true });
}

function normalizeEntry(entry, windowMs, now) {
  if (Array.isArray(entry)) {
    return { hits: entry, windowMs, lastSeen: now };
  }
  return {
    hits: Array.isArray(entry?.hits) ? entry.hits : [],
    windowMs: Number.isFinite(entry?.windowMs) && entry.windowMs > 0 ? entry.windowMs : windowMs,
    lastSeen: Number.isFinite(entry?.lastSeen) ? entry.lastSeen : now
  };
}

function freshHits(entry, now) {
  const windowMs = Number(entry.windowMs) || 0;
  return entry.hits.filter((ts) => now - ts < windowMs);
}

function compactExpired(store, now) {
  for (const [key, rawEntry] of store.entries()) {
    const entry = normalizeEntry(rawEntry, DEFAULT_CLEANUP_INTERVAL_MS, now);
    const fresh = freshHits(entry, now);
    if (!fresh.length) {
      store.delete(key);
      continue;
    }
    store.set(key, {
      ...entry,
      hits: fresh,
      lastSeen: Math.max(entry.lastSeen, fresh[fresh.length - 1])
    });
  }
}

function enforceMaxKeys(store, maxKeys, currentKey) {
  const targetSize = store.has(currentKey) ? maxKeys : maxKeys - 1;
  if (store.size <= targetSize) return;
  const victims = [...store.entries()]
    .filter(([key]) => key !== currentKey)
    .map(([key, rawEntry]) => [key, normalizeEntry(rawEntry, DEFAULT_CLEANUP_INTERVAL_MS, 0)])
    .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [key] of victims) {
    if (store.size <= targetSize) break;
    store.delete(key);
  }
}

function cleanupIfNeeded(store, now, cleanupIntervalMs, maxKeys, key) {
  if (cleanupIntervalMs === 0 || now - lastCleanupAt >= cleanupIntervalMs || store.size >= maxKeys) {
    compactExpired(store, now);
    lastCleanupAt = now;
  }
  enforceMaxKeys(store, maxKeys, key);
}

function compactExpiredPersistent(store, now) {
  const entries = store.list();
  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry, DEFAULT_CLEANUP_INTERVAL_MS, now);
    const fresh = freshHits(entry, now);
    if (!fresh.length) {
      store.delete(rawEntry.key);
      continue;
    }
    if (fresh.length !== entry.hits.length) {
      store.upsert(rawEntry.key, {
        ...entry,
        hits: fresh,
        lastSeen: Math.max(entry.lastSeen, fresh[fresh.length - 1])
      });
    }
  }
}

function enforceMaxKeysPersistent(store, maxKeys, currentKey) {
  const targetSize = store.has(currentKey) ? maxKeys : maxKeys - 1;
  let size = store.count();
  if (size <= targetSize) return;
  const victims = store.list()
    .filter((entry) => entry.key !== currentKey)
    .map((entry) => [entry.key, normalizeEntry(entry, DEFAULT_CLEANUP_INTERVAL_MS, 0)])
    .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [victimKey] of victims) {
    if (size <= targetSize) break;
    store.delete(victimKey);
    size -= 1;
  }
}

function cleanupPersistentIfNeeded(store, now, cleanupIntervalMs, maxKeys, key) {
  if (cleanupIntervalMs === 0 || now - lastCleanupAt >= cleanupIntervalMs || store.count() >= maxKeys) {
    compactExpiredPersistent(store, now);
    lastCleanupAt = now;
  }
  enforceMaxKeysPersistent(store, maxKeys, key);
}

function isMissingRateLimitTableError(err) {
  return /no such table:\s*rate_limits/i.test(err?.message || String(err || ''));
}

function hitMemory(key, max, windowMs, { now, maxKeys, cleanupIntervalMs } = {}) {
  cleanupIfNeeded(memoryStore, now, cleanupIntervalMs, maxKeys, key);

  const entry = normalizeEntry(memoryStore.get(key), windowMs, now);
  const fresh = freshHits({ ...entry, windowMs }, now);
  if (fresh.length >= max) {
    memoryStore.set(key, { hits: fresh, windowMs, lastSeen: now });
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - fresh[0]) };
  }
  fresh.push(now);
  memoryStore.set(key, { hits: fresh, windowMs, lastSeen: now });
  return { allowed: true, remaining: max - fresh.length, retryAfterMs: 0 };
}

function hitPersistent(key, max, windowMs, { now, maxKeys, cleanupIntervalMs } = {}) {
  return rateLimits.withWriteLock((store) => {
    cleanupPersistentIfNeeded(store, now, cleanupIntervalMs, maxKeys, key);

    const entry = normalizeEntry(store.get(key), windowMs, now);
    const fresh = freshHits({ ...entry, windowMs }, now);
    if (fresh.length >= max) {
      store.upsert(key, { hits: fresh, windowMs, lastSeen: now });
      return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - fresh[0]) };
    }
    fresh.push(now);
    store.upsert(key, { hits: fresh, windowMs, lastSeen: now });
    return { allowed: true, remaining: max - fresh.length, retryAfterMs: 0 };
  });
}

export function hit(key, max, windowMs, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxKeys = Math.max(1, Math.floor(Number(options.maxKeys) || maxKeysFromEnv()));
  const cleanupIntervalMs = Math.max(
    0,
    Math.floor(Number(options.cleanupIntervalMs ?? cleanupIntervalMsFromEnv()) || 0)
  );
  const args = { now, maxKeys, cleanupIntervalMs };
  try {
    return hitPersistent(key, max, windowMs, args);
  } catch (err) {
    if (!isMissingRateLimitTableError(err)) throw err;
    return hitMemory(key, max, windowMs, args);
  }
}

export function reset(key) {
  memoryStore.delete(key);
  try {
    rateLimits.withWriteLock((store) => store.delete(key));
  } catch (err) {
    if (!isMissingRateLimitTableError(err)) throw err;
  }
}

export function clear() {
  memoryStore.clear();
  lastCleanupAt = 0;
  try {
    rateLimits.withWriteLock((store) => store.clear());
  } catch (err) {
    if (!isMissingRateLimitTableError(err)) throw err;
  }
}

export function stats() {
  let hits = 0;
  try {
    return { ...rateLimits.stats(), backend: 'sqlite' };
  } catch (err) {
    if (!isMissingRateLimitTableError(err)) throw err;
  }
  for (const entry of memoryStore.values()) {
    hits += normalizeEntry(entry, DEFAULT_CLEANUP_INTERVAL_MS, 0).hits.length;
  }
  return { keys: memoryStore.size, hits, backend: 'memory' };
}
