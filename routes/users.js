// /api/users* 路由：仅 admin 可用。
// TAG: hmt---

import { sendJson, readJsonBody } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import { listUsers, patchUser } from '../services/users.js';

export async function handleUsersRoute(req, res, pathname, _urlObj) {
  if (!requireAdmin(req, res)) return;

  const method = req.method;

  if (pathname === '/api/users' || pathname === '/api/users/') {
    if (method === 'GET') {
      sendJson(res, 200, { items: listUsers() });
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  // /api/users/:id
  const m = pathname.match(/^\/api\/users\/([^/]+)\/?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PATCH') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: 'invalid json' });
        return;
      }
      const { role, status } = body || {};
      try {
        const user = patchUser(req.session.user.id, id, { role, status });
        sendJson(res, 200, { user });
      } catch (err) {
        const msg = err.message;
        // 根据错误类型映射状态码
        let status = 400;
        if (msg === 'user not found') status = 404;
        else if (msg === 'self-modify forbidden') status = 403;
        else if (msg === 'cannot remove last active admin') status = 409;
        sendJson(res, status, { error: msg });
      }
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleUsersRoute;
