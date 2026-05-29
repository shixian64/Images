// In-memory sliding-window rate limiter. State is process-local and resets on restart.

import { positiveIntFromEnv } from '../utils/config.js';

const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

const store = new Map();
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

function compactExpired(now) {
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

function enforceMaxKeys(maxKeys, currentKey) {
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

function cleanupIfNeeded(now, cleanupIntervalMs, maxKeys, key) {
  if (cleanupIntervalMs === 0 || now - lastCleanupAt >= cleanupIntervalMs || store.size >= maxKeys) {
    compactExpired(now);
    lastCleanupAt = now;
  }
  enforceMaxKeys(maxKeys, key);
}

export function hit(key, max, windowMs, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxKeys = Math.max(1, Math.floor(Number(options.maxKeys) || maxKeysFromEnv()));
  const cleanupIntervalMs = Math.max(
    0,
    Math.floor(Number(options.cleanupIntervalMs ?? cleanupIntervalMsFromEnv()) || 0)
  );
  cleanupIfNeeded(now, cleanupIntervalMs, maxKeys, key);

  const entry = normalizeEntry(store.get(key), windowMs, now);
  const fresh = freshHits({ ...entry, windowMs }, now);
  if (fresh.length >= max) {
    store.set(key, { hits: fresh, windowMs, lastSeen: now });
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - fresh[0]) };
  }
  fresh.push(now);
  store.set(key, { hits: fresh, windowMs, lastSeen: now });
  return { allowed: true, remaining: max - fresh.length, retryAfterMs: 0 };
}

export function reset(key) {
  store.delete(key);
}

export function clear() {
  store.clear();
  lastCleanupAt = 0;
}

export function stats() {
  let hits = 0;
  for (const entry of store.values()) {
    hits += normalizeEntry(entry, DEFAULT_CLEANUP_INTERVAL_MS, 0).hits.length;
  }
  return { keys: store.size, hits };
}
