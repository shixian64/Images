// Reference image staging for image edits.
// Normalizes user uploads and saved gallery images into per-job files under
// generated/tmp/jobs/<jobId>/references so queued jobs can safely call
// /v1/images/edits without persisting large blobs in SQLite.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { positiveIntFromEnv } from '../utils/config.js';
import { generationJobs, images as imagesTable } from './db.js';
import { guardPaths } from './path-guard.js';

const DEFAULT_MAX_REFERENCE_IMAGES = 4;
const DEFAULT_MAX_REFERENCE_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_REFERENCE_IMAGE_TOTAL_BYTES = 48 * 1024 * 1024;
const DEFAULT_REFERENCE_JOB_FILE_TTL_HOURS = 24;

const ALLOWED_REFERENCE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
};

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp'
};

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

export function getMaxReferenceImages() {
  return positiveIntFromEnv('MAX_REFERENCE_IMAGES', DEFAULT_MAX_REFERENCE_IMAGES);
}

export function getMaxReferenceImageBytes() {
  return positiveIntFromEnv('MAX_REFERENCE_IMAGE_BYTES', DEFAULT_MAX_REFERENCE_IMAGE_BYTES);
}

export function getMaxReferenceImageTotalBytes() {
  return positiveIntFromEnv('MAX_REFERENCE_IMAGE_TOTAL_BYTES', DEFAULT_MAX_REFERENCE_IMAGE_TOTAL_BYTES);
}

export function getReferenceJobFileTtlMs() {
  const hours = positiveIntFromEnv('REFERENCE_JOB_FILE_TTL_HOURS', DEFAULT_REFERENCE_JOB_FILE_TTL_HOURS);
  return hours * 60 * 60 * 1000;
}

function normalizeMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function extFromFilename(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : '';
}

function safeFilename(name, fallback = 'reference.png') {
  const cleaned = String(name || '')
    .replace(/[\\/\0]/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return cleaned || fallback;
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

function detectReferenceType(buffer, { contentType = '', filename = '' } = {}) {
  const byMagic = imageTypeFromMagic(buffer);
  if (byMagic) return byMagic;

  const mime = normalizeMimeType(contentType);
  if (ALLOWED_REFERENCE_MIME_TYPES.has(mime)) {
    const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
    return { ext: EXT_BY_MIME[normalized] || extFromFilename(filename) || 'png', mimeType: normalized };
  }

  const ext = extFromFilename(filename);
  const mimeFromExt = MIME_BY_EXT[ext];
  if (mimeFromExt) return { ext: ext === 'jpeg' ? 'jpg' : ext, mimeType: mimeFromExt };

  throw new Error('reference image must be PNG, JPEG, or WEBP');
}

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return fallback;
}

function normalizeReferenceSpecs(body = {}, uploadFiles = []) {
  const explicit = parseJsonArray(body.references, null);
  const out = [];

  if (explicit) {
    for (const item of explicit) {
      if (typeof item === 'string') {
        out.push({ type: 'gallery', id: item });
      } else if (item && typeof item === 'object') {
        const type = String(item.type || (item.id || item.galleryId ? 'gallery' : 'upload')).trim().toLowerCase();
        out.push({ ...item, type });
      }
    }
  }

  const ids = parseJsonArray(body.referenceImageIds ?? body.referenceIds ?? body.galleryImageIds, []);
  for (const id of ids) out.push({ type: 'gallery', id });

  if (uploadFiles.length) {
    const alreadyReferenced = new Set(
      out
        .filter((item) => item.type === 'upload')
        .map((item) => String(item.uploadKey || item.fieldName || item.name || '').trim())
        .filter(Boolean)
    );
    for (const file of uploadFiles) {
      if (!alreadyReferenced.has(file.fieldName)) {
        out.push({ type: 'upload', uploadKey: file.fieldName });
      }
    }
  }

  return out;
}

function generatedAbsFromRel(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length) throw new Error('invalid reference path');
  if (segments.some((part) => part === '.' || part === '..')) {
    throw new Error('invalid reference path');
  }
  const abs = resolve(guardPaths.generatedRoot, ...segments);
  const root = resolve(guardPaths.generatedRoot) + sep;
  if (abs !== resolve(guardPaths.generatedRoot) && !abs.startsWith(root)) {
    throw new Error('reference path outside generated directory');
  }
  return abs;
}

function stagedReferenceAbsFromRel(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  const safeJobId = String(segments[2] || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const isStagedReference =
    segments[0] === 'tmp' &&
    segments[1] === 'jobs' &&
    safeJobId &&
    safeJobId === segments[2] &&
    segments[3] === 'references' &&
    segments.length >= 5;
  if (!isStagedReference) {
    throw new Error('invalid staged reference path');
  }
  return generatedAbsFromRel(segments.join('/'));
}

function galleryImageAbsFromRow(row = {}) {
  const segments = String(row.path || '').split(/[\\/]+/).filter(Boolean);
  const isCurrentUserImage =
    segments[0] === 'users' &&
    segments[1] === row.user_id &&
    segments[2] === 'images' &&
    segments.length >= 4;
  const isLegacyImage = segments[0] === 'images' && segments.length >= 3;
  if (segments.some((part) => part === '.' || part === '..') || (!isCurrentUserImage && !isLegacyImage)) {
    throw new Error('invalid reference image path');
  }
  return generatedAbsFromRel(segments.join('/'));
}

function jobReferenceDir(jobId) {
  const safeJobId = String(jobId || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeJobId) throw new Error('job id required for reference staging');
  return resolve(guardPaths.generatedRoot, 'tmp', 'jobs', safeJobId, 'references');
}

function relFromGeneratedAbs(absPath) {
  const root = resolve(guardPaths.generatedRoot);
  const abs = resolve(absPath);
  const prefix = root + sep;
  if (abs !== root && !abs.startsWith(prefix)) throw new Error('path outside generated directory');
  return abs.slice(prefix.length).split(sep).join('/');
}

async function stageBufferReference({ jobId, index, source, originalId = '', fileName, contentType, buffer }) {
  const bytes = Buffer.byteLength(buffer || Buffer.alloc(0));
  if (!bytes) throw new Error('reference image is empty');
  const maxBytes = getMaxReferenceImageBytes();
  if (bytes > maxBytes) throw new Error(`reference image too large (max ${maxBytes} bytes)`);

  const detected = detectReferenceType(buffer, { contentType, filename: fileName });
  const ext = detected.ext === 'jpeg' ? 'jpg' : detected.ext;
  const dir = jobReferenceDir(jobId);
  await mkdir(dir, { recursive: true });

  const baseName = safeFilename(fileName, `reference-${index}.${ext}`);
  const withoutExt = baseName.replace(/\.[^.]*$/, '') || `reference-${index}`;
  const stagedName = `${String(index).padStart(3, '0')}-${randomUUID().slice(0, 8)}-${safeFilename(withoutExt, 'reference')}.${ext}`;
  const absPath = resolve(dir, stagedName);
  const dirPrefix = resolve(dir) + sep;
  if (!absPath.startsWith(dirPrefix)) throw new Error('invalid staged reference path');

  await writeFile(absPath, buffer);
  return {
    index,
    source,
    originalId,
    filename: stagedName,
    originalFilename: baseName,
    relPath: relFromGeneratedAbs(absPath),
    mimeType: detected.mimeType,
    bytes
  };
}

async function stageGalleryReference({ jobId, userInfo, spec, index }) {
  const id = String(spec.id || spec.galleryId || spec.imageId || '').trim();
  if (!id) throw new Error('reference gallery image id is required');

  const row = imagesTable.findById(id);
  if (!row) throw new Error('reference image not found');
  const isAdmin = userInfo?.role === 'admin';
  if (!isAdmin && row.user_id !== userInfo?.id) throw new Error('forbidden reference image');

  const sourceAbs = galleryImageAbsFromRow(row);
  const fileStat = await stat(sourceAbs);
  if (!fileStat.isFile()) throw new Error('reference image file not found');
  const maxBytes = getMaxReferenceImageBytes();
  if (fileStat.size > maxBytes) throw new Error(`reference image too large (max ${maxBytes} bytes)`);

  const buffer = await readFile(sourceAbs);
  return stageBufferReference({
    jobId,
    index,
    source: 'gallery',
    originalId: id,
    fileName: row.filename || `${id}.png`,
    contentType: row.mime_type || '',
    buffer
  });
}

function findUploadFile(spec, uploadFiles, uploadCursor) {
  const key = String(spec.uploadKey || spec.fieldName || spec.name || '').trim();
  if (key) {
    const found = uploadFiles.find((file) => file.fieldName === key || file.filename === key);
    if (found) return found;
  }
  const index = Number(spec.index ?? spec.uploadIndex);
  if (Number.isInteger(index) && uploadFiles[index]) return uploadFiles[index];
  return uploadFiles[uploadCursor.value++];
}

async function stageUploadReference({ jobId, spec, uploadFiles, uploadCursor, index }) {
  const file = findUploadFile(spec, uploadFiles, uploadCursor);
  if (!file) throw new Error('uploaded reference image is missing');
  return stageBufferReference({
    jobId,
    index,
    source: 'upload',
    originalId: '',
    fileName: file.filename || `upload-${index}.png`,
    contentType: file.contentType || '',
    buffer: file.buffer
  });
}

export function hasReferenceInputs(body = {}) {
  const uploadFiles = Array.isArray(body._uploadedReferenceFiles) ? body._uploadedReferenceFiles : [];
  return normalizeReferenceSpecs(body, uploadFiles).length > 0;
}

export async function stageReferenceImages({ body = {}, jobId, userInfo } = {}) {
  const uploadFiles = Array.isArray(body._uploadedReferenceFiles) ? body._uploadedReferenceFiles : [];
  const specs = normalizeReferenceSpecs(body, uploadFiles);
  if (!specs.length) return [];
  if (!userInfo?.id) throw new Error('unauthorized');

  const maxImages = getMaxReferenceImages();
  if (specs.length > maxImages) throw new Error(`reference images must be at most ${maxImages}.`);

  const staged = [];
  const uploadCursor = { value: 0 };
  let totalBytes = 0;
  const totalLimit = getMaxReferenceImageTotalBytes();

  try {
    for (const spec of specs) {
      const index = staged.length + 1;
      const type = String(spec?.type || 'gallery').toLowerCase();
      const item = type === 'upload'
        ? await stageUploadReference({ jobId, spec, uploadFiles, uploadCursor, index })
        : await stageGalleryReference({ jobId, userInfo, spec, index });

      totalBytes += Number(item.bytes) || 0;
      if (totalBytes > totalLimit) {
        throw new Error(`reference images are too large in total (max ${totalLimit} bytes)`);
      }
      staged.push(item);
    }
    return staged;
  } catch (err) {
    await cleanupReferenceJobFiles(jobId);
    throw err;
  }
}

export function publicReferenceImage(item = {}) {
  return {
    index: Number(item.index) || 0,
    source: item.source || '',
    originalId: item.originalId || '',
    filename: item.originalFilename || item.filename || '',
    mimeType: item.mimeType || '',
    bytes: Number(item.bytes) || 0
  };
}

export function publicReferencePayload(references = []) {
  return (Array.isArray(references) ? references : []).map(publicReferenceImage);
}

export function runnableReferenceImages(references = []) {
  return (Array.isArray(references) ? references : [])
    .map((item) => ({
      ...item,
      absPath: stagedReferenceAbsFromRel(item.relPath)
    }));
}

export async function cleanupReferenceJobFiles(jobId) {
  if (!jobId) return;
  const safeJobId = String(jobId || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeJobId) return;
  const dir = resolve(guardPaths.generatedRoot, 'tmp', 'jobs', safeJobId);
  const root = resolve(guardPaths.generatedRoot, 'tmp', 'jobs') + sep;
  if (!dir.startsWith(root)) return;
  await rm(dir, { recursive: true, force: true });
}

export async function cleanupExpiredReferenceJobFiles({ now = Date.now(), ttlMs = getReferenceJobFileTtlMs() } = {}) {
  const root = resolve(guardPaths.generatedRoot, 'tmp', 'jobs');
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const abs = resolve(root, entry.name);
    if (!abs.startsWith(root + sep)) continue;
    try {
      const st = await stat(abs);
      if (ttlMs <= 0 || now - st.mtimeMs >= ttlMs) {
        const job = generationJobs.findById(entry.name);
        if (job && !TERMINAL_JOB_STATUSES.has(job.status)) continue;
        await rm(abs, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Ignore cleanup races.
    }
  }
  return removed;
}
