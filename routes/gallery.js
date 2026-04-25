// GET /api/gallery —— 按登录用户返回图库（admin 可看全量），读 SQLite images 表。

import { listGallery } from '../services/gallery-store.js';
import { sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';

export async function handleGallery(req, res) {
  // 防御性鉴权
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const user = req.session.user;
    const data = await listGallery({
      userId: user.id,
      isAdmin: user.role === 'admin',
      limit
    });
    return sendJson(res, 200, data);
  } catch (error) {
    logger.error('gallery.list.failed', { error: error.message || String(error) });
    return sendJson(res, 500, { error: error.message || String(error) });
  }
}
