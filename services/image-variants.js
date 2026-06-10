import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import { positiveIntFromEnv } from '../utils/config.js';
import { assertUserPath, guardPaths } from './path-guard.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_THUMBNAIL_MAX_PX = 320;
const DEFAULT_PREVIEW_MAX_PX = 1024;
const DEFAULT_MAX_SOURCE_PIXELS = 16_000_000;

let crcTable = null;

function thumbnailMaxPx() {
  return positiveIntFromEnv('GALLERY_THUMBNAIL_MAX_PX', DEFAULT_THUMBNAIL_MAX_PX);
}

function previewMaxPx() {
  return positiveIntFromEnv('GALLERY_PREVIEW_MAX_PX', DEFAULT_PREVIEW_MAX_PX);
}

function maxSourcePixels() {
  return positiveIntFromEnv('GALLERY_VARIANT_MAX_SOURCE_PIXELS', DEFAULT_MAX_SOURCE_PIXELS);
}

function isPngMime(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase() === 'image/png';
}

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function bytesPerPixel(colorType) {
  if (colorType === 0 || colorType === 3) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`unsupported png color type: ${colorType}`);
}

function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
    throw new Error('invalid png');
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('invalid png signature');
  }

  let offset = PNG_SIGNATURE.length;
  let ihdr = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error('truncated png chunk');
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!ihdr || !idat.length) throw new Error('invalid png');
  if (ihdr.bitDepth !== 8 || ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) {
    throw new Error('unsupported png encoding');
  }
  if (ihdr.width < 1 || ihdr.height < 1) throw new Error('invalid png dimensions');

  const bpp = bytesPerPixel(ihdr.colorType);
  const scanlineBytes = ihdr.width * bpp;
  const inflated = inflateSync(Buffer.concat(idat));
  const expected = (scanlineBytes + 1) * ihdr.height;
  if (inflated.length < expected) throw new Error('truncated png data');

  const raw = new Uint8Array(scanlineBytes * ihdr.height);
  let inputOffset = 0;
  for (let y = 0; y < ihdr.height; y += 1) {
    const filterType = inflated[inputOffset];
    inputOffset += 1;
    const rowStart = y * scanlineBytes;
    const prevRowStart = rowStart - scanlineBytes;
    for (let x = 0; x < scanlineBytes; x += 1) {
      const current = inflated[inputOffset + x];
      const left = x >= bpp ? raw[rowStart + x - bpp] : 0;
      const up = y > 0 ? raw[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? raw[prevRowStart + x - bpp] : 0;
      let value;
      if (filterType === 0) value = current;
      else if (filterType === 1) value = current + left;
      else if (filterType === 2) value = current + up;
      else if (filterType === 3) value = current + Math.floor((left + up) / 2);
      else if (filterType === 4) value = current + paethPredictor(left, up, upLeft);
      else throw new Error(`unsupported png filter: ${filterType}`);
      raw[rowStart + x] = value & 0xff;
    }
    inputOffset += scanlineBytes;
  }

  const rgba = new Uint8Array(ihdr.width * ihdr.height * 4);
  for (let pixel = 0; pixel < ihdr.width * ihdr.height; pixel += 1) {
    const src = pixel * bpp;
    const dst = pixel * 4;
    if (ihdr.colorType === 0) {
      const gray = raw[src];
      rgba[dst] = gray;
      rgba[dst + 1] = gray;
      rgba[dst + 2] = gray;
      rgba[dst + 3] = 255;
    } else if (ihdr.colorType === 2) {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src + 1];
      rgba[dst + 2] = raw[src + 2];
      rgba[dst + 3] = 255;
    } else if (ihdr.colorType === 3) {
      const idx = raw[src];
      rgba[dst] = palette?.[idx * 3] ?? 0;
      rgba[dst + 1] = palette?.[idx * 3 + 1] ?? 0;
      rgba[dst + 2] = palette?.[idx * 3 + 2] ?? 0;
      rgba[dst + 3] = transparency?.[idx] ?? 255;
    } else if (ihdr.colorType === 4) {
      const gray = raw[src];
      rgba[dst] = gray;
      rgba[dst + 1] = gray;
      rgba[dst + 2] = gray;
      rgba[dst + 3] = raw[src + 1];
    } else if (ihdr.colorType === 6) {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src + 1];
      rgba[dst + 2] = raw[src + 2];
      rgba[dst + 3] = raw[src + 3];
    }
  }

  return { width: ihdr.width, height: ihdr.height, rgba };
}

function scaledDimensions(width, height, maxPx) {
  const maxDim = Math.max(width, height);
  const scale = Math.min(1, Math.max(1, Number(maxPx) || 1) / maxDim);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function resizeNearest(rgba, width, height, targetWidth, targetHeight) {
  if (width === targetWidth && height === targetHeight) return rgba;
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y + 0.5) * height / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x + 0.5) * width / targetWidth));
      const src = (srcY * width + srcX) * 4;
      const dst = (y * targetWidth + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return out;
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * rowBytes, rowBytes).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND')
  ]);
}

function variantRelPath(sourceRelPath, imageId, kind) {
  const segments = String(sourceRelPath || '').split(/[\\/]+/).filter(Boolean);
  if (segments[0] !== 'users' || !segments[1] || segments[2] !== 'images' || segments.length < 4) {
    throw new Error('variants only support user-scoped gallery images');
  }
  const safeId = String(imageId || '').replace(/[^a-zA-Z0-9._-]/g, '') || createHash('sha256')
    .update(String(sourceRelPath))
    .digest('hex')
    .slice(0, 16);
  const baseDir = segments.slice(0, -1).join('/');
  return `${baseDir}/.variants/${safeId}/${kind}.png`;
}

function resolveVariantAbs(relPath, userId) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  const abs = resolve(guardPaths.generatedRoot, ...segments);
  const root = resolve(guardPaths.generatedRoot) + sep;
  if (abs !== resolve(guardPaths.generatedRoot) && !abs.startsWith(root)) {
    throw new Error('variant path outside generated root');
  }
  return assertUserPath(abs, userId);
}

async function writeVariant({ decoded, sourceRelPath, imageId, userId, kind, maxPx, alwaysWrite = false }) {
  const dims = scaledDimensions(decoded.width, decoded.height, maxPx);
  if (!alwaysWrite && dims.width === decoded.width && dims.height === decoded.height) return null;

  const resized = resizeNearest(decoded.rgba, decoded.width, decoded.height, dims.width, dims.height);
  const encoded = encodePng({ width: dims.width, height: dims.height, rgba: resized });
  const relPath = variantRelPath(sourceRelPath, imageId, kind);
  const absPath = resolveVariantAbs(relPath, userId);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, encoded);
  return { relPath, absPath, bytes: encoded.length, width: dims.width, height: dims.height };
}

export async function createGalleryImageVariants({
  sourcePath,
  sourceRelPath,
  mimeType,
  imageId,
  userId
} = {}) {
  if (!sourcePath || !sourceRelPath || !imageId || !userId || !isPngMime(mimeType)) return {};

  const source = await readFile(sourcePath);
  const decoded = decodePng(source);
  if (decoded.width * decoded.height > maxSourcePixels()) {
    throw new Error('source image too large for variant generation');
  }

  const thumbnail = await writeVariant({
    decoded,
    sourceRelPath,
    imageId,
    userId,
    kind: 'thumb',
    maxPx: thumbnailMaxPx(),
    alwaysWrite: true
  });
  const preview = await writeVariant({
    decoded,
    sourceRelPath,
    imageId,
    userId,
    kind: 'preview',
    maxPx: previewMaxPx()
  });

  return {
    thumbnailPath: thumbnail?.relPath || '',
    thumbnailBytes: thumbnail?.bytes || 0,
    previewPath: preview?.relPath || '',
    previewBytes: preview?.bytes || 0,
    writtenPaths: [thumbnail?.absPath, preview?.absPath].filter(Boolean)
  };
}
