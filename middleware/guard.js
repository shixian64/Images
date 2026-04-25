// 鉴权/鉴权等级/CSRF 三个守卫。每个守卫都返回 bool，便于路由层链式短路。
// TAG: hmt---

import { sendJson } from '../utils/http.js';

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

// 取 URL 的 host 部分（含端口），失败返 null
function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function requireCsrf(req, res) {
  if (SAFE_METHODS.has(req.method)) return true;
  // 要求调用方显式声明是 fetch 发起，挡住 <form> / <img> 这类原生请求
  if (req.headers['x-requested-with'] !== 'fetch') {
    sendJson(res, 403, { error: 'csrf' });
    return false;
  }
  const selfHost = req.headers.host;
  const originHost = hostOf(req.headers.origin) || hostOf(req.headers.referer);
  if (!selfHost || !originHost || originHost !== selfHost) {
    sendJson(res, 403, { error: 'csrf' });
    return false;
  }
  return true;
}
