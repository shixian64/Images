// /api/auth/* 路由：注册 / 登录 / 退出 / 当前用户。
// TAG: hmt---

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { parseCookies, setSessionCookie, clearSessionCookie, COOKIE_KEY } from '../utils/cookies.js';
import { hit as rateLimitHit } from '../services/rate-limit.js';
import {
  register as authRegister,
  login as authLogin,
  createSession,
  destroySession,
  canInitializeAdminRegistration,
  isValidAdminBootstrapToken
} from '../services/auth.js';
import {
  assertRegistrationAllowed,
  checkRegistrationRateLimit,
  consumeRegistrationInviteCode,
  registrationSettingsSnapshot,
  RegistrationRejectedError
} from '../services/registration-guard.js';
import { logger } from '../utils/logger.js';
import { clientIp, userAgent } from '../utils/request.js';

const LOGIN_RATE_WINDOW_MS = 60_000;
const ADMIN_BOOTSTRAP_RATE_WINDOW_MS = 10 * 60_000;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function rateLimit(res, key, max, windowMs, { message = 'rate limited', code = null } = {}) {
  const r = rateLimitHit(key, max, windowMs);
  if (r.allowed) return true;
  res.setHeader('retry-after', Math.ceil(r.retryAfterMs / 1000));
  const payload = { error: message };
  if (code) payload.code = code;
  sendJson(res, 429, payload);
  return false;
}

function normalizeLoginForRateLimit(login) {
  return String(login || '').trim().toLowerCase().slice(0, 160);
}

function checkLoginRateLimit(res, ip, login) {
  const safeIp = ip || 'unknown';
  const normalizedLogin = normalizeLoginForRateLimit(login);
  const ipMax = envInt('LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE', 20);
  const pairMax = envInt('LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE', 5);
  const accountMax = envInt('LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE', 8);

  if (!rateLimit(res, `login:ip:${safeIp}`, ipMax, LOGIN_RATE_WINDOW_MS, {
    message: 'login rate limited',
    code: 'login_ip_rate_limited'
  })) return false;

  if (normalizedLogin && !rateLimit(res, `login:account:${normalizedLogin}`, accountMax, LOGIN_RATE_WINDOW_MS, {
    message: 'login rate limited',
    code: 'login_account_rate_limited'
  })) return false;

  if (!rateLimit(res, `login:pair:${safeIp}:${normalizedLogin || 'empty'}`, pairMax, LOGIN_RATE_WINDOW_MS, {
    message: 'login rate limited',
    code: 'login_pair_rate_limited'
  })) return false;

  return true;
}

function checkAdminBootstrapRateLimit(res, ip) {
  const safeIp = ip || 'unknown';
  const fallbackMax = envInt('REGISTRATION_IP_MAX_PER_10MIN', 3);
  const max = envInt('ADMIN_BOOTSTRAP_IP_MAX_PER_10MIN', fallbackMax);
  const windowMs = envInt('ADMIN_BOOTSTRAP_IP_WINDOW_MS', ADMIN_BOOTSTRAP_RATE_WINDOW_MS);
  return rateLimit(res, `admin-bootstrap:ip:${safeIp}`, max, windowMs, {
    message: 'admin bootstrap rate limited',
    code: 'admin_bootstrap_rate_limited'
  });
}

async function handleRegister(req, res) {
  const ip = clientIp(req);
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const { username, email, password, adminBootstrapToken } = body || {};
  try {
    const adminBootstrapOk = isValidAdminBootstrapToken(adminBootstrapToken);
    if (adminBootstrapToken && !checkAdminBootstrapRateLimit(res, ip)) {
      return;
    }
    if (adminBootstrapToken && !adminBootstrapOk) {
      throw new Error('invalid admin bootstrap token');
    }
    const canInitializeAdmin = canInitializeAdminRegistration({ adminBootstrapToken });
    const registrationPolicy = assertRegistrationAllowed({ body, isAdminBootstrap: canInitializeAdmin });
    if (!canInitializeAdmin) {
      const limit = checkRegistrationRateLimit({ ip });
      if (!limit.ok) {
        res.setHeader('retry-after', Math.ceil(limit.retryAfterMs / 1000));
        sendJson(res, 429, { error: limit.message, code: limit.code });
        return;
      }
    }
    const user = authRegister({
      username,
      email,
      password,
      adminBootstrapToken,
      signupIp: ip,
      signupUserAgent: userAgent(req)
    });
    if (!canInitializeAdmin && registrationPolicy.inviteAccepted && registrationPolicy.inviteSource === 'db') {
      const consumed = consumeRegistrationInviteCode(registrationPolicy.inviteCode, { userId: user.id });
      if (!consumed) {
        throw new RegistrationRejectedError('invalid registration invite code', {
          status: 403,
          code: 'invalid_registration_invite_code'
        });
      }
    }
    // 注册成功自动登录：创建一条 session，下发 cookie
    const sid = createSession({ userId: user.id, ua: userAgent(req), ip });
    setSessionCookie(res, sid);
    logger.info('auth.register', {
      userId: user.id,
      role: user.role,
      ip,
      inviteRequired: registrationPolicy.inviteRequired
    });
    sendJson(res, 200, { user });
  } catch (err) {
    const status = err instanceof RegistrationRejectedError ? err.status : 400;
    const payload = { error: err.message };
    if (err.code) payload.code = err.code;
    sendJson(res, status, payload);
  }
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const { login, password } = body || {};
  // 同时按 IP、账号和 IP+账号限流，避免攻击者变换 login 绕过单一组合 key。
  if (!checkLoginRateLimit(res, ip, login)) return;
  try {
    const { user, sessionId } = authLogin({
      login,
      password,
      ua: userAgent(req),
      ip
    });
    setSessionCookie(res, sessionId);
    logger.info('auth.login', { userId: user.id });
    sendJson(res, 200, { user });
  } catch (err) {
    // 登录类错误统一 401 并使用固定文案，避免账号枚举
    const msg = err.message === 'invalid credentials' ? 'invalid credentials' : 'invalid credentials';
    sendJson(res, 401, { error: msg });
  }
}

function handleLogout(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_KEY];
  if (sid) destroySession(sid);
  clearSessionCookie(res);
  res.writeHead(204);
  res.end();
}

function handleMe(req, res) {
  if (!req.session?.user) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  sendJson(res, 200, { user: req.session.user });
}

export async function handleAuthRoute(req, res, pathname) {
  const method = req.method;

  if (pathname === '/api/auth/register' && method === 'POST') {
    return handleRegister(req, res);
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    return handleLogin(req, res);
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return handleLogout(req, res);
  }
  if (pathname === '/api/auth/registration-policy' && method === 'GET') {
    const settings = registrationSettingsSnapshot();
    return sendJson(res, 200, {
      mode: settings.mode,
      inviteRequired: settings.inviteRequired,
      inviteConfigured: settings.inviteConfigured,
      allowPublicRegistration: settings.allowPublicRegistration,
      allowInviteRegistration: settings.allowInviteRegistration
    });
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    return handleMe(req, res);
  }
  sendJson(res, 404, { error: 'not found' });
}

export default handleAuthRoute;
