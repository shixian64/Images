// 本地图库存储层（按用户隔离）。
// 生成成功后把上游返回的图片落盘到 generated/users/<uid>/images/，
// 元数据写入 SQLite images 表（走 services/db.js）。

import { randomUUID } from 'node:crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { mapWithConcurrency } from '../utils/concurrency.js';
import { images as imagesTable, imageLikes, comicProjects, dbPaths } from './db.js';
import { assetFromItem, cleanupTempFile } from './gallery-assets.js';
import { dailyPublicLikeLimit, galleryStatConcurrency } from './gallery-config.js';
import {
  GALLERY_ROOT,
  galleryFileUrl,
  resolveStoredAbs
} from './gallery-paths.js';
import { createGalleryImageVariants } from './image-variants.js';
import { tryReserveStorageBytes } from './quota.js';
import {
  assertUserPath,
  userImageDir,
  userImageRel,
  guardPaths
} from './path-guard.js';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export { galleryFileUrl } from './gallery-paths.js';
export { removeDanglingFile, scanOrphans } from './gallery-orphans.js';

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
    thumbnailPath: row.thumbnail_path || '',
    previewPath: row.preview_path || '',
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
    let writtenVariantPaths = [];
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
      const variants = await createGalleryImageVariants({
        sourcePath: filePath,
        sourceRelPath: relPath,
        mimeType: asset.mimeType,
        imageId: id,
        userId
      }).catch(() => ({}));
      writtenVariantPaths = Array.isArray(variants.writtenPaths) ? variants.writtenPaths : [];

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
        thumbnailPath: variants.thumbnailPath || '',
        previewPath: variants.previewPath || '',
        index: imageIndex + 1,
        comicProjectId,
        comicPageIndex,
        comicPanelIndex: comicPageIndex
      });
      dbInserted = true;

      if (comicProjectId) {
        comicProjects.touch(comicProjectId, { status: context.comicProjectStatus || null });
      }

      const publicUrl = galleryFileUrl(relPath);
      const thumbnailUrl = variants.thumbnailPath ? galleryFileUrl(variants.thumbnailPath) : '';
      const previewUrl = variants.previewPath ? galleryFileUrl(variants.previewPath) : '';
      const meta = {
        id,
        userId,
        createdAt,
        filename: fileName,
        path: relPath,
        url: publicUrl,
        mimeType: asset.mimeType,
        thumbnailPath: variants.thumbnailPath || '',
        thumbnailUrl,
        previewPath: variants.previewPath || '',
        previewUrl,
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
        thumbnail_url: thumbnailUrl || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        preview_url: previewUrl || undefined,
        previewUrl: previewUrl || undefined,
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
      for (const variantPath of writtenVariantPaths) {
        try { await unlink(variantPath); } catch { /* best-effort cleanup */ }
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
      const publicUrl = galleryFileUrl(item.path);
      const thumbnailUrl = item.thumbnailPath ? galleryFileUrl(item.thumbnailPath) : '';
      const previewUrl = item.previewPath ? galleryFileUrl(item.previewPath) : '';
      return {
        ...item,
        url: publicUrl,
        downloadUrl: publicUrl,
        thumbnailUrl: thumbnailUrl || publicUrl,
        previewUrl: previewUrl || publicUrl,
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
      const publicUrl = galleryFileUrl(item.path);
      const thumbnailUrl = item.thumbnailPath ? galleryFileUrl(item.thumbnailPath) : '';
      const previewUrl = item.previewPath ? galleryFileUrl(item.previewPath) : '';
      return {
        ...item,
        url: publicUrl,
        downloadUrl: publicUrl,
        thumbnailUrl: thumbnailUrl || publicUrl,
        previewUrl: previewUrl || publicUrl,
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

  const paths = [...new Set([row.path, row.thumbnail_path, row.preview_path].filter(Boolean))];
  for (const relPath of paths) {
    const abs = resolveStoredAbs(relPath, { userId: row.user_id });
    if (!abs) continue;
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

export const galleryPaths = Object.freeze({
  root: GALLERY_ROOT,
  images: guardPaths.usersRoot,
  index: dbPaths.file
});
