// GET /api/gallery —— 读取本地 generated/gallery.json，并返回仍存在于磁盘上的图片。

import { listGallery } from '../services/gallery-store.js';
import { sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';

export async function handleGallery(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const data = await listGallery({ limit });
    return sendJson(res, 200, data);
  } catch (error) {
    logger.error('gallery.list.failed', { error: error.message || String(error) });
    return sendJson(res, 500, { error: error.message || String(error) });
  }
}
