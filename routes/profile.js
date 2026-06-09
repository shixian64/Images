// /api/profile* 路由：当前用户的资料与密码维护。
// TAG: hmt---

import { sendJson, sendMethodNotAllowed, sendNoContent, readJsonBody, bodyErrorStatus, routeErrorStatus } from '../utils/http.js';
import { users, sessions } from '../services/db.js';
import { updateProfile, changePassword } from '../services/users.js';
import { createSession, sanitizeUser } from '../services/auth.js';
import { setSessionCookie } from '../utils/cookies.js';
import { logger } from '../utils/logger.js';
import { clientIp } from '../utils/request.js';

function handleGet(req, res) {
  // 保险起见以 id 再查一次，避免 session 里的快照过期
  const fresh = users.findById(req.session.user.id);
  if (!fresh) {
    sendJson(res, 404, { error: 'user not found' });
    return;
  }
  sendJson(res, 200, { user: sanitizeUser(fresh) });
}

async function handlePatch(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const { username, email, avatarUrl } = body || {};
  try {
    const user = updateProfile(req.session.user.id, { username, email, avatarUrl });
    sendJson(res, 200, { user });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handlePassword(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const { oldPassword, newPassword } = body || {};
  const userId = req.session.user.id;
  try {
    changePassword(userId, oldPassword, newPassword);
  } catch (err) {
    sendJson(res, routeErrorStatus(err, { 'invalid credentials': 401 }), { error: err.message });
    return;
  }
  // 改密后吊销该用户所有 session（含其他设备），为当前请求重建一条
  sessions.destroyByUser(userId);
  const { sessionId } = createSession({
    userId,
    ua: req.headers['user-agent'] || '',
    ip: clientIp(req)
  });
  setSessionCookie(res, sessionId);
  logger.info('profile.password_changed', { userId });
  sendNoContent(res);
}

export async function handleProfileRoute(req, res, pathname) {
  const method = req.method;
  if (pathname === '/api/profile' || pathname === '/api/profile/') {
    if (method === 'GET') return handleGet(req, res);
    if (method === 'PATCH') return handlePatch(req, res);
    sendMethodNotAllowed(res, ['GET', 'PATCH']);
    return;
  }
  if (pathname === '/api/profile/password') {
    if (method === 'POST') return handlePassword(req, res);
    sendMethodNotAllowed(res, ['POST']);
    return;
  }
  sendJson(res, 404, { error: 'not found' });
}

export default handleProfileRoute;
