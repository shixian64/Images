// 本地图库存储层（按用户隔离）。
// 生成成功后把上游返回的图片落盘到 generated/users/<uid>/images/，
// 元数据写入 SQLite images 表（走 services/db.js）。

import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { images as imagesTable, dbPaths } from './db.js';
import {
  userImageDir,
  userImageRel,
  assertUserPath,
  guardPaths
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

export const galleryPaths = Object.freeze({
  root: GALLERY_ROOT,
  images: guardPaths.usersRoot,
  index: dbPaths.file
});
