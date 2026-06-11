import { systemSettings } from './db.js';

const SETTINGS_KEY = 'queue.settings';

const DEFAULT_SETTINGS = Object.freeze({
  global_concurrency: null,
  max_pending_per_user: 20,
  max_pending_global: 200,
  max_wait_ms: 0,
  execution_timeout_ms: null,
  max_retries: 0,
  maintenance_mode: false,
  role_priorities: { admin: 100, user: 0 }
});

function numericOrNull(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeRolePriorities(value) {
  const source = value && typeof value === 'object' ? value : DEFAULT_SETTINGS.role_priorities;
  const out = {};
  for (const [role, priority] of Object.entries(source)) {
    const key = String(role || '').trim();
    if (!key) continue;
    out[key] = Math.floor(Number(priority) || 0);
  }
  return { ...DEFAULT_SETTINGS.role_priorities, ...out };
}

export function normalizeQueueSettings(value = {}) {
  const current = value && typeof value === 'object' ? value : {};
  return {
    global_concurrency: numericOrNull(current.global_concurrency ?? current.globalConcurrency, DEFAULT_SETTINGS.global_concurrency),
    max_pending_per_user: numericOrNull(current.max_pending_per_user ?? current.maxPendingPerUser, DEFAULT_SETTINGS.max_pending_per_user),
    max_pending_global: numericOrNull(current.max_pending_global ?? current.maxPendingGlobal, DEFAULT_SETTINGS.max_pending_global),
    max_wait_ms: numericOrNull(current.max_wait_ms ?? current.maxWaitMs, DEFAULT_SETTINGS.max_wait_ms),
    execution_timeout_ms: numericOrNull(current.execution_timeout_ms ?? current.executionTimeoutMs, DEFAULT_SETTINGS.execution_timeout_ms),
    max_retries: numericOrNull(current.max_retries ?? current.maxRetries, DEFAULT_SETTINGS.max_retries),
    maintenance_mode: Boolean(current.maintenance_mode ?? current.maintenanceMode ?? DEFAULT_SETTINGS.maintenance_mode),
    role_priorities: normalizeRolePriorities(current.role_priorities ?? current.rolePriorities)
  };
}

export function getQueueSettings() {
  return normalizeQueueSettings({ ...DEFAULT_SETTINGS, ...(systemSettings.get(SETTINGS_KEY) || {}) });
}

export function persistQueueSettings(patch = {}, updatedBy = null) {
  const next = normalizeQueueSettings({ ...getQueueSettings(), ...(patch || {}) });
  systemSettings.set(SETTINGS_KEY, next, updatedBy || null);
  return next;
}

export function priorityForUser(userInfo = {}, settings = getQueueSettings()) {
  const role = userInfo?.role || 'user';
  return Number(settings.role_priorities?.[role]) || 0;
}
