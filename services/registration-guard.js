// 注册防护：UI 可配置注册入口、一次性/多次邀请码、IP 频率限制、邮箱域策略和蜜罐字段。

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { registrationInvites, systemSettings } from './db.js';
import { hit as rateLimitHit } from './rate-limit.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_SETTINGS_KEY = 'registration.settings';
const DEFAULT_INVITE_USES = 1;
const MAX_DEFAULT_INVITE_USES = 100_000;
const MAX_INVITE_BATCH_SIZE = 500;

export class RegistrationRejectedError extends Error {
  constructor(message, { status = 400, code = 'registration_rejected', retryAfterMs = 0 } = {}) {
    super(message);
    this.name = 'RegistrationRejectedError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const text = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'none', 'null', 'disabled'].includes(text)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function envList(name) {
  return String(process.env[name] || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRegistrationMode() {
  const mode = String(process.env.REGISTRATION_MODE || 'closed').trim().toLowerCase();
  if (mode === 'closed' || mode === 'invite' || mode === 'open') return mode;
  return 'closed';
}

function legacyInviteCodes() {
  return [
    ...envList('REGISTRATION_INVITE_CODE'),
    ...envList('REGISTRATION_INVITE_CODES')
  ];
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function emailDomain(email) {
  const text = String(email || '').trim().toLowerCase();
  const idx = text.lastIndexOf('@');
  if (idx < 0) return '';
  return text.slice(idx + 1);
}

function asBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'on', 'enabled'].includes(text)) return true;
  if (['false', 'no', 'off', 'disabled'].includes(text)) return false;
  return fallback;
}

function clampPositiveInt(value, fallback = 1, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

function envRegistrationSettings() {
  const mode = getRegistrationMode();
  const codes = legacyInviteCodes();
  return {
    source: 'env',
    mode,
    allowPublicRegistration: mode === 'open',
    allowInviteRegistration: mode === 'invite' || codes.length > 0,
    // 保持旧行为：只要环境变量配置了邀请码，公开注册也会变成“邀请码必填”。
    inviteRequired: mode === 'invite' || codes.length > 0,
    inviteConfigured: codes.length > 0,
    defaultInviteUses: DEFAULT_INVITE_USES,
    legacyInviteCodes: codes
  };
}

function readStoredSettings() {
  const value = systemSettings.get(REGISTRATION_SETTINGS_KEY);
  if (!value || typeof value !== 'object') return null;
  return value;
}

function normalizeStoredSettings(value = {}) {
  const allowPublicRegistration = asBoolean(
    value.allowPublicRegistration ?? value.allowNewUsers ?? value.allowRegistration,
    false
  );
  const allowInviteRegistration = asBoolean(value.allowInviteRegistration, false);
  let mode = 'closed';
  if (allowPublicRegistration) mode = 'open';
  else if (allowInviteRegistration) mode = 'invite';
  return {
    source: 'db',
    mode,
    allowPublicRegistration,
    allowInviteRegistration,
    inviteRequired: !allowPublicRegistration && allowInviteRegistration,
    defaultInviteUses: clampPositiveInt(
      value.defaultInviteUses,
      DEFAULT_INVITE_USES,
      { max: MAX_DEFAULT_INVITE_USES }
    )
  };
}

function runtimeSettings() {
  const stored = readStoredSettings();
  if (!stored) return envRegistrationSettings();
  return normalizeStoredSettings(stored);
}

function dbInviteCount(settings) {
  if (settings.source !== 'db') return 0;
  return registrationInvites.activeCount();
}

function settingsWithRuntimeFacts(settings) {
  const activeDbInvites = dbInviteCount(settings);
  const legacyCodes = settings.source === 'env' ? settings.legacyInviteCodes : [];
  const inviteConfigured = settings.allowInviteRegistration &&
    (activeDbInvites > 0 || legacyCodes.length > 0);
  return {
    ...settings,
    inviteConfigured,
    activeInviteCount: activeDbInvites,
    legacyInviteConfigured: legacyCodes.length > 0,
    ipMaxPer10Min: envInt('REGISTRATION_IP_MAX_PER_10MIN', 3),
    ipMaxPerDay: envInt('REGISTRATION_IP_MAX_PER_DAY', 5),
    emailDomainAllowlist: envList('REGISTRATION_EMAIL_DOMAIN_ALLOWLIST'),
    emailDomainBlocklist: envList('REGISTRATION_EMAIL_DOMAIN_BLOCKLIST')
  };
}

function suppliedInviteCode(body = {}) {
  return String(body.registrationCode || body.inviteCode || body.invite_code || '').trim();
}

function assertLegacyInvite(code) {
  const ok = legacyInviteCodes().some((item) => safeEqualText(code, item));
  if (!ok) {
    throw new RegistrationRejectedError('invalid registration invite code', {
      status: 403,
      code: 'invalid_registration_invite_code'
    });
  }
  return { inviteAccepted: true, inviteSource: 'env', inviteCode: code };
}

function assertDbInvite(code, settings) {
  const invite = registrationInvites.findUsable(code);
  if (!invite) {
    throw new RegistrationRejectedError('invalid registration invite code', {
      status: 403,
      code: 'invalid_registration_invite_code'
    });
  }
  return { inviteAccepted: true, inviteSource: 'db', inviteCode: invite.code };
}

function assertInviteCode(code, settings) {
  if (settings.source === 'env') return assertLegacyInvite(code);
  return assertDbInvite(code, settings);
}

function randomInviteCode() {
  // 160-bit token；分段便于人工复制，同时避免相似字符。
  return randomBytes(20).toString('base64url').replace(/[_-]/g, '').slice(0, 24).toUpperCase()
    .replace(/(.{6})(?=.)/g, '$1-');
}

export function registrationSettingsSnapshot() {
  const settings = settingsWithRuntimeFacts(runtimeSettings());
  const { legacyInviteCodes: _legacyInviteCodes, ...safe } = settings;
  return safe;
}

export function adminRegistrationSnapshot() {
  const settings = registrationSettingsSnapshot();
  return {
    settings,
    invites: settings.source === 'db' ? registrationInvites.list() : [],
    limits: {
      maxInviteBatchSize: MAX_INVITE_BATCH_SIZE,
      maxDefaultInviteUses: MAX_DEFAULT_INVITE_USES
    }
  };
}

export function setRegistrationSettings(patch = {}, updatedBy = null) {
  const current = normalizeStoredSettings(readStoredSettings() || runtimeSettings());
  const next = normalizeStoredSettings({
    ...current,
    ...patch,
    allowPublicRegistration: patch.allowPublicRegistration ?? patch.allowNewUsers ??
      patch.allowRegistration ?? current.allowPublicRegistration,
    allowInviteRegistration: patch.allowInviteRegistration ?? current.allowInviteRegistration,
    defaultInviteUses: patch.defaultInviteUses ?? current.defaultInviteUses
  });
  systemSettings.set(REGISTRATION_SETTINGS_KEY, {
    allowPublicRegistration: next.allowPublicRegistration,
    allowInviteRegistration: next.allowInviteRegistration,
    defaultInviteUses: next.defaultInviteUses
  }, updatedBy);
  return registrationSettingsSnapshot();
}

export function generateRegistrationInviteCodes({ count = 1, maxUses = null, createdBy = null } = {}) {
  let settings = registrationSettingsSnapshot();
  if (settings.source !== 'db') {
    settings = setRegistrationSettings({
      allowPublicRegistration: settings.allowPublicRegistration,
      allowInviteRegistration: settings.allowInviteRegistration,
      defaultInviteUses: settings.defaultInviteUses || DEFAULT_INVITE_USES
    }, createdBy);
  }
  const safeCount = clampPositiveInt(count, 1, { max: MAX_INVITE_BATCH_SIZE });
  const safeMaxUses = clampPositiveInt(
    maxUses,
    settings.defaultInviteUses || DEFAULT_INVITE_USES,
    { max: MAX_DEFAULT_INVITE_USES }
  );
  const items = [];
  const seen = new Set();
  while (items.length < safeCount) {
    const code = randomInviteCode();
    if (seen.has(code) || registrationInvites.findUsable(code)) continue;
    seen.add(code);
    items.push({ code, maxUses: safeMaxUses });
  }
  return registrationInvites.createMany(items, { createdBy });
}

export function resetRegistrationInviteCodes() {
  return registrationInvites.reset();
}

export function consumeRegistrationInviteCode(code) {
  return registrationInvites.consume(code);
}

export function checkRegistrationRateLimit({ ip }) {
  const safeIp = ip || 'unknown';
  const checks = [
    {
      name: '10min',
      max: envInt('REGISTRATION_IP_MAX_PER_10MIN', 3),
      windowMs: envInt('REGISTRATION_IP_WINDOW_MS', TEN_MINUTES_MS)
    },
    {
      name: 'day',
      max: envInt('REGISTRATION_IP_MAX_PER_DAY', 5),
      windowMs: envInt('REGISTRATION_IP_DAY_WINDOW_MS', ONE_DAY_MS)
    }
  ];

  for (const check of checks) {
    if (!check.max || !check.windowMs) continue;
    const result = rateLimitHit(`register:${check.name}:${safeIp}`, check.max, check.windowMs);
    if (!result.allowed) {
      return {
        ok: false,
        code: 'registration_rate_limited',
        message: 'registration rate limited',
        retryAfterMs: result.retryAfterMs
      };
    }
  }
  return { ok: true };
}

export function assertRegistrationAllowed({ body = {}, isAdminBootstrap = false } = {}) {
  const settings = registrationSettingsSnapshot();

  // 蜜罐字段：真实页面不会填写，注册机器人常会批量填充所有 input。
  const honeypot = String(body.website || body.company || body.url || '').trim();
  if (honeypot) {
    throw new RegistrationRejectedError('registration rejected', {
      status: 400,
      code: 'registration_honeypot'
    });
  }

  const supplied = suppliedInviteCode(body);
  let invitePolicy = {};

  // 初始管理员注册（空库首个账号，或兼容旧令牌方式）允许穿过注册开关。
  if (!isAdminBootstrap) {
    if (supplied) {
      if (!settings.allowInviteRegistration) {
        throw new RegistrationRejectedError('registration invite is disabled', {
          status: 403,
          code: 'registration_invite_disabled'
        });
      }
      invitePolicy = assertInviteCode(supplied, settings);
    } else if (settings.inviteRequired) {
      if (!settings.inviteConfigured) {
        throw new RegistrationRejectedError('registration invite code is not configured', {
          status: 403,
          code: 'registration_invite_not_configured'
        });
      }
      throw new RegistrationRejectedError('invalid registration invite code', {
        status: 403,
        code: 'invalid_registration_invite_code'
      });
    } else if (!settings.allowPublicRegistration) {
      throw new RegistrationRejectedError('registration closed', {
        status: 403,
        code: 'registration_closed'
      });
    }
  }

  const domain = emailDomain(body.email);
  if (domain) {
    const allowlist = settings.emailDomainAllowlist.map((item) => item.toLowerCase());
    const blocklist = settings.emailDomainBlocklist.map((item) => item.toLowerCase());
    if (allowlist.length > 0 && !allowlist.includes(domain)) {
      throw new RegistrationRejectedError('email domain not allowed', {
        status: 400,
        code: 'email_domain_not_allowed'
      });
    }
    if (blocklist.includes(domain)) {
      throw new RegistrationRejectedError('email domain not allowed', {
        status: 400,
        code: 'email_domain_not_allowed'
      });
    }
  }

  return { ...settings, ...invitePolicy };
}
