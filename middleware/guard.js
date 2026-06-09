// 鉴权/鉴权等级/CSRF 三个守卫。每个守卫都返回 bool，便于路由层链式短路。
// TAG: hmt---

import { timingSafeEqual } from 'node:crypto';

import { sendJson } from '../utils/http.js';
import { shouldTrustForwardedHeaders } from '../utils/request.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireAuth(req, res) {
  if (req.session?.user) return true;
  sendJson(res, 401, { error: 'unauthorized' });
  return false;
}

export function requireAdmin(req, res) {
  if (!requireAuth(req, res)) return false;
  if (req.session.user.role === 'admin') return true;
  sendJson(res, 403, { error: 'forbidden' });
  return false;
}

function passwordResetRequired(user = {}) {
  return Boolean(user.passwordResetRequired || user.password_reset_required);
}

function isPasswordResetAllowed(req, pathname) {
  if (pathname === '/api/profile/password') return true;
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/api/profile' || pathname === '/api/profile/')) {
    return true;
  }
  if (pathname === '/api/auth/me' || pathname === '/api/auth/logout') return true;
  return false;
}

export function requireFreshPassword(req, res, pathname = '') {
  if (!passwordResetRequired(req.session?.user)) return true;
  if (isPasswordResetAllowed(req, pathname)) return true;
  sendJson(res, 403, {
    error: 'password reset required',
    code: 'password_reset_required'
  });
  return false;
}

// Compare the full origin (scheme + host) for CSRF checks.
function firstHeader(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function firstHeaderToken(value) {
  return String(firstHeader(value) || '').split(',')[0]?.trim() || '';
}

function forwardedProto(value) {
  const first = String(firstHeader(value) || '').split(',')[0] || '';
  const match = first.match(/(?:^|;)\s*proto=(?:"?)(https?)(?:"?)(?:;|$)/i);
  return match?.[1]?.toLowerCase() || '';
}

function normalizedProtocol(value) {
  const protocol = String(value || '').trim().replace(/:$/, '').toLowerCase();
  return protocol === 'http' || protocol === 'https' ? protocol : '';
}

function requestProtocol(req) {
  if (shouldTrustForwardedHeaders(req)) {
    const headers = req?.headers || {};
    const proxyProtocol = normalizedProtocol(firstHeaderToken(headers['x-forwarded-proto']))
      || normalizedProtocol(forwardedProto(headers.forwarded));
    if (proxyProtocol) return proxyProtocol;
  }
  return req?.socket?.encrypted ? 'https' : 'http';
}

function originOf(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const protocol = normalizedProtocol(parsed.protocol);
    if (!protocol || !parsed.host) return null;
    return `${protocol}://${parsed.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

function selfOrigin(req) {
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  if (!host) return null;
  return `${requestProtocol(req)}://${host}`;
}

function csrfHeader(req) {
  return String(req?.headers?.['x-csrf-token'] || '').trim();
}

function csrfTokenMatches(expected, actual) {
  const left = String(expected || '').trim();
  const right = String(actual || '').trim();
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requiresSessionCsrfToken(req, pathname = '') {
  if (!req.session?.user) return false;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/register') return false;
  return true;
}

export function requireCsrf(req, res, pathname = '') {
  if (SAFE_METHODS.has(req.method)) return true;
  // 要求调用方显式声明是 fetch 发起，挡住 <form> / <img> 这类原生请求
  if (req.headers['x-requested-with'] !== 'fetch') {
    sendJson(res, 403, { error: 'csrf' });
    return false;
  }
  const expectedOrigin = selfOrigin(req);
  const requestOrigin = originOf(req.headers.origin) || originOf(req.headers.referer);
  if (!expectedOrigin || !requestOrigin || requestOrigin !== expectedOrigin) {
    sendJson(res, 403, { error: 'csrf' });
    return false;
  }
  if (requiresSessionCsrfToken(req, pathname) && !csrfTokenMatches(req.session.csrfToken, csrfHeader(req))) {
    sendJson(res, 403, { error: 'csrf', code: 'csrf_token_invalid' });
    return false;
  }
  return true;
}
