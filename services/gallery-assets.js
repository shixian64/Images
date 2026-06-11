// Helpers for decoding and downloading generated gallery image assets.

import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { positiveIntFromEnv } from '../utils/config.js';
import { guardedFetch } from './upstream.js';
import { guardPaths } from './path-guard.js';

const DOWNLOAD_TMP_DIR = join(guardPaths.generatedRoot, 'tmp', 'downloads');
const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_IMAGE_DOWNLOAD_BYTES = 25 * 1024 * 1024;

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

function maxImageDownloadBytes() {
  return positiveIntFromEnv('MAX_IMAGE_DOWNLOAD_BYTES', DEFAULT_MAX_IMAGE_DOWNLOAD_BYTES);
}

function imageDownloadTimeoutMs() {
  return positiveIntFromEnv('IMAGE_DOWNLOAD_TIMEOUT_MS', DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS);
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

export async function cleanupTempFile(filePath) {
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

export async function assetFromItem(item, { fetchImpl = fetch, fallbackFormat = 'png' } = {}) {
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

