// 会话挂载中间件：从 cookie 取 sid，查 session 后挂到 req.session。
// 任何错误都不抛，保证 public 路由不被阻塞。
// TAG: hmt---

import { parseCookies, setSessionCookie, COOKIE_KEY } from '../utils/cookies.js';
import { getSessionUser } from '../services/auth.js';
import { logger } from '../utils/logger.js';

export default function attachSession(req, res) {
  req.session = null;
  try {
    const cookies = parseCookies(req);
    const sid = cookies[COOKIE_KEY];
    if (!sid) return;
    const result = getSessionUser(sid);
    if (!result) return;
    req.session = { user: result.user, sessionId: sid };
    if (result.renewed && res) {
      setSessionCookie(res, sid);
    }
  } catch (err) {
    // session 异常不应影响 public 路由，仅记录
    logger.warn('session.attach_failed', { error: err.message });
    req.session = null;
  }
}

export { attachSession };
