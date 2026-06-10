// 本地图库存储层（按用户隔离）。
// 生成成功后把上游返回的图片落盘到 generated/users/<uid>/images/，
// 元数据写入 SQLite images 表（走 services/db.js）。

import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { positiveIntFromEnv } from '../utils/config.js';
import { images as imagesTable, imageLikes, comicProjects, dbPaths } from './db.js';
import { tryReserveStorageBytes } from './quota.js';
import { guardedFetch } from './upstream.js';
import {
  userImageDir,
  userImageRel,
  assertUserPath,
  guardPaths,
  isUnderUserImages
} from './path-guard.js';

const GALLERY_ROOT = guardPaths.generatedRoot;
const DOWNLOAD_TMP_DIR = join(GALLERY_ROOT, 'tmp', 'downloads');
const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_IMAGE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_DAILY_PUBLIC_LIKE_LIMIT = 10;
const DEFAULT_GALLERY_STAT_CONCURRENCY = 16;
const DEFAULT_MAINTENANCE_SCAN_PAGE_SIZE = 500;
const DEFAULT_ORPHAN_SCAN_MAX_DB_ROWS = 50_000;
const DEFAULT_ORPHAN_SCAN_MAX_FILES = 20_000;
const DEFAULT_ORPHAN_SCAN_MAX_DIRS = 5_000;
const DEFAULT_ORPHAN_SCAN_TIMEOUT_MS = 15_000;

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function normalizeFormat(format) {
  const value = String(format || '').toLowerCase();
  if (value === 'jpeg') return 'jpg';
  if (value in MIME_BY_EXT) return value;
  return 'png';
}

function normalizeMimeType(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase();
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function maxImageDownloadBytes() {
  return positiveIntFromEnv('MAX_IMAGE_DOWNLOAD_BYTES', DEFAULT_MAX_IMAGE_DOWNLOAD_BYTES);
}

function imageDownloadTimeoutMs() {
  return positiveIntFromEnv('IMAGE_DOWNLOAD_TIMEOUT_MS', DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS);
}

function dailyPublicLikeLimit() {
  return positiveIntFromEnv('PUBLIC_GALLERY_DAILY_LIKE_LIMIT', DEFAULT_DAILY_PUBLIC_LIKE_LIMIT);
}

function galleryStatConcurrency() {
  return positiveIntFromEnv('GALLERY_STAT_CONCURRENCY', DEFAULT_GALLERY_STAT_CONCURRENCY);
}

function maintenanceScanPageSize() {
  return positiveIntFromEnv('GALLERY_MAINTENANCE_SCAN_PAGE_SIZE', DEFAULT_MAINTENANCE_SCAN_PAGE_SIZE);
}

function orphanScanMaxDbRows() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_DB_ROWS', DEFAULT_ORPHAN_SCAN_MAX_DB_ROWS);
}

function orphanScanMaxFiles() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_FILES', DEFAULT_ORPHAN_SCAN_MAX_FILES);
}

function orphanScanMaxDirs() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_DIRS', DEFAULT_ORPHAN_SCAN_MAX_DIRS);
}

function orphanScanTimeoutMs() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_TIMEOUT_MS', DEFAULT_ORPHAN_SCAN_TIMEOUT_MS);
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];
  const concurrency = Math.min(source.length, Math.max(1, Math.floor(Number(limit) || 1)));
  const results = new Array(source.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < source.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(source[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function imageTypeFromMagic(buffer) {
  if (!buffer?.length) return null;
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', mimeType: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mimeType: 'image/webp' };
  }
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { ext: 'gif', mimeType: 'image/gif' };
  }
  return null;
}

// 按 magic bytes / content-type 推断扩展名和 MIME。
function detectImageType(buffer, { contentType = '', fallbackFormat = 'png', requireMagic = false } = {}) {
  const byMagic = imageTypeFromMagic(buffer);
  if (byMagic) return byMagic;

  if (requireMagic) {
    throw new Error('downloaded asset is not a supported image');
  }

  const mime = normalizeMimeType(contentType);
  if (EXT_BY_MIME[mime]) {
    const ext = EXT_BY_MIME[mime];
    return { ext, mimeType: MIME_BY_EXT[ext] || mime };
  }

  const ext = normalizeFormat(fallbackFormat);
  return { ext, mimeType: MIME_BY_EXT[ext] || 'image/png' };
}

function estimateBase64DecodedBytes(base64) {
  const compact = String(base64 || '').replace(/\s+/g, '');
  if (!compact) return 0;
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function decodeBase64Image(base64, maxBytes) {
  if (maxBytes && estimateBase64DecodedBytes(base64) > maxBytes) {
    throw new Error(`decoded image too large (max ${maxBytes} bytes)`);
  }
  const buffer = Buffer.from(base64, 'base64');
  if (maxBytes && buffer.length > maxBytes) {
    throw new Error(`decoded image too large (max ${maxBytes} bytes)`);
  }
  return buffer;
}

function parseBase64Image(raw, { maxBytes = maxImageDownloadBytes() } = {}) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const dataUrlMatch = text.match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (dataUrlMatch) {
    const contentType = dataUrlMatch[1] || '';
    const mime = normalizeMimeType(contentType);
    if (mime && !EXT_BY_MIME[mime]) {
      throw new Error(`b64_json content-type is not allowed: ${mime}`);
    }
    return {
      buffer: decodeBase64Image(dataUrlMatch[2], maxBytes),
      contentType
    };
  }

  return { buffer: decodeBase64Image(text, maxBytes), contentType: '' };
}

// relPath 形如 users/<uid>/images/<date>/<file> 或旧路径 images/<date>/<file>。
// 按 / 分段后对每段 encodeURIComponent，再用 / 拼接。
function toPublicUrl(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length || segments.some((part) => part === '.' || part === '..')) return '';
  return `/gallery-files/${segments.map(encodeURIComponent).join('/')}`;
}

export function galleryFileUrl(relPath) {
  return toPublicUrl(relPath);
}

function assertResponseLooksLikeImage(response) {
  const mime = normalizeMimeType(response.headers?.get?.('content-type') || '');
  if (!mime || mime === 'application/octet-stream') return;
  if (!EXT_BY_MIME[mime]) throw new Error(`downloaded asset content-type is not allowed: ${mime}`);
}

function assertContentLengthWithinLimit(response, maxBytes) {
  const raw = response.headers?.get?.('content-length');
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error(`downloaded image too large (max ${maxBytes} bytes)`);
  }
}

function downloadAbortError() {
  return new DOMException('This operation was aborted.', 'AbortError');
}

function throwIfDownloadAborted(signal) {
  if (signal?.aborted) throw downloadAbortError();
}

function appendSniffBytes(current, chunk, maxBytes = 16) {
  if (current.length >= maxBytes || !chunk.length) return current;
  const need = maxBytes - current.length;
  return Buffer.concat([current, chunk.subarray(0, need)], Math.min(maxBytes, current.length + chunk.length));
}

async function cleanupTempFile(filePath) {
  if (!filePath) return;
  try { await unlink(filePath); } catch { /* best effort */ }
}

async function downloadResponseFileLimited(response, maxBytes, { signal } = {}) {
  throwIfDownloadAborted(signal);
  assertContentLengthWithinLimit(response, maxBytes);
  await mkdir(DOWNLOAD_TMP_DIR, { recursive: true });
  const tempFilePath = join(DOWNLOAD_TMP_DIR, `${Date.now()}-${randomUUID()}.download`);
  let handle = null;

  try {
    handle = await open(tempFilePath, 'wx');

    // Node/Undici Response.body is a Web ReadableStream. Keep an arrayBuffer
    // fallback for non-standard test doubles, while real URL downloads stream
    // chunks directly to the temporary file.
    if (!response.body?.getReader) {
      const buffer = Buffer.from(await response.arrayBuffer());
      throwIfDownloadAborted(signal);
      if (buffer.length > maxBytes) {
        throw new Error(`downloaded image too large (max ${maxBytes} bytes)`);
      }
      await handle.writeFile(buffer);
      await handle.close();
      handle = null;
      return { tempFilePath, bytes: buffer.length, sniffBuffer: buffer.subarray(0, 16) };
    }

    const reader = response.body.getReader();
    let total = 0;
    let sniffBuffer = Buffer.alloc(0);
    const onAbort = () => {
      try { reader.cancel?.(downloadAbortError()); } catch { /* ignore */ }
    };
    try {
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      while (true) {
        throwIfDownloadAborted(signal);
        const { done, value } = await reader.read();
        throwIfDownloadAborted(signal);
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
          await reader.cancel?.();
          throw new Error(`downloaded image too large (max ${maxBytes} bytes)`);
        }
        sniffBuffer = appendSniffBytes(sniffBuffer, chunk);
        await handle.write(chunk);
      }
    } finally {
      signal?.removeEventListener?.('abort', onAbort);
      reader.releaseLock?.();
    }

    await handle.close();
    handle = null;
    return { tempFilePath, bytes: total, sniffBuffer };
  } catch (err) {
    try { await handle?.close(); } catch { /* best effort */ }
    await cleanupTempFile(tempFilePath);
    throw err;
  }
}

async function assetFromUrl(url, { fetchImpl = fetch, fallbackFormat = 'png' } = {}) {
  const targetUrl = String(url || '').trim();

  const timeoutMs = imageDownloadTimeoutMs();
  const maxBytes = maxImageDownloadBytes();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await guardedFetch(targetUrl, {
      method: 'GET',
      headers: { accept: 'image/png,image/jpeg,image/webp,image/gif,application/octet-stream;q=0.8' },
      redirect: 'manual',
      signal: controller.signal
    }, { fetchImpl });

    if (!response.ok) throw new Error(`download failed with ${response.status}`);
    assertResponseLooksLikeImage(response);
    const contentType = response.headers?.get?.('content-type') || '';
    const downloaded = await downloadResponseFileLimited(response, maxBytes, { signal: controller.signal });
    try {
      const detected = detectImageType(downloaded.sniffBuffer, { contentType, fallbackFormat, requireMagic: true });
      return { ...detected, tempFilePath: downloaded.tempFilePath, bytes: downloaded.bytes, sourceType: 'url' };
    } catch (err) {
      await cleanupTempFile(downloaded.tempFilePath);
      throw err;
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('image download timed out');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function assetFromItem(item, { fetchImpl = fetch, fallbackFormat = 'png' } = {}) {
  if (item?.b64_json) {
    const parsed = parseBase64Image(item.b64_json);
    if (!parsed) return null;
    const detected = detectImageType(parsed.buffer, {
      contentType: parsed.contentType,
      fallbackFormat,
      requireMagic: true
    });
    return { ...detected, buffer: parsed.buffer, sourceType: 'b64_json' };
  }

  if (item?.url) {
    return assetFromUrl(item.url, { fetchImpl, fallbackFormat });
  }

  return null;
}

function buildFileName(createdAt, index, ext) {
  const safeTs = createdAt.replace(/[:.]/g, '-');
  return `${safeTs}-${index + 1}-${randomUUID().slice(0, 8)}.${ext}`;
}

// 把 db 行（snake_case）映射成前端沿用的 camelCase 结构。
function rowToItem(row) {
  const comicPageIndex = Number.isFinite(row.comic_panel_index) ? row.comic_panel_index : null;
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    filename: row.filename,
    path: row.path,
    mimeType: row.mime_type,
    bytes: Number(row.bytes) || 0,
    isPublic: Boolean(row.is_public),
    publishedAt: row.published_at || null,
    ownerUsername: row.owner_username || '',
    prompt: row.prompt || '',
    revisedPrompt: row.revised_prompt || '',
    model: row.model || '',
    size: row.size || '',
    quality: row.quality || '',
    outputFormat: row.output_format || '',
    profileName: row.profile_name || '',
    sourceType: row.source_type || '',
    index: Number.isFinite(row.image_index) ? row.image_index : null,
    comicProjectId: row.comic_project_id || '',
    comicPageIndex,
    // Backward-compatible alias for older clients and the current DB column name.
    comicPanelIndex: comicPageIndex
  };
}

function comicProjectIdForUser(projectId, userId) {
  const id = String(projectId || '').trim();
  if (!id) return '';
  const project = comicProjects.findById(id);
  if (!project || project.user_id !== userId) throw new Error('comic project not found');
  return id;
}

function comicPageIndexFromContext(context = {}) {
  const n = Number(context.comicPageIndex ?? context.comicPanelIndex);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function storedPathSegments(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((part) => part === '.' || part === '..')) return null;
  return segments;
}

function isTrustedStoredImagePath(segments, userId) {
  if (!Array.isArray(segments) || !segments.length) return false;
  // Current format: generated/users/<uid>/images/...
  if (segments[0] === 'users') {
    return Boolean(userId) && segments[1] === userId && segments[2] === 'images' && segments.length >= 4;
  }
  // Legacy migration format: generated/images/<date>/<file>
  if (segments[0] === 'images') {
    return segments.length >= 3;
  }
  return false;
}

// Convert a DB images.path value to an absolute path only when it is one of the
// gallery-owned layouts. Legacy gallery.json and SQLite runtime state are
// treated as untrusted input, so callers must not blindly join arbitrary rows.
function resolveStoredAbs(relPath, { userId = '' } = {}) {
  const segments = storedPathSegments(relPath);
  if (!isTrustedStoredImagePath(segments, userId)) return null;
  const abs = resolve(GALLERY_ROOT, ...segments);
  const root = resolve(GALLERY_ROOT) + sep;
  if (abs !== resolve(GALLERY_ROOT) && !abs.startsWith(root)) return null;
  return abs;
}

// 保存上游返回的图片到当前用户目录，并写入 SQLite。
export async function saveGeneratedImages(items, context = {}, options = {}) {
  const userId = options?.userId;
  if (!userId) throw new Error('saveGeneratedImages requires userId');
  if (!Array.isArray(items) || !items.length) return { items: [], saved: [] };
  const comicProjectId = comicProjectIdForUser(context.comicProjectId, userId);
  const comicPageIndex = comicPageIndexFromContext(context);

  // 确保用户图片目录存在。
  const userDir = userImageDir(userId);
  await mkdir(userDir, { recursive: true });

  const nextItems = [];
  const saved = [];

  for (const [imageIndex, item] of items.entries()) {
    let storageReservation = null;
    let writtenFilePath = '';
    let dbInserted = false;
    let asset = null;
    try {
      asset = await assetFromItem(item, {
        fetchImpl: options.fetchImpl || fetch,
        fallbackFormat: context.outputFormat
      });
      const assetBytes = Number(asset?.bytes ?? asset?.buffer?.length ?? 0);

      if (!assetBytes) {
        nextItems.push({ ...item, save_error: 'No image payload found.' });
        await cleanupTempFile(asset?.tempFilePath);
        continue;
      }

      storageReservation = tryReserveStorageBytes(userId, assetBytes);
      if (!storageReservation.ok) {
        throw new Error(storageReservation.message || 'storage limit exceeded');
      }

      const createdAt = new Date().toISOString();
      const dateDir = createdAt.slice(0, 10);
      const fileName = buildFileName(createdAt, imageIndex, asset.ext);

      // 物理路径：generated/users/<uid>/images/<date>/<file>
      const filePath = join(userDir, dateDir, fileName);
      // 校验 normalize 后仍在用户目录里。
      assertUserPath(filePath, userId);

      await mkdir(dirname(filePath), { recursive: true });
      if (asset.tempFilePath) {
        await rename(asset.tempFilePath, filePath);
        asset.tempFilePath = '';
      } else {
        await writeFile(filePath, asset.buffer);
      }
      writtenFilePath = filePath;

      // 相对路径（存库 & 给前端拼 URL）：users/<uid>/images/<date>/<file>
      const relPath = `${userImageRel(userId)}/${dateDir}/${fileName}`;
      const id = randomUUID();

      imagesTable.insert({
        id,
        userId,
        createdAt,
        filename: fileName,
        path: relPath,
        mimeType: asset.mimeType,
        bytes: assetBytes,
        isPublic: false,
        prompt: context.prompt || '',
        revisedPrompt: item?.revised_prompt || '',
        model: context.model || '',
        size: context.size || '',
        quality: context.quality || '',
        outputFormat: context.outputFormat || '',
        profileName: context.profileName || '',
        sourceType: asset.sourceType,
        index: imageIndex + 1,
        comicProjectId,
        comicPageIndex,
        comicPanelIndex: comicPageIndex
      });
      dbInserted = true;

      if (comicProjectId) {
        comicProjects.touch(comicProjectId, { status: context.comicProjectStatus || null });
      }

      const publicUrl = toPublicUrl(relPath);
      const meta = {
        id,
        userId,
        createdAt,
        filename: fileName,
        path: relPath,
        url: publicUrl,
        mimeType: asset.mimeType,
        bytes: assetBytes,
        isPublic: false,
        publishedAt: null,
        likeCount: 0,
        likedByMe: false,
        prompt: context.prompt || '',
        revisedPrompt: item?.revised_prompt || '',
        model: context.model || '',
        size: context.size || '',
        quality: context.quality || '',
        outputFormat: context.outputFormat || '',
        profileName: context.profileName || '',
        sourceType: asset.sourceType,
        index: imageIndex + 1,
        comicProjectId,
        comicPageIndex,
        comicPanelIndex: comicPageIndex
      };

      saved.push(meta);
      nextItems.push({
        ...item,
        local_url: publicUrl,
        localUrl: publicUrl,
        gallery_id: id,
        comic_project_id: comicProjectId || undefined,
        comic_page_index: comicPageIndex || undefined,
        comic_panel_index: comicPageIndex || undefined,
        file_name: fileName,
        mime_type: asset.mimeType,
        bytes: assetBytes
      });
    } catch (err) {
      await cleanupTempFile(asset?.tempFilePath);
      if (writtenFilePath && !dbInserted) {
        try { await unlink(writtenFilePath); } catch { /* best-effort cleanup */ }
      }
      nextItems.push({ ...item, save_error: err.message || String(err) });
    } finally {
      storageReservation?.release?.();
    }
  }

  return { items: nextItems, saved };
}

async function itemsFromRows(rows, { viewerId = null } = {}) {
  const mapped = await mapWithConcurrency(rows, galleryStatConcurrency(), async (row) => {
    const item = rowToItem(row);
    // path 可能是新格式 users/<uid>/images/... 或旧格式 images/...
    const filePath = resolveStoredAbs(item.path, { userId: item.userId });
    if (!filePath) return null;
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) return null;
      const publicUrl = toPublicUrl(item.path);
      return {
        ...item,
        url: publicUrl,
        downloadUrl: publicUrl,
        bytes: item.bytes || fileStat.size
      };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // 物理文件丢了 —— 跳过，不影响其他条目
      return null;
    }
  });
  const items = mapped.filter(Boolean);

  const ids = items.map((item) => item.id).filter(Boolean);
  const likeCounts = imageLikes.countForImages(ids);
  const likedIds = viewerId ? imageLikes.likedImageIds(viewerId, ids) : new Set();
  for (const item of items) {
    item.likeCount = likeCounts.get(item.id) || 0;
    item.likedByMe = likedIds.has(item.id);
  }

  return items;
}

export function galleryCounts(userId) {
  return {
    mine: userId ? imagesTable.countByUser(userId) : 0,
    myPublic: userId ? imagesTable.countPublicByUser(userId) : 0,
    public: imagesTable.countPublic(),
    comicProjects: userId ? comicProjects.countByUser(userId) : 0
  };
}

export function publicLikeQuota(userId) {
  const limit = dailyPublicLikeLimit();
  const used = userId ? imageLikes.countByUserDay(userId, todayUtc()) : 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used)
  };
}

// 读取当前用户（或 admin 全量 / 公开图库）的图库；过滤物理文件不存在的条目。
export async function listGallery({ userId, isAdmin = false, limit = 500, scope = 'mine' } = {}) {
  if (!userId && !isAdmin) {
    throw new Error('listGallery requires userId or isAdmin');
  }
  const cap = Math.max(1, Number(limit) || 500);
  const normalizedScope = scope === 'public' ? 'public' : 'mine';
  const rows = normalizedScope === 'public'
    ? imagesTable.listPublic(cap)
    : (isAdmin && !userId ? imagesTable.listAll(cap) : imagesTable.listByUser(userId, cap));

  const items = await itemsFromRows(rows, { viewerId: userId });

  // db 已按 created_at DESC 返回；再兜底排序一次。
  items.sort((a, b) => {
    const aTime = normalizedScope === 'public' ? (a.publishedAt || a.createdAt || '') : (a.createdAt || '');
    const bTime = normalizedScope === 'public' ? (b.publishedAt || b.createdAt || '') : (b.createdAt || '');
    return String(bTime).localeCompare(String(aTime));
  });

  return {
    items,
    count: items.length,
    scope: normalizedScope,
    counts: galleryCounts(userId),
    likeQuota: publicLikeQuota(userId),
    storage: normalizedScope === 'public'
      ? 'generated/users/*/images (public)'
      : (isAdmin && !userId ? 'generated/users/* + legacy' : `generated/${userImageRel(userId)}`)
  };
}

export async function listComicProjectImages({ projectId, userId, isAdmin = false, limit = 500 } = {}) {
  if (!projectId) throw new Error('comic project id required');
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(projectId);
  if (!project) throw new Error('comic project not found');
  if (!isAdmin && project.user_id !== userId) throw new Error('forbidden');
  const rows = imagesTable.listByComicProject(projectId, { limit });
  const items = await itemsFromRows(rows, { viewerId: userId });
  return items;
}

export async function listAdminGallery(options = {}) {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize ?? options.size) || 50)));
  const rows = imagesTable.listAdmin({ ...options, page, pageSize });
  const total = imagesTable.countAdmin(options);
  const totalAll = hasAdminGalleryFilters(options)
    ? imagesTable.countAdmin({})
    : total;
  const items = await adminItemsFromRows(rows);

  return {
    items,
    page,
    pageSize,
    total,
    totalAll,
    storage: 'generated/users/* + legacy'
  };
}

function hasAdminGalleryFilters(options = {}) {
  return Boolean(
    options.userId ||
    options.model ||
    options.profileName ||
    options.search ||
    options.from ||
    options.to ||
    options.minBytes ||
    options.maxBytes
  );
}

async function adminItemsFromRows(rows = []) {
  return mapWithConcurrency(rows, galleryStatConcurrency(), async (row) => {
    const item = rowToItem(row);
    const filePath = resolveStoredAbs(item.path, { userId: item.userId });
    if (!filePath) {
      return {
        ...item,
        url: '',
        downloadUrl: '',
        fileExists: false,
        fileMissing: true,
        missingReason: 'invalid_path'
      };
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        return {
          ...item,
          url: '',
          downloadUrl: '',
          fileExists: false,
          fileMissing: true,
          missingReason: 'not_file'
        };
      }
      const publicUrl = toPublicUrl(item.path);
      return {
        ...item,
        url: publicUrl,
        downloadUrl: publicUrl,
        bytes: item.bytes || fileStat.size,
        fileExists: true,
        fileMissing: false,
        missingReason: ''
      };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return {
        ...item,
        url: '',
        downloadUrl: '',
        fileExists: false,
        fileMissing: true,
        missingReason: 'missing_file'
      };
    }
  });
}

export async function setImagePublic(id, { userId, isAdmin = false, isPublic = false } = {}) {
  if (!id) throw new Error('image id required');
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const row = imagesTable.findById(id);
  if (!row) throw new Error('image not found');
  if (!isAdmin && row.user_id !== userId) throw new Error('forbidden');

  const updated = imagesTable.setPublic(id, Boolean(isPublic), new Date().toISOString());
  const [item] = await itemsFromRows([updated], { viewerId: userId });
  return item || rowToItem(updated);
}

export async function likePublicImage(id, { userId } = {}) {
  if (!id) throw new Error('image id required');
  if (!userId) throw new Error('unauthorized');
  const row = imagesTable.findById(id);
  if (!row) throw new Error('image not found');
  if (!row.is_public) throw new Error('image not public');

  const now = new Date().toISOString();
  const day = todayUtc();
  const alreadyLiked = imageLikes.hasLiked(id, userId);
  if (!alreadyLiked) {
    const used = imageLikes.countByUserDay(userId, day);
    const limit = dailyPublicLikeLimit();
    if (used >= limit) {
      const err = new Error('daily like limit exceeded');
      err.code = 'daily_like_limit_exceeded';
      err.status = 429;
      throw err;
    }
    imageLikes.create({ imageId: id, userId, day, createdAt: now });
  }

  return {
    id,
    likedByMe: true,
    alreadyLiked,
    likeCount: imageLikes.countForImage(id),
    likeQuota: publicLikeQuota(userId)
  };
}

// 删除单张图片：DB + 物理文件。
// 普通用户仅能删自己的；admin 可删任意。
export async function removeImage(id, { userId, isAdmin = false } = {}) {
  if (!id) throw new Error('image id required');
  const row = imagesTable.findById(id);
  if (!row) throw new Error('image not found');
  if (!isAdmin && row.user_id !== userId) throw new Error('forbidden');

  const abs = resolveStoredAbs(row.path, { userId: row.user_id });
  if (abs) {
    try {
      await unlink(abs);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // 物理删除失败也继续删 db 行，避免 db/磁盘失同步；调用方可拿到 warning
      }
    }
  }
  imagesTable.deleteById(id);
  return { id, path: row.path, userId: row.user_id, bytes: row.bytes };
}

export async function removeImagesBulk(ids, ctx = {}) {
  const results = { ok: [], failed: [] };
  for (const id of ids || []) {
    try {
      const r = await removeImage(id, ctx);
      results.ok.push(r);
    } catch (err) {
      results.failed.push({ id, error: err.message || String(err) });
    }
  }
  return results;
}

// 全量统计：用于管理员图库面板顶部。
export async function adminStats() {
  const today = new Date().toISOString().slice(0, 10);
  return imagesTable.adminStats(today);
}

// 扫描孤儿：DB 行无文件 + 文件系统多余文件。
export async function scanOrphans() {
  const startedAt = Date.now();
  const state = {
    startedAt,
    deadlineAt: startedAt + orphanScanTimeoutMs(),
    maxDbRows: orphanScanMaxDbRows(),
    maxFiles: orphanScanMaxFiles(),
    maxDirs: orphanScanMaxDirs(),
    dbRows: 0,
    files: 0,
    dirs: 0,
    truncated: false,
    truncationReason: ''
  };
  const dbKnownPaths = new Set();
  const missingFiles = [];
  const pageSize = maintenanceScanPageSize();
  let offset = 0;

  while (true) {
    if (scanShouldStop(state, 'timeout')) break;
    if (state.dbRows >= state.maxDbRows) {
      const nextRows = imagesTable.listAllForMaintenance({ limit: 1, offset });
      if (nextRows.length) markScanTruncated(state, 'max_db_rows');
      break;
    }

    const remainingRows = state.maxDbRows - state.dbRows;
    const limit = Math.min(pageSize, Math.max(1, remainingRows));
    const rows = imagesTable.listAllForMaintenance({ limit, offset });
    if (!rows.length) break;
    state.dbRows += rows.length;

    const entries = [];
    for (const row of rows) {
      const segs = storedPathSegments(row.path);
      const abs = resolveStoredAbs(row.path, { userId: row.user_id });
      if (!segs || !abs) {
        missingFiles.push({
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at,
          bytes: Number(row.bytes) || 0,
          reason: 'invalid_path'
        });
        continue;
      }
      entries.push({ row, segs, abs });
    }

    for (const entry of entries) {
      dbKnownPaths.add(entry.segs.join('/'));
    }

    const missingPage = await mapWithConcurrency(entries, galleryStatConcurrency(), async ({ row, abs }) => {
      try {
        const st = await stat(abs);
        if (st.isFile()) return null;
        return {
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at
        };
      } catch (err) {
        if (err.code !== 'ENOENT') return null;
        return {
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at,
          bytes: Number(row.bytes) || 0
        };
      }
    });
    missingFiles.push(...missingPage.filter(Boolean));

    if (rows.length < limit) break;
    offset += rows.length;
  }

  if (!state.truncated && state.dbRows >= state.maxDbRows) {
    const nextRows = imagesTable.listAllForMaintenance({ limit: 1, offset });
    if (nextRows.length) markScanTruncated(state, 'max_db_rows');
  }

  // Reverse-scan generated/users/<uid>/images. If the DB scan was truncated,
  // skip dangling detection because knownPaths is incomplete and would produce
  // false positives for still-referenced files.
  const danglingFiles = [];
  const skippedDanglingScan = state.truncated && state.truncationReason === 'max_db_rows';
  if (!skippedDanglingScan) {
    try {
      const userDirs = await readdir(guardPaths.usersRoot, { withFileTypes: true }).catch(() => []);
      for (const ud of userDirs) {
        if (!ud.isDirectory()) continue;
        if (scanShouldStop(state, 'timeout')) break;
        const imagesDir = join(guardPaths.usersRoot, ud.name, 'images');
        await walkAndCheck(imagesDir, ud.name, dbKnownPaths, danglingFiles, state);
        if (state.truncated) break;
      }
    } catch {
      // ignore
    }
  }

  return {
    missingFiles,
    danglingFiles,
    truncated: state.truncated,
    truncationReason: state.truncationReason,
    skippedDanglingScan,
    scan: {
      dbRows: state.dbRows,
      files: state.files,
      dirs: state.dirs,
      maxDbRows: state.maxDbRows,
      maxFiles: state.maxFiles,
      maxDirs: state.maxDirs,
      timeoutMs: state.deadlineAt - state.startedAt,
      durationMs: Date.now() - state.startedAt
    }
  };
}

function markScanTruncated(state, reason) {
  if (!state.truncated) {
    state.truncated = true;
    state.truncationReason = reason;
  }
}

function scanShouldStop(state, reason = 'timeout') {
  if (state.truncated) return true;
  if (Date.now() > state.deadlineAt) {
    markScanTruncated(state, reason);
    return true;
  }
  return false;
}

async function walkAndCheck(dir, userId, knownPaths, danglingFiles, state) {
  if (scanShouldStop(state, 'timeout')) return;
  if (state.dirs >= state.maxDirs) {
    markScanTruncated(state, 'max_dirs');
    return;
  }
  state.dirs += 1;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = [];
  for (const ent of entries) {
    if (state.truncated) break;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkAndCheck(abs, userId, knownPaths, danglingFiles, state);
      continue;
    }
    if (state.files >= state.maxFiles) {
      markScanTruncated(state, 'max_files');
      break;
    }
    state.files += 1;
    files.push(abs);
  }

  const dangling = await mapWithConcurrency(files, galleryStatConcurrency(), async (abs) => {
    if (!isUnderUserImages(abs)) return null;
    const rel = abs.slice(GALLERY_ROOT.length + 1).split(sep).join('/');
    if (knownPaths.has(rel)) return null;
    try {
      const st = await stat(abs);
      return {
        path: rel,
        userId,
        bytes: st.size,
        mtime: st.mtime?.toISOString?.() || null
      };
    } catch {
      return { path: rel, userId };
    }
  });
  danglingFiles.push(...dangling.filter(Boolean));
}

export async function removeDanglingFile(relPath) {
  if (!relPath || typeof relPath !== 'string') throw new Error('invalid path');
  const segs = relPath.split(/[\\/]+/).filter(Boolean);
  if (!segs.length) throw new Error('invalid path');
  if (segs.some((part) => part === '.' || part === '..')) throw new Error('invalid path');
  if (segs[0] !== 'users' || !segs[1] || segs[2] !== 'images' || segs.length < 4) {
    throw new Error('only user-scoped image files can be removed');
  }

  const abs = resolve(GALLERY_ROOT, ...segs);
  assertUserPath(abs, segs[1]);
  // 再次确认 DB 中没人认领该文件
  const row = imagesTable.findByPath(segs.join('/'));
  if (row) throw new Error('file is referenced by db row, refuse to delete');

  await unlink(abs);
  return { path: relPath };
}

export const galleryPaths = Object.freeze({
  root: GALLERY_ROOT,
  images: guardPaths.usersRoot,
  index: dbPaths.file
});
