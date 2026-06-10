import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function safeNamePart(value) {
  return String(value || 'migration')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'migration';
}

function uniqueMigrationBackupDir(backupRoot, { version, name, createdAt }) {
  const baseName = `${timestampForFilename(createdAt)}-v${version}-${safeNamePart(name)}`;
  let candidate = join(backupRoot, baseName);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = join(backupRoot, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function sha256FileSync(filePath) {
  const hash = createHash('sha256');
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest('hex');
  } finally {
    closeSync(fd);
  }
}

function copyMigrationBackupFile(sourcePath, backupDir, targetName) {
  if (!existsSync(sourcePath)) return null;
  const sourceInfo = statSync(sourcePath);
  if (!sourceInfo.isFile()) return null;
  const targetPath = join(backupDir, targetName);
  copyFileSync(sourcePath, targetPath);
  const targetInfo = statSync(targetPath);
  return {
    path: targetName,
    size: targetInfo.size,
    mtimeMs: Math.round(targetInfo.mtimeMs),
    sha256: sha256FileSync(targetPath)
  };
}

export function createSqliteMigrationBackup(db, {
  dbPath,
  backupRoot,
  version,
  name,
  reason,
  logger = null
} = {}) {
  if (!dbPath) throw new Error('dbPath is required for migration backup');
  if (!backupRoot) throw new Error('backupRoot is required for migration backup');

  const createdAt = new Date();
  const backupDir = uniqueMigrationBackupDir(backupRoot, { version, name, createdAt });
  const files = [];

  if (!existsSync(dbPath)) throw new Error(`database file not found before migration backup: ${dbPath}`);
  db.exec('PRAGMA wal_checkpoint(FULL);');
  mkdirSync(backupDir, { recursive: true });
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = copyMigrationBackupFile(`${dbPath}${suffix}`, backupDir, `app.db${suffix}`);
      if (file) files.push(file);
    }
    if (!files.length) throw new Error('no database files copied for migration backup');
    const manifest = {
      version: 1,
      app: 'image-studio',
      kind: 'sqlite-migration-backup',
      createdAt: createdAt.toISOString(),
      migration: { version, name, reason },
      source: dbPath,
      files
    };
    writeFileSync(join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    logger?.info?.('migration.backup.created', { version, name, path: backupDir, fileCount: files.length });
    return { path: backupDir, manifest };
  } catch (err) {
    rmSync(backupDir, { recursive: true, force: true });
    throw err;
  }
}
