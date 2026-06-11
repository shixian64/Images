// Shared helpers for validating stored gallery paths and building served URLs.

import { resolve, sep } from 'node:path';

import { guardPaths } from './path-guard.js';

export const GALLERY_ROOT = guardPaths.generatedRoot;

// relPath 形如 users/<uid>/images/<date>/<file> 或旧路径 images/<date>/<file>。
// 按 / 分段后对每段 encodeURIComponent，再用 / 拼接。
export function galleryFileUrl(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length || segments.some((part) => part === '.' || part === '..')) return '';
  return `/gallery-files/${segments.map(encodeURIComponent).join('/')}`;
}

export function storedPathSegments(relPath) {
  const segments = String(relPath || '').split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((part) => part === '.' || part === '..')) return null;
  return segments;
}

export function isTrustedStoredImagePath(segments, userId) {
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
export function resolveStoredAbs(relPath, { userId = '' } = {}) {
  const segments = storedPathSegments(relPath);
  if (!isTrustedStoredImagePath(segments, userId)) return null;
  const abs = resolve(GALLERY_ROOT, ...segments);
  const root = resolve(GALLERY_ROOT) + sep;
  if (abs !== resolve(GALLERY_ROOT) && !abs.startsWith(root)) return null;
  return abs;
}
