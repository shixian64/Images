// /api/gallery —— 列表 (按登录用户) + 单张删除（用户仅能删自己的，admin 任意）。

import {
  listGallery,
  removeImage,
  setImagePublic,
  likePublicImage
} from '../services/gallery-store.js';
import { sendJson, sendMethodNotAllowed, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { record as auditRecord } from '../services/audit.js';

export async function handleGallery(req, res, pathname) {
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  const user = req.session.user;
  const isAdmin = user.role === 'admin';

  // POST /api/gallery/:id/visibility —— 用户公开/取消公开自己的图片（admin 可操作任意）。
  const visibility = pathname && pathname.match(/^\/api\/gallery\/([^/]+)\/visibility\/?$/);
  if (visibility) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      let body = {};
      try { body = await readJsonBody(req); } catch (err) {
        return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
      }
      const id = decodeURIComponent(visibility[1]);
      const item = await setImagePublic(id, {
        userId: user.id,
        isAdmin,
        isPublic: body?.isPublic === true
      });
      auditRecord(req, item.isPublic ? 'image.publish' : 'image.unpublish', { type: 'image', id }, {
        userId: item.userId,
        path: item.path
      });
      return sendJson(res, 200, { ok: true, item });
    } catch (err) {
      const map = { 'image not found': 404, 'forbidden': 403, unauthorized: 401 };
      return sendJson(res, err.status || map[err.message] || 400, { error: err.message, code: err.code });
    }
  }

  // POST /api/gallery/:id/like —— 公开图库点赞；每用户每日限 10 次。
  const like = pathname && pathname.match(/^\/api\/gallery\/([^/]+)\/like\/?$/);
  if (like) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      const id = decodeURIComponent(like[1]);
      const result = await likePublicImage(id, { userId: user.id });
      auditRecord(req, 'image.like', { type: 'image', id }, {
        likeCount: result.likeCount,
        alreadyLiked: result.alreadyLiked
      });
      return sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const map = {
        'image not found': 404,
        'image not public': 403,
        unauthorized: 401,
        'daily like limit exceeded': 429
      };
      return sendJson(res, err.status || map[err.message] || 400, { error: err.message, code: err.code });
    }
  }

  // DELETE /api/gallery/:id
  const del = pathname && pathname.match(/^\/api\/gallery\/([^/]+)\/?$/);
  if (del) {
    if (req.method !== 'DELETE') return sendMethodNotAllowed(res, ['DELETE']);
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
    return sendMethodNotAllowed(res, ['GET']);
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'mine';
    const data = await listGallery({
      userId: user.id,
      isAdmin,
      limit,
      scope
    });
    return sendJson(res, 200, data);
  } catch (error) {
    logger.error('gallery.list.failed', { error: error.message || String(error) });
    return sendJson(res, 500, { error: error.message || String(error) });
  }
}
