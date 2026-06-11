// Maintenance helpers for finding gallery DB/file mismatches.

import { readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { mapWithConcurrency } from '../utils/concurrency.js';
import { images as imagesTable } from './db.js';
import {
  galleryStatConcurrency,
  maintenanceScanPageSize,
  orphanScanMaxDbRows,
  orphanScanMaxDirs,
  orphanScanMaxFiles,
  orphanScanTimeoutMs
} from './gallery-config.js';
import {
  GALLERY_ROOT,
  isTrustedStoredImagePath,
  resolveStoredAbs,
  storedPathSegments
} from './gallery-paths.js';
import { assertUserPath, guardPaths, isUnderUserImages } from './path-guard.js';

// 扫描孤儿：DB 行无文件 + 文件系统多余文件。
export async function scanOrphans() {
  const startedAt = Date.now();
  const state = {
    startedAt,
    deadlineAt: startedAt + orphanScanTimeoutMs(),
    maxDbRows: orphanScanMaxDbRows(),
    maxFiles: orphanScanMaxFiles(),
    maxDirs: orphanScanMaxDirs(),
    dbRows: 0,
    files: 0,
    dirs: 0,
    truncated: false,
    truncationReason: ''
  };
  const dbKnownPaths = new Set();
  const missingFiles = [];
  const pageSize = maintenanceScanPageSize();
  let offset = 0;

  while (true) {
    if (scanShouldStop(state, 'timeout')) break;
    if (state.dbRows >= state.maxDbRows) {
      const nextRows = imagesTable.listAllForMaintenance({ limit: 1, offset });
      if (nextRows.length) markScanTruncated(state, 'max_db_rows');
      break;
    }

    const remainingRows = state.maxDbRows - state.dbRows;
    const limit = Math.min(pageSize, Math.max(1, remainingRows));
    const rows = imagesTable.listAllForMaintenance({ limit, offset });
    if (!rows.length) break;
    state.dbRows += rows.length;

    const entries = [];
    for (const row of rows) {
      const segs = storedPathSegments(row.path);
      const abs = resolveStoredAbs(row.path, { userId: row.user_id });
      if (!segs || !abs) {
        missingFiles.push({
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at,
          bytes: Number(row.bytes) || 0,
          reason: 'invalid_path'
        });
        continue;
      }
      entries.push({ row, segs, abs });
    }

    for (const entry of entries) {
      dbKnownPaths.add(entry.segs.join('/'));
      for (const relPath of [entry.row.thumbnail_path, entry.row.preview_path]) {
        const variantSegments = storedPathSegments(relPath);
        if (isTrustedStoredImagePath(variantSegments, entry.row.user_id)) {
          dbKnownPaths.add(variantSegments.join('/'));
        }
      }
    }

    const missingPage = await mapWithConcurrency(entries, galleryStatConcurrency(), async ({ row, abs }) => {
      try {
        const st = await stat(abs);
        if (st.isFile()) return null;
        return {
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at
        };
      } catch (err) {
        if (err.code !== 'ENOENT') return null;
        return {
          id: row.id,
          path: row.path,
          userId: row.user_id,
          createdAt: row.created_at,
          bytes: Number(row.bytes) || 0
        };
      }
    });
    missingFiles.push(...missingPage.filter(Boolean));

    if (rows.length < limit) break;
    offset += rows.length;
  }

  if (!state.truncated && state.dbRows >= state.maxDbRows) {
    const nextRows = imagesTable.listAllForMaintenance({ limit: 1, offset });
    if (nextRows.length) markScanTruncated(state, 'max_db_rows');
  }

  // Reverse-scan generated/users/<uid>/images. If the DB scan was truncated,
  // skip dangling detection because knownPaths is incomplete and would produce
  // false positives for still-referenced files.
  const danglingFiles = [];
  const skippedDanglingScan = state.truncated && state.truncationReason === 'max_db_rows';
  if (!skippedDanglingScan) {
    try {
      const userDirs = await readdir(guardPaths.usersRoot, { withFileTypes: true }).catch(() => []);
      for (const ud of userDirs) {
        if (!ud.isDirectory()) continue;
        if (scanShouldStop(state, 'timeout')) break;
        const imagesDir = join(guardPaths.usersRoot, ud.name, 'images');
        await walkAndCheck(imagesDir, ud.name, dbKnownPaths, danglingFiles, state);
        if (state.truncated) break;
      }
    } catch {
      // ignore
    }
  }

  return {
    missingFiles,
    danglingFiles,
    truncated: state.truncated,
    truncationReason: state.truncationReason,
    skippedDanglingScan,
    scan: {
      dbRows: state.dbRows,
      files: state.files,
      dirs: state.dirs,
      maxDbRows: state.maxDbRows,
      maxFiles: state.maxFiles,
      maxDirs: state.maxDirs,
      timeoutMs: state.deadlineAt - state.startedAt,
      durationMs: Date.now() - state.startedAt
    }
  };
}

function markScanTruncated(state, reason) {
  if (!state.truncated) {
    state.truncated = true;
    state.truncationReason = reason;
  }
}

function scanShouldStop(state, reason = 'timeout') {
  if (state.truncated) return true;
  if (Date.now() > state.deadlineAt) {
    markScanTruncated(state, reason);
    return true;
  }
  return false;
}

async function walkAndCheck(dir, userId, knownPaths, danglingFiles, state) {
  if (scanShouldStop(state, 'timeout')) return;
  if (state.dirs >= state.maxDirs) {
    markScanTruncated(state, 'max_dirs');
    return;
  }
  state.dirs += 1;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = [];
  for (const ent of entries) {
    if (state.truncated) break;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkAndCheck(abs, userId, knownPaths, danglingFiles, state);
      continue;
    }
    if (state.files >= state.maxFiles) {
      markScanTruncated(state, 'max_files');
      break;
    }
    state.files += 1;
    files.push(abs);
  }

  const dangling = await mapWithConcurrency(files, galleryStatConcurrency(), async (abs) => {
    if (!isUnderUserImages(abs)) return null;
    const rel = abs.slice(GALLERY_ROOT.length + 1).split(sep).join('/');
    if (knownPaths.has(rel)) return null;
    try {
      const st = await stat(abs);
      return {
        path: rel,
        userId,
        bytes: st.size,
        mtime: st.mtime?.toISOString?.() || null
      };
    } catch {
      return { path: rel, userId };
    }
  });
  danglingFiles.push(...dangling.filter(Boolean));
}

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
  const row = imagesTable.findByServedPath(segs.join('/'));
  if (row) throw new Error('file is referenced by db row, refuse to delete');

  await unlink(abs);
  return { path: relPath };
}
