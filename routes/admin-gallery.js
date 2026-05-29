// /api/admin/gallery* —— 仅 admin 可调。
// 列表（带筛选/分页）、单张/批量删除、统计、孤儿扫描与清理。
// TAG: hmt---

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import {
  listAdminGallery,
  removeImage,
  removeImagesBulk,
  adminStats,
  scanOrphans,
  removeDanglingFile
} from '../services/gallery-store.js';
import { record as auditRecord } from '../services/audit.js';
import { logger } from '../utils/logger.js';

const SORT_FIELDS = new Set(['createdAt', 'bytes']);

function parseDate(value, end = false) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // 仅日期 → 转 ISO（end=true 时取当天 23:59:59）
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return end ? `${text}T23:59:59.999Z` : `${text}T00:00:00.000Z`;
  }
  return text;
}

function adminListOptions(urlObj) {
  if (!urlObj) return { page: 1, pageSize: 50, sort: 'createdAt', order: 'desc' };
  const sp = urlObj.searchParams;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('size')) || 50));
  return {
    userId: sp.get('userId') || '',
    model: sp.get('model') || '',
    profileName: sp.get('profileName') || '',
    search: String(sp.get('search') || '').trim().toLowerCase(),
    from: parseDate(sp.get('from'), false) || '',
    to: parseDate(sp.get('to'), true) || '',
    minBytes: Number(sp.get('minBytes')) || 0,
    maxBytes: Number(sp.get('maxBytes')) || 0,
    sort: SORT_FIELDS.has(sp.get('sort')) ? sp.get('sort') : 'createdAt',
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
    page,
    pageSize
  };
}

async function handleList(req, res, urlObj) {
  try {
    const result = await listAdminGallery(adminListOptions(urlObj));
    sendJson(res, 200, {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalAll: result.totalAll,
      storage: result.storage
    });
  } catch (err) {
    logger.error('admin.gallery.list_failed', { error: err.message });
    sendJson(res, 500, { error: err.message });
  }
}

async function handleStats(req, res) {
  try {
    const stats = await adminStats();
    sendJson(res, 200, stats);
  } catch (err) {
    logger.error('admin.gallery.stats_failed', { error: err.message });
    sendJson(res, 500, { error: err.message });
  }
}

async function handleDeleteOne(req, res, id) {
  try {
    const removed = await removeImage(id, { isAdmin: true });
    auditRecord(req, 'image.delete', { type: 'image', id }, {
      path: removed.path,
      userId: removed.userId,
      bytes: removed.bytes
    });
    sendJson(res, 200, { ok: true, removed });
  } catch (err) {
    const status = err.message === 'image not found' ? 404 : 400;
    sendJson(res, status, { error: err.message });
  }
}

async function handleBulkDelete(req, res) {
  let body = {};
  try { body = await readJsonBody(req); } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
  if (!ids.length) {
    sendJson(res, 400, { error: 'ids required' });
    return;
  }
  if (ids.length > 500) {
    sendJson(res, 400, { error: 'too many ids (max 500)' });
    return;
  }
  const result = await removeImagesBulk(ids, { isAdmin: true });
  auditRecord(req, 'image.bulk_delete', { type: 'image', id: null }, {
    requested: ids.length,
    ok: result.ok.length,
    failed: result.failed.length
  });
  sendJson(res, 200, result);
}

async function handleOrphans(req, res, urlObj) {
  try {
    const data = await scanOrphans();
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

async function handleDeleteDangling(req, res) {
  let body = {};
  try { body = await readJsonBody(req); } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return;
  }
  const path = String(body?.path || '');
  try {
    const out = await removeDanglingFile(path);
    auditRecord(req, 'image.dangling_delete', { type: 'image', id: null }, { path });
    sendJson(res, 200, { ok: true, removed: out });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

export async function handleAdminGalleryRoute(req, res, pathname, urlObj) {
  if (!requireAdmin(req, res)) return;
  const method = req.method;

  if (pathname === '/api/admin/gallery' && method === 'GET') {
    return handleList(req, res, urlObj);
  }
  if (pathname === '/api/admin/gallery/stats' && method === 'GET') {
    return handleStats(req, res);
  }
  if (pathname === '/api/admin/gallery/orphans' && method === 'GET') {
    return handleOrphans(req, res, urlObj);
  }
  if (pathname === '/api/admin/gallery/orphans' && method === 'DELETE') {
    return handleDeleteDangling(req, res);
  }
  if (pathname === '/api/admin/gallery/bulk-delete' && method === 'POST') {
    return handleBulkDelete(req, res);
  }

  const m = pathname.match(/^\/api\/admin\/gallery\/([^/]+)\/?$/);
  if (m && method === 'DELETE') {
    return handleDeleteOne(req, res, decodeURIComponent(m[1]));
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleAdminGalleryRoute;
