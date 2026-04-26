// /api/auth/* 路由：注册 / 登录 / 退出 / 当前用户。
// TAG: hmt---

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { parseCookies, setSessionCookie, clearSessionCookie, COOKIE_KEY } from '../utils/cookies.js';
import { hit as rateLimitHit } from '../services/rate-limit.js';
import {
  register as authRegister,
  login as authLogin,
  createSession,
  destroySession
} from '../services/auth.js';
import { logger } from '../utils/logger.js';

// 取客户端 ip，优先尊重反向代理的 x-forwarded-for 首段
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function userAgent(req) {
  return req.headers['user-agent'] || '';
}

function rateLimit(res, key, max, windowMs) {
  const r = rateLimitHit(key, max, windowMs);
  if (r.allowed) return true;
  res.setHeader('retry-after', Math.ceil(r.retryAfterMs / 1000));
  sendJson(res, 429, { error: 'rate limited' });
  return false;
}

async function handleRegister(req, res) {
  const ip = clientIp(req);
  if (!rateLimit(res, `reg:${ip}`, 3, 600_000)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const { username, email, password, adminBootstrapToken } = body || {};
  try {
    const user = authRegister({ username, email, password, adminBootstrapToken });
    // 注册成功自动登录：创建一条 session，下发 cookie
    const sid = createSession({ userId: user.id, ua: userAgent(req), ip });
    setSessionCookie(res, sid);
    logger.info('auth.register', { userId: user.id, role: user.role });
    sendJson(res, 200, { user });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
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
  if (pathname === '/api/auth/me' && method === 'GET') {
    return handleMe(req, res);
  }
  sendJson(res, 404, { error: 'not found' });
}

export default handleAuthRoute;
