import { positiveIntFromEnv } from '../utils/config.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { auditLogs, clientLogs, sessions, usageDaily } from './db.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180;
const DEFAULT_CLIENT_LOG_RETENTION_DAYS = 30;
const DEFAULT_USAGE_DAILY_RETENTION_DAYS = 400;

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function retentionDays(name, fallback) {
  return positiveIntFromEnv(name, fallback, { allowZero: true });
}

function cutoffIso(now, days) {
  if (!days) return '';
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

function cutoffDay(now, days) {
  if (!days) return '';
  return cutoffIso(now, days).slice(0, 10);
}

function totalRemoved(result) {
  return Object.values(result).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export function cleanupRuntimeData({ now = new Date(), logger = defaultLogger } = {}) {
  const current = normalizeDate(now);
  const auditRetentionDays = retentionDays('AUDIT_LOG_RETENTION_DAYS', DEFAULT_AUDIT_LOG_RETENTION_DAYS);
  const clientLogRetentionDays = retentionDays('CLIENT_LOG_RETENTION_DAYS', DEFAULT_CLIENT_LOG_RETENTION_DAYS);
  const usageRetentionDays = retentionDays('USAGE_DAILY_RETENTION_DAYS', DEFAULT_USAGE_DAILY_RETENTION_DAYS);

  const result = {
    sessions: sessions.destroyExpired(current.toISOString()),
    auditLogs: auditRetentionDays ? auditLogs.deleteOlderThan(cutoffIso(current, auditRetentionDays)) : 0,
    clientLogs: clientLogRetentionDays ? clientLogs.deleteOlderThan(cutoffIso(current, clientLogRetentionDays)) : 0,
    usageDaily: usageRetentionDays ? usageDaily.deleteOlderThan(cutoffDay(current, usageRetentionDays)) : 0
  };

  if (logger && totalRemoved(result) > 0) {
    logger.info('data.cleanup', result);
  }
  return result;
}

export function dataCleanupIntervalMs() {
  return positiveIntFromEnv('DATA_CLEANUP_INTERVAL_MS', DEFAULT_CLEANUP_INTERVAL_MS, { allowZero: true });
}

export function startDataMaintenance({ logger = defaultLogger, runImmediately = true, intervalMs = dataCleanupIntervalMs() } = {}) {
  const run = () => {
    try {
      cleanupRuntimeData({ logger });
    } catch (err) {
      logger?.warn?.('data.cleanup_failed', { err });
    }
  };

  if (runImmediately) run();
  if (!intervalMs) return null;

  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
