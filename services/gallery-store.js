// 本地图库存储层。
// 生成成功后把上游返回的图片落盘到 generated/images/，并维护 generated/gallery.json 索引。

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

const GALLERY_ROOT = join(process.cwd(), 'generated');
const IMAGE_ROOT = join(GALLERY_ROOT, 'images');
const INDEX_FILE = join(GALLERY_ROOT, 'gallery.json');

const STORE_VERSION = 1;
const MAX_INDEX_ITEMS = 1000;

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

async function ensureStore() {
  await mkdir(IMAGE_ROOT, { recursive: true });
}

function isSafeRelativePath(relPath) {
  const value = String(relPath || '');
  if (!value || isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized !== '..'
    && !normalized.startsWith(`..${sep}`)
    && !/^[a-zA-Z]:/.test(normalized)
    && normalized.startsWith(`images${sep}`);
}

function toPublicUrl(relPath) {
  return `/gallery-files/${String(relPath).split(/[\\/]+/).map(encodeURIComponent).join('/')}`;
}

async function readIndex() {
  try {
    const raw = await readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.items)) return parsed.items;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return [];
}

async function writeIndex(items) {
  await ensureStore();
  const payload = {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, MAX_INDEX_ITEMS)
  };
  const temp = `${INDEX_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(payload, null, 2), 'utf8');
  await rename(temp, INDEX_FILE);
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

function metadataForSavedImage({ item, context, asset, relPath, fileName, index, createdAt }) {
  const id = randomUUID();
  return {
    id,
    createdAt,
    filename: fileName,
    path: relPath,
    url: toPublicUrl(relPath),
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
    index: index + 1
  };
}

export async function saveGeneratedImages(items, context = {}, options = {}) {
  if (!Array.isArray(items) || !items.length) return { items: [], saved: [] };

  await ensureStore();
  const index = await readIndex();
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
      const relPath = `images/${dateDir}/${fileName}`;
      const filePath = join(GALLERY_ROOT, ...relPath.split('/'));

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, asset.buffer);

      const meta = metadataForSavedImage({
        item,
        context,
        asset,
        relPath,
        fileName,
        index: imageIndex,
        createdAt
      });

      index.unshift(meta);
      saved.push(meta);
      nextItems.push({
        ...item,
        local_url: meta.url,
        localUrl: meta.url,
        gallery_id: meta.id,
        file_name: meta.filename,
        mime_type: meta.mimeType,
        bytes: meta.bytes
      });
    } catch (err) {
      nextItems.push({ ...item, save_error: err.message || String(err) });
    }
  }

  if (saved.length) await writeIndex(index);
  return { items: nextItems, saved };
}

export async function listGallery({ limit = 500 } = {}) {
  const index = await readIndex();
  const items = [];

  for (const item of index) {
    if (!isSafeRelativePath(item.path)) continue;
    const filePath = join(GALLERY_ROOT, ...String(item.path).split(/[\\/]+/));
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      items.push({
        ...item,
        url: toPublicUrl(item.path),
        downloadUrl: toPublicUrl(item.path),
        bytes: item.bytes || fileStat.size
      });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    items: items.slice(0, Math.max(1, Number(limit) || 500)),
    count: items.length,
    storage: 'generated/images'
  };
}

export const galleryPaths = Object.freeze({
  root: GALLERY_ROOT,
  images: IMAGE_ROOT,
  index: INDEX_FILE
});
