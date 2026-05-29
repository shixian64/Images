// 本地图库存储层（按用户隔离）。
// 生成成功后把上游返回的图片落盘到 generated/users/<uid>/images/，
// 元数据写入 SQLite images 表（走 services/db.js）。

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { positiveIntFromEnv } from '../utils/config.js';
import { images as imagesTable, imageLikes, dbPaths } from './db.js';
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
const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_IMAGE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_DAILY_PUBLIC_LIKE_LIMIT = 10;

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
  return `/gallery-files/${String(relPath).split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/')}`;
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

async function readResponseBufferLimited(response, maxBytes, { signal } = {}) {
  throwIfDownloadAborted(signal);
  assertContentLengthWithinLimit(response, maxBytes);

  // Node/Undici Response.body 是 Web ReadableStream；测试替身可能没有 body，
  // 因此保留 arrayBuffer 兜底，但仍在读完后做一次大小校验。
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    throwIfDownloadAborted(signal);
    if (buffer.length > maxBytes) {
      throw new Error(`downloaded image too large (max ${maxBytes} bytes)`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
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
      chunks.push(chunk);
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total);
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
    const buffer = await readResponseBufferLimited(response, maxBytes, { signal: controller.signal });
    const detected = detectImageType(buffer, { contentType, fallbackFormat, requireMagic: true });
    return { ...detected, buffer, sourceType: 'url' };
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
    index: Number.isFinite(row.image_index) ? row.image_index : null
  };
}

// 保存上游返回的图片到当前用户目录，并写入 SQLite。
export async function saveGeneratedImages(items, context = {}, options = {}) {
  const userId = options?.userId;
  if (!userId) throw new Error('saveGeneratedImages requires userId');
  if (!Array.isArray(items) || !items.length) return { items: [], saved: [] };

  // 确保用户图片目录存在。
  const userDir = userImageDir(userId);
  await mkdir(userDir, { recursive: true });

  const nextItems = [];
  const saved = [];

  for (const [imageIndex, item] of items.entries()) {
    let storageReservation = null;
    try {
      const asset = await assetFromItem(item, {
        fetchImpl: options.fetchImpl || fetch,
        fallbackFormat: context.outputFormat
      });

      if (!asset?.buffer?.length) {
        nextItems.push({ ...item, save_error: 'No image payload found.' });
        continue;
      }

      storageReservation = tryReserveStorageBytes(userId, asset.buffer.length);
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
      await writeFile(filePath, asset.buffer);

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
        bytes: asset.buffer.length,
        isPublic: false,
        prompt: context.prompt || '',
        revisedPrompt: item?.revised_prompt || '',
        model: context.model || '',
        size: context.size || '',
        quality: context.quality || '',
        outputFormat: context.outputFormat || '',
        profileName: context.profileName || '',
        sourceType: asset.sourceType,
        index: imageIndex + 1
      });

      const publicUrl = toPublicUrl(relPath);
      const meta = {
        id,
        userId,
        createdAt,
        filename: fileName,
        path: relPath,
        url: publicUrl,
        mimeType: asset.mimeType,
        bytes: asset.buffer.length,
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
        index: imageIndex + 1
      };

      saved.push(meta);
      nextItems.push({
        ...item,
        local_url: publicUrl,
        localUrl: publicUrl,
        gallery_id: id,
        file_name: fileName,
        mime_type: asset.mimeType,
        bytes: asset.buffer.length
      });
    } catch (err) {
      nextItems.push({ ...item, save_error: err.message || String(err) });
    } finally {
      storageReservation?.release?.();
    }
  }

  return { items: nextItems, saved };
}

async function itemsFromRows(rows, { viewerId = null } = {}) {
  const items = [];
  for (const row of rows) {
    const item = rowToItem(row);
    // path 可能是新格式 users/<uid>/images/... 或旧格式 images/...
    const filePath = join(GALLERY_ROOT, ...item.path.split(/[\\/]+/).filter(Boolean));
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      const publicUrl = toPublicUrl(item.path);
      items.push({
        ...item,
        url: publicUrl,
        downloadUrl: publicUrl,
        bytes: item.bytes || fileStat.size
      });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // 物理文件丢了 —— 跳过，不影响其他条目
    }
  }

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
    public: imagesTable.countPublic()
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

export async function listAdminGallery(options = {}) {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize ?? options.size) || 50)));
  const filtered = await collectExistingAdminGalleryPage(options, { page, pageSize });
  const totalAll = hasAdminGalleryFilters(options)
    ? (await collectExistingAdminGalleryPage({}, { page: 1, pageSize: 1 })).total
    : filtered.total;

  return {
    items: filtered.items,
    page,
    pageSize,
    total: filtered.total,
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

async function collectExistingAdminGalleryPage(options = {}, { page, pageSize }) {
  const scanPageSize = 200;
  const start = (page - 1) * pageSize;
  let dbPage = 1;
  let existingSeen = 0;
  const items = [];

  while (true) {
    const rows = imagesTable.listAdmin({ ...options, page: dbPage, pageSize: scanPageSize });
    if (!rows.length) break;

    const existingItems = await itemsFromRows(rows, { viewerId: null });
    for (const item of existingItems) {
      if (existingSeen >= start && items.length < pageSize) {
        items.push(item);
      }
      existingSeen += 1;
    }

    if (rows.length < scanPageSize) break;
    dbPage += 1;
  }

  return { items, total: existingSeen };
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

// 把 images.path 转成绝对路径，仅当落在受信目录下才返回。
function resolveStoredAbs(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  const abs = resolve(GALLERY_ROOT, ...segments);
  const root = resolve(GALLERY_ROOT) + sep;
  if (abs !== resolve(GALLERY_ROOT) && !abs.startsWith(root)) return null;
  return abs;
}

// 删除单张图片：DB + 物理文件。
// 普通用户仅能删自己的；admin 可删任意。
export async function removeImage(id, { userId, isAdmin = false } = {}) {
  if (!id) throw new Error('image id required');
  const row = imagesTable.findById(id);
  if (!row) throw new Error('image not found');
  if (!isAdmin && row.user_id !== userId) throw new Error('forbidden');

  const abs = resolveStoredAbs(row.path);
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
  const rows = imagesTable.listAllForMaintenance();
  const dbKnownPaths = new Set();
  const missingFiles = [];

  for (const row of rows) {
    const segs = String(row.path || '').split(/[\\/]+/).filter(Boolean);
    if (!segs.length) continue;
    dbKnownPaths.add(segs.join('/'));
    const abs = resolve(GALLERY_ROOT, ...segs);
    try {
      const st = await stat(abs);
      if (!st.isFile()) {
        missingFiles.push({
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at
        });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        missingFiles.push({
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at,
          bytes: Number(row.bytes) || 0
        });
      }
    }
  }

  // 反向扫 generated/users/<uid>/images 下的真实文件
  const danglingFiles = [];
  try {
    const userDirs = await readdir(guardPaths.usersRoot, { withFileTypes: true }).catch(() => []);
    for (const ud of userDirs) {
      if (!ud.isDirectory()) continue;
      const imagesDir = join(guardPaths.usersRoot, ud.name, 'images');
      await walkAndCheck(imagesDir, ud.name, dbKnownPaths, danglingFiles);
    }
  } catch {
    // ignore
  }

  return {
    missingFiles,
    danglingFiles
  };
}

async function walkAndCheck(dir, userId, knownPaths, danglingFiles) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkAndCheck(abs, userId, knownPaths, danglingFiles);
      continue;
    }
    if (!isUnderUserImages(abs)) continue;
    const rel = abs.slice(GALLERY_ROOT.length + 1).split(sep).join('/');
    if (!knownPaths.has(rel)) {
      try {
        const st = await stat(abs);
        danglingFiles.push({
          path: rel,
          userId,
          bytes: st.size,
          mtime: st.mtime?.toISOString?.() || null
        });
      } catch {
        danglingFiles.push({ path: rel, userId });
      }
    }
  }
}

// 删除一个孤儿文件（物理路径，仅 admin 可调）。
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
