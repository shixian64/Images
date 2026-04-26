// 注册防刷：邀请码/关闭注册、IP 频率限制、邮箱域策略和蜜罐字段。

import { timingSafeEqual } from 'node:crypto';
import { hit as rateLimitHit } from './rate-limit.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  const mode = String(process.env.REGISTRATION_MODE || 'open').trim().toLowerCase();
  if (mode === 'closed' || mode === 'invite' || mode === 'open') return mode;
  return 'open';
}

function inviteCodes() {
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

export function registrationSettingsSnapshot() {
  const mode = getRegistrationMode();
  const codes = inviteCodes();
  return {
    mode,
    inviteRequired: mode === 'invite' || codes.length > 0,
    inviteConfigured: codes.length > 0,
    ipMaxPer10Min: envInt('REGISTRATION_IP_MAX_PER_10MIN', 3),
    ipMaxPerDay: envInt('REGISTRATION_IP_MAX_PER_DAY', 5),
    emailDomainAllowlist: envList('REGISTRATION_EMAIL_DOMAIN_ALLOWLIST'),
    emailDomainBlocklist: envList('REGISTRATION_EMAIL_DOMAIN_BLOCKLIST')
  };
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

  // 蜜罐字段：真实页面不会填写，注册机常会批量填充所有 input。
  const honeypot = String(body.website || body.company || body.url || '').trim();
  if (honeypot) {
    throw new RegistrationRejectedError('registration rejected', {
      status: 400,
      code: 'registration_honeypot'
    });
  }

  // 管理员初始化令牌验证通过时允许穿过注册开关，避免新部署时把首个 admin 锁死。
  if (!isAdminBootstrap) {
    if (settings.mode === 'closed') {
      throw new RegistrationRejectedError('registration closed', {
        status: 403,
        code: 'registration_closed'
      });
    }

    if (settings.inviteRequired) {
      if (!settings.inviteConfigured) {
        throw new RegistrationRejectedError('registration invite code is not configured', {
          status: 403,
          code: 'registration_invite_not_configured'
        });
      }
      const supplied = body.registrationCode || body.inviteCode || body.invite_code;
      const ok = inviteCodes().some((code) => safeEqualText(supplied, code));
      if (!ok) {
        throw new RegistrationRejectedError('invalid registration invite code', {
          status: 403,
          code: 'invalid_registration_invite_code'
        });
      }
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

  return settings;
}
