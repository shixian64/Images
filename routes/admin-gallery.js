// /api/admin/gallery* —— 仅 admin 可调。
// 列表（带筛选/分页）、单张/批量删除、统计、孤儿扫描与清理。
// TAG: hmt---

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import {
  listGallery,
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

function applyAdminFilters(items, urlObj) {
  if (!urlObj) return { items, page: 1, pageSize: items.length, total: items.length };
  const sp = urlObj.searchParams;
  const userId = sp.get('userId');
  const model = sp.get('model');
  const profileName = sp.get('profileName');
  const search = String(sp.get('search') || '').trim().toLowerCase();
  const from = parseDate(sp.get('from'), false);
  const to = parseDate(sp.get('to'), true);
  const minBytes = Number(sp.get('minBytes')) || 0;
  const maxBytes = Number(sp.get('maxBytes')) || 0;
  const sortField = SORT_FIELDS.has(sp.get('sort')) ? sp.get('sort') : 'createdAt';
  const sortDir = sp.get('order') === 'asc' ? 1 : -1;

  let filtered = items.filter((it) => {
    if (userId && it.userId !== userId) return false;
    if (model && (it.model || '') !== model) return false;
    if (profileName && (it.profileName || '') !== profileName) return false;
    if (from && String(it.createdAt) < from) return false;
    if (to && String(it.createdAt) > to) return false;
    if (minBytes && Number(it.bytes || 0) < minBytes) return false;
    if (maxBytes && Number(it.bytes || 0) > maxBytes) return false;
    if (search) {
      const blob = `${it.prompt || ''}\n${it.revisedPrompt || ''}\n${it.filename || ''}\n${it.model || ''}\n${it.profileName || ''}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  filtered = filtered.sort((a, b) => {
    const av = sortField === 'bytes' ? Number(a.bytes || 0) : String(a.createdAt || '');
    const bv = sortField === 'bytes' ? Number(b.bytes || 0) : String(b.createdAt || '');
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('size')) || 50));
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return {
    items: slice,
    page,
    pageSize,
    total: filtered.length,
    totalAll: items.length
  };
}

async function handleList(req, res, urlObj) {
  try {
    const data = await listGallery({ isAdmin: true, limit: 100000 });
    const result = applyAdminFilters(data.items, urlObj);
    sendJson(res, 200, {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalAll: result.totalAll,
      storage: data.storage
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
