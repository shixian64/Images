import { positiveIntFromEnv } from '../utils/config.js';

const DEFAULT_DAILY_PUBLIC_LIKE_LIMIT = 10;
const DEFAULT_GALLERY_STAT_CONCURRENCY = 16;
const DEFAULT_MAINTENANCE_SCAN_PAGE_SIZE = 500;
const DEFAULT_ORPHAN_SCAN_MAX_DB_ROWS = 50_000;
const DEFAULT_ORPHAN_SCAN_MAX_FILES = 20_000;
const DEFAULT_ORPHAN_SCAN_MAX_DIRS = 5_000;
const DEFAULT_ORPHAN_SCAN_TIMEOUT_MS = 15_000;

export function dailyPublicLikeLimit() {
  return positiveIntFromEnv('PUBLIC_GALLERY_DAILY_LIKE_LIMIT', DEFAULT_DAILY_PUBLIC_LIKE_LIMIT);
}

export function galleryStatConcurrency() {
  return positiveIntFromEnv('GALLERY_STAT_CONCURRENCY', DEFAULT_GALLERY_STAT_CONCURRENCY);
}

export function maintenanceScanPageSize() {
  return positiveIntFromEnv('GALLERY_MAINTENANCE_SCAN_PAGE_SIZE', DEFAULT_MAINTENANCE_SCAN_PAGE_SIZE);
}

export function orphanScanMaxDbRows() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_DB_ROWS', DEFAULT_ORPHAN_SCAN_MAX_DB_ROWS);
}

export function orphanScanMaxFiles() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_FILES', DEFAULT_ORPHAN_SCAN_MAX_FILES);
}

export function orphanScanMaxDirs() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_MAX_DIRS', DEFAULT_ORPHAN_SCAN_MAX_DIRS);
}

export function orphanScanTimeoutMs() {
  return positiveIntFromEnv('GALLERY_ORPHAN_SCAN_TIMEOUT_MS', DEFAULT_ORPHAN_SCAN_TIMEOUT_MS);
}
