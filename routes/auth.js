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
  isValidAdminBootstrapToken
} from '../services/auth.js';
import {
  assertRegistrationAllowed,
  checkRegistrationRateLimit,
  registrationSettingsSnapshot,
  RegistrationRejectedError
} from '../services/registration-guard.js';
import { logger } from '../utils/logger.js';
import { clientIp, userAgent } from '../utils/request.js';

function rateLimit(res, key, max, windowMs) {
  const r = rateLimitHit(key, max, windowMs);
  if (r.allowed) return true;
  res.setHeader('retry-after', Math.ceil(r.retryAfterMs / 1000));
  sendJson(res, 429, { error: 'rate limited' });
  return false;
}

async function handleRegister(req, res) {
  const ip = clientIp(req);
  const limit = checkRegistrationRateLimit({ ip });
  if (!limit.ok) {
    res.setHeader('retry-after', Math.ceil(limit.retryAfterMs / 1000));
    sendJson(res, 429, { error: limit.message, code: limit.code });
    return;
  }

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
    if (adminBootstrapToken && !adminBootstrapOk) {
      throw new Error('invalid admin bootstrap token');
    }
    const registrationPolicy = assertRegistrationAllowed({ body, isAdminBootstrap: adminBootstrapOk });
    const user = authRegister({
      username,
      email,
      password,
      adminBootstrapToken,
      signupIp: ip,
      signupUserAgent: userAgent(req)
    });
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
  // 限流 key 同时按 ip 与 login，阻止单账号被爆破
  if (!rateLimit(res, `login:${ip}:${login || ''}`, 5, 60_000)) return;
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
      inviteConfigured: settings.inviteConfigured
    });
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    return handleMe(req, res);
  }
  sendJson(res, 404, { error: 'not found' });
}

export default handleAuthRoute;
