// 提示词示例图上传存储。
// 示例图独立于生成结果流程，但仍放在用户 images 目录下并写入 images 表，
// 这样可以复用现有存储配额、用户删除清理和路径防护。

import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { positiveIntFromEnv } from '../utils/config.js';
import { httpError } from '../utils/http.js';
import { images as imagesTable } from './db.js';
import { tryReserveStorageBytes } from './quota.js';
import { assertUserPath, userImageDir, userImageRel } from './path-guard.js';

const DEFAULT_MAX_PROMPT_EXAMPLE_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_PROMPT_EXAMPLE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp'
};

function normalizeMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
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
  return null;
}

function detectPromptExampleImageType(buffer, { contentType = '' } = {}) {
  const byMagic = imageTypeFromMagic(buffer);
  if (!byMagic) {
    throw httpError(400, '示例图必须是 PNG、JPEG 或 WebP 图片');
  }

  const declared = normalizeMimeType(contentType);
  if (declared && !ALLOWED_PROMPT_EXAMPLE_MIME_TYPES.has(declared)) {
    throw httpError(400, `示例图 Content-Type 不支持：${declared}`);
  }
  return byMagic;
}

function maxPromptExampleImageBytes() {
  return positiveIntFromEnv('MAX_PROMPT_EXAMPLE_IMAGE_BYTES', DEFAULT_MAX_PROMPT_EXAMPLE_IMAGE_BYTES);
}

function safeFilenamePart(value, fallback = 'example') {
  const cleaned = String(value || '')
    .replace(/[\\/\0]/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
}

function filenameStem(filename) {
  return safeFilenamePart(String(filename || '').replace(/\.[^.]*$/, ''), 'example');
}

function buildFileName(createdAt, originalFilename, ext) {
  const safeTs = createdAt.replace(/[:.]/g, '-');
  return `${safeTs}-${randomUUID().slice(0, 8)}-${filenameStem(originalFilename)}.${ext}`;
}

function toPromptExampleUrl(relPath) {
  const encoded = String(relPath || '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `/prompt-example-files/${encoded}`;
}

export async function savePromptExampleImage({ userId, file, prompt = '', title = '' } = {}) {
  if (!userId) throw httpError(401, 'unauthorized');
  if (!file?.buffer?.length) throw httpError(400, '请上传示例图文件');

  const buffer = Buffer.from(file.buffer);
  const maxBytes = maxPromptExampleImageBytes();
  if (buffer.length > maxBytes) {
    throw httpError(413, `示例图过大（最大 ${maxBytes} bytes）`);
  }

  const detected = detectPromptExampleImageType(buffer, {
    contentType: file.contentType || file.mimeType || ''
  });
  const ext = EXT_BY_MIME[detected.mimeType] || detected.ext || 'png';
  const createdAt = new Date().toISOString();
  const dateDir = createdAt.slice(0, 10);
  const fileName = buildFileName(createdAt, file.filename, ext);
  const filePath = join(userImageDir(userId), 'prompt-examples', dateDir, fileName);
  assertUserPath(filePath, userId);

  const reservation = tryReserveStorageBytes(userId, buffer.length);
  if (!reservation.ok) {
    throw httpError(403, reservation.message || '存储空间不足', reservation.code);
  }

  let written = false;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    written = true;

    const relPath = `${userImageRel(userId)}/prompt-examples/${dateDir}/${fileName}`;
    const id = randomUUID();
    imagesTable.insert({
      id,
      userId,
      createdAt,
      filename: fileName,
      path: relPath,
      mimeType: detected.mimeType,
      bytes: buffer.length,
      isPublic: false,
      prompt: String(prompt || '').slice(0, 12_000),
      revisedPrompt: title ? String(title).slice(0, 500) : '',
      model: '',
      size: '',
      quality: '',
      outputFormat: ext,
      profileName: '',
      sourceType: 'prompt_example',
      index: null
    });

    return {
      id,
      userId,
      createdAt,
      filename: fileName,
      originalFilename: file.filename || '',
      path: relPath,
      url: toPromptExampleUrl(relPath),
      mimeType: detected.mimeType,
      bytes: buffer.length
    };
  } catch (err) {
    if (written) {
      try { await rm(filePath, { force: true }); } catch { /* ignore cleanup failure */ }
    }
    throw err;
  } finally {
    reservation.release?.();
  }
}
