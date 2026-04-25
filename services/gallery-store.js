// 本地图库存储层（按用户隔离）。
// 生成成功后把上游返回的图片落盘到 generated/users/<uid>/images/，
// 元数据写入 SQLite images 表（走 services/db.js）。

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { images as imagesTable, dbPaths } from './db.js';
import {
  userImageDir,
  userImageRel,
  assertUserPath,
  guardPaths,
  isUnderUserImages
} from './path-guard.js';

const GALLERY_ROOT = guardPaths.generatedRoot;

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

// 按 magic bytes / content-type 推断扩展名和 MIME。
function detectImageType(buffer, { contentType = '', fallbackFormat = 'png' } = {}) {
  const mime = normalizeMimeType(contentType);
  if (EXT_BY_MIME[mime]) {
    const ext = EXT_BY_MIME[mime];
    return { ext, mimeType: MIME_BY_EXT[ext] || mime };
  }

  if (buffer?.length >= 12) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { ext: 'png', mimeType: 'image/png' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { ext: 'jpg', mimeType: 'image/jpeg' };
    }
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { ext: 'webp', mimeType: 'image/webp' };
    }
    if (buffer.toString('ascii', 0, 3) === 'GIF') {
      return { ext: 'gif', mimeType: 'image/gif' };
    }
  }

  const ext = normalizeFormat(fallbackFormat);
  return { ext, mimeType: MIME_BY_EXT[ext] || 'image/png' };
}

function parseBase64Image(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const dataUrlMatch = text.match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(dataUrlMatch[2], 'base64'),
      contentType: dataUrlMatch[1] || ''
    };
  }

  return { buffer: Buffer.from(text, 'base64'), contentType: '' };
}

// relPath 形如 users/<uid>/images/<date>/<file> 或旧路径 images/<date>/<file>。
// 按 / 分段后对每段 encodeURIComponent，再用 / 拼接。
function toPublicUrl(relPath) {
  return `/gallery-files/${String(relPath).split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/')}`;
}

async function assetFromUrl(url, { fetchImpl = fetch, fallbackFormat = 'png' } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download failed with ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers?.get?.('content-type') || '';
  const detected = detectImageType(buffer, { contentType, fallbackFormat });
  return { ...detected, buffer, sourceType: 'url' };
}

async function assetFromItem(item, { fetchImpl = fetch, fallbackFormat = 'png' } = {}) {
  if (item?.b64_json) {
    const parsed = parseBase64Image(item.b64_json);
    if (!parsed) return null;
    const detected = detectImageType(parsed.buffer, {
      contentType: parsed.contentType,
      fallbackFormat
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
    try {
      const asset = await assetFromItem(item, {
        fetchImpl: options.fetchImpl || fetch,
        fallbackFormat: context.outputFormat
      });

      if (!asset?.buffer?.length) {
        nextItems.push({ ...item, save_error: 'No image payload found.' });
        continue;
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
    }
  }

  return { items: nextItems, saved };
}

// 读取当前用户（或 admin 全量）的图库；过滤物理文件不存在的条目。
export async function listGallery({ userId, isAdmin = false, limit = 500 } = {}) {
  if (!isAdmin && !userId) {
    throw new Error('listGallery requires userId or isAdmin');
  }
  const cap = Math.max(1, Number(limit) || 500);
  const rows = isAdmin
    ? imagesTable.listAll(cap)
    : imagesTable.listByUser(userId, cap);

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

  // db 已按 created_at DESC 返回；再兜底排序一次。
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return {
    items,
    count: items.length,
    storage: isAdmin ? 'generated/users/* + legacy' : `generated/${userImageRel(userId)}`
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
  const rows = imagesTable.listAll(100000);
  const today = new Date().toISOString().slice(0, 10);
  const byUser = new Map();
  const byModel = new Map();
  let totalBytes = 0;
  let savedToday = 0;

  for (const row of rows) {
    totalBytes += Number(row.bytes) || 0;
    if (String(row.created_at || '').startsWith(today)) savedToday += 1;

    const u = row.user_id || 'unknown';
    const ub = byUser.get(u) || { count: 0, bytes: 0 };
    ub.count += 1;
    ub.bytes += Number(row.bytes) || 0;
    byUser.set(u, ub);

    const m = row.model || 'unknown';
    byModel.set(m, (byModel.get(m) || 0) + 1);
  }

  const topUsers = [...byUser.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const topModels = [...byModel.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: rows.length,
    totalBytes,
    savedToday,
    topUsers,
    topModels
  };
}

// 扫描孤儿：DB 行无文件 + 文件系统多余文件。
export async function scanOrphans() {
  const rows = imagesTable.listAll(100000);
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
  if (segs[0] !== 'users') throw new Error('only user-scoped files can be removed');

  const abs = resolve(GALLERY_ROOT, ...segs);
  if (!isUnderUserImages(abs)) throw new Error('path outside user dir');
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
