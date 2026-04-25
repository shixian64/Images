// /api/gallery —— 列表 (按登录用户) + 单张删除（用户仅能删自己的，admin 任意）。

import { listGallery, removeImage } from '../services/gallery-store.js';
import { sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { record as auditRecord } from '../services/audit.js';

export async function handleGallery(req, res, pathname) {
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  const user = req.session.user;
  const isAdmin = user.role === 'admin';

  // DELETE /api/gallery/:id
  const del = pathname && pathname.match(/^\/api\/gallery\/([^/]+)\/?$/);
  if (del && req.method === 'DELETE') {
    const id = decodeURIComponent(del[1]);
    try {
      const removed = await removeImage(id, { userId: user.id, isAdmin });
      auditRecord(req, 'image.delete', { type: 'image', id }, {
        path: removed.path,
        userId: removed.userId,
        bytes: removed.bytes
      });
      return sendJson(res, 200, { ok: true, removed });
    } catch (err) {
      const map = { 'image not found': 404, 'forbidden': 403 };
      return sendJson(res, map[err.message] || 400, { error: err.message });
    }
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const data = await listGallery({
      userId: user.id,
      isAdmin,
      limit
    });
    return sendJson(res, 200, data);
  } catch (error) {
    logger.error('gallery.list.failed', { error: error.message || String(error) });
    return sendJson(res, 500, { error: error.message || String(error) });
  }
}
