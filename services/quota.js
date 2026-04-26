// 额度服务：默认配额、用户覆盖、生成入口拦截、用量记录与汇总。
// TAG: hmt---

import { userQuotas, usageDaily, systemSettings, images as imagesTable } from './db.js';

const DEFAULT_KEY = 'quota.defaults';

// 系统默认值（用户未覆盖时生效）。null = 不限。
export const FALLBACK_DEFAULTS = Object.freeze({
  daily_limit: 10,
  monthly_limit: null,
  storage_limit_mb: null,
  concurrent_limit: 3
});

const activeGenerations = new Map();

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(day) {
  return `${day.slice(0, 7)}-01`;
}

function monthEnd(day) {
  // 简单做法：取下个月 1 号减一天。SQLite 可以直接比对字符串。
  const [y, m] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(next.getTime() - 24 * 60 * 60 * 1000);
  return lastDay.toISOString().slice(0, 10);
}

// 读取系统默认（覆盖 FALLBACK_DEFAULTS 中提供过的字段）。
export function getDefaults() {
  const stored = systemSettings.get(DEFAULT_KEY) || {};
  return { ...FALLBACK_DEFAULTS, ...stored };
}

export function setDefaults(patch, updatedBy) {
  const merged = { ...getDefaults(), ...patch };
  systemSettings.set(DEFAULT_KEY, merged, updatedBy);
  return merged;
}

// 用户的实际生效配额：优先用 user_quotas 中非 null 的值，否则回落到默认。
export function effectiveQuota(userId) {
  const defaults = getDefaults();
  const row = userQuotas.get(userId);
  return {
    daily_limit: pickValue(row?.daily_limit, defaults.daily_limit),
    monthly_limit: pickValue(row?.monthly_limit, defaults.monthly_limit),
    storage_limit_mb: pickValue(row?.storage_limit_mb, defaults.storage_limit_mb),
    concurrent_limit: pickValue(row?.concurrent_limit, defaults.concurrent_limit),
    overridden: !!row,
    raw: row || null,
    defaults
  };
}

function pickValue(override, fallback) {
  if (override === undefined || override === null || override === '') return fallback ?? null;
  const n = Number(override);
  return Number.isFinite(n) ? n : (fallback ?? null);
}

// 当前用量快照
export function usageSnapshot(userId) {
  const today = todayUtc();
  const todayRow = usageDaily.get(userId, today) || { call_count: 0, image_count: 0, bytes: 0, fail_count: 0 };
  const month = usageDaily.sum(userId, monthStart(today), monthEnd(today));
  // storage 用 images 表的累计，简单可靠
  const storage = imagesTable.statsByUser(userId);
  return {
    today: {
      calls: Number(todayRow.call_count) || 0,
      images: Number(todayRow.image_count) || 0,
      bytes: Number(todayRow.bytes) || 0,
      fails: Number(todayRow.fail_count) || 0
    },
    month,
    storage: {
      images: Number(storage.count) || 0,
      bytes: Number(storage.bytes) || 0
    }
  };
}

// 综合配额 + 用量
export function summary(userId) {
  return {
    quota: effectiveQuota(userId),
    usage: usageSnapshot(userId)
  };
}

// 调用 generate 之前检查。返回 { ok, code, message } —— ok=false 时路由层抛 429。
export function assertCanGenerate(userId, { n = 1 } = {}) {
  if (!userId) return { ok: true };
  const { quota, usage } = summary(userId);
  const callsRequested = Math.max(1, Number(n) || 1);

  if (quota.daily_limit && usage.today.calls + callsRequested > quota.daily_limit) {
    return {
      ok: false,
      code: 'daily_limit_exceeded',
      message: `今日额度已用完（${usage.today.calls}/${quota.daily_limit}）`
    };
  }
  if (quota.monthly_limit && usage.month.calls + callsRequested > quota.monthly_limit) {
    return {
      ok: false,
      code: 'monthly_limit_exceeded',
      message: `本月额度已用完（${usage.month.calls}/${quota.monthly_limit}）`
    };
  }
  if (quota.storage_limit_mb) {
    const limitBytes = Number(quota.storage_limit_mb) * 1024 * 1024;
    if (usage.storage.bytes >= limitBytes) {
      return {
        ok: false,
        code: 'storage_limit_exceeded',
        message: `存储已达上限（${formatMb(usage.storage.bytes)} / ${quota.storage_limit_mb} MB）`
      };
    }
  }
  return { ok: true };
}

export function tryAcquireConcurrentSlot(userId) {
  if (!userId) return { ok: true, active: 0, limit: null, release: () => {} };

  const { concurrent_limit: limitValue } = effectiveQuota(userId);
  const limit = Number(limitValue);
  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      ok: true,
      active: activeGenerations.get(userId) || 0,
      limit: null,
      release: () => {}
    };
  }

  const active = activeGenerations.get(userId) || 0;
  if (active >= limit) {
    return {
      ok: false,
      code: 'concurrent_limit_exceeded',
      message: `并发生成数已达上限（${active}/${limit}）`,
      active,
      limit
    };
  }

  activeGenerations.set(userId, active + 1);
  let released = false;
  return {
    ok: true,
    active: active + 1,
    limit,
    release: () => {
      if (released) return;
      released = true;
      const current = activeGenerations.get(userId) || 0;
      if (current <= 1) activeGenerations.delete(userId);
      else activeGenerations.set(userId, current - 1);
    }
  };
}

function formatMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

// 记录一次成功调用
export function recordSuccess(userId, { calls = 1, images = 1, bytes = 0 } = {}) {
  if (!userId) return;
  usageDaily.bump(userId, todayUtc(), { calls, images, bytes });
}

export function recordFailure(userId, { calls = 1 } = {}) {
  if (!userId) return;
  usageDaily.bump(userId, todayUtc(), { calls, fails: 1 });
}

export function resetUsage(userId, scope = 'today') {
  const today = todayUtc();
  if (scope === 'today') {
    usageDaily.reset(userId, today, today);
  } else if (scope === 'month') {
    usageDaily.reset(userId, monthStart(today), monthEnd(today));
  }
}

export function patchUserQuota(userId, patch, updatedBy) {
  const allowed = ['daily_limit', 'monthly_limit', 'storage_limit_mb', 'concurrent_limit'];
  const clean = {};
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    const raw = patch[k];
    if (raw === null || raw === '' || raw === 'null') {
      clean[k] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`invalid ${k}`);
    clean[k] = Math.floor(n);
  }
  if (Object.keys(clean).length === 0) return userQuotas.get(userId);
  return userQuotas.upsert(userId, clean, updatedBy);
}
