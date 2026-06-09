#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_FILE = 'manifest.json';
const SNAPSHOT_DATA_DIR = 'generated';
const DEFAULT_SOURCE = 'generated';
const DEFAULT_OUTPUT = join('backups', 'generated');

function timestampForName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function isSubPath(child, parent) {
  const rel = relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function assertSafeSnapshotPath(pathValue) {
  const parsed = parse(pathValue);
  if (pathValue === parsed.root) throw new Error(`refusing to use filesystem root as a backup path: ${pathValue}`);
}

function assertSafeRestoreTarget(pathValue) {
  const parsed = parse(pathValue);
  if (pathValue === parsed.root) throw new Error(`refusing to replace filesystem root: ${pathValue}`);
  if (basename(pathValue).toLowerCase() !== 'generated') {
    throw new Error(`restore target must be a generated directory; got: ${pathValue}`);
  }
}

function assertOutputOutsideSource(outputRoot, sourceDir) {
  if (outputRoot === sourceDir || isSubPath(outputRoot, sourceDir)) {
    throw new Error('backup output must not be inside the generated source directory');
  }
}

function safeRelativePath(root, filePath) {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('../') || rel === '..' || isAbsolute(rel)) {
    throw new Error(`unsafe backup path: ${filePath}`);
  }
  return rel;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        out.push({
          path: safeRelativePath(root, full),
          size: info.size,
          mtimeMs: Math.round(info.mtimeMs),
          sha256: await sha256File(full)
        });
      }
    }
  }
  if (existsSync(root)) await walk(root);
  return out;
}

function manifestSummary(files) {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, item) => sum + Number(item.size || 0), 0)
  };
}

export async function backupGenerated({
  source = DEFAULT_SOURCE,
  output = DEFAULT_OUTPUT,
  name = `image-studio-generated-${timestampForName()}`
} = {}) {
  const sourceDir = resolve(source);
  const outputRoot = resolve(output);
  const snapshotRoot = resolve(outputRoot, name);
  const tempRoot = `${snapshotRoot}.tmp-${process.pid}`;
  const snapshotDataDir = join(tempRoot, SNAPSHOT_DATA_DIR);

  assertSafeSnapshotPath(outputRoot);
  assertOutputOutsideSource(outputRoot, sourceDir);
  if (!existsSync(sourceDir)) throw new Error(`generated source directory not found: ${sourceDir}`);
  if (existsSync(snapshotRoot)) throw new Error(`backup snapshot already exists: ${snapshotRoot}`);

  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  try {
    await cp(sourceDir, snapshotDataDir, { recursive: true, force: false, errorOnExist: true });
    const files = await listFiles(snapshotDataDir);
    const manifest = {
      version: 1,
      app: 'image-studio',
      kind: 'generated-backup',
      createdAt: new Date().toISOString(),
      source: sourceDir,
      dataDir: SNAPSHOT_DATA_DIR,
      ...manifestSummary(files),
      files
    };
    await writeFile(join(tempRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(tempRoot, snapshotRoot);
    return { path: snapshotRoot, manifest };
  } catch (err) {
    await rm(tempRoot, { recursive: true, force: true });
    throw err;
  }
}

async function readManifest(snapshotRoot) {
  const manifestPath = join(snapshotRoot, MANIFEST_FILE);
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1 || manifest.kind !== 'generated-backup' || manifest.dataDir !== SNAPSHOT_DATA_DIR) {
    throw new Error('invalid generated backup manifest');
  }
  if (!Array.isArray(manifest.files)) throw new Error('invalid generated backup file list');
  return manifest;
}

async function verifySnapshot(snapshotRoot, manifest) {
  const dataDir = join(snapshotRoot, SNAPSHOT_DATA_DIR);
  if (!existsSync(dataDir)) throw new Error(`backup data directory missing: ${dataDir}`);
  for (const item of manifest.files) {
    const rel = String(item.path || '').replace(/\\/g, '/');
    if (!rel || rel.startsWith('../') || rel.includes('/../') || isAbsolute(rel)) {
      throw new Error(`unsafe path in backup manifest: ${item.path}`);
    }
    const full = join(dataDir, rel);
    const info = await stat(full);
    if (!info.isFile()) throw new Error(`backup entry is not a file: ${rel}`);
    if (Number(item.size) !== info.size) throw new Error(`backup entry size mismatch: ${rel}`);
    const digest = await sha256File(full);
    if (item.sha256 && digest !== item.sha256) throw new Error(`backup entry checksum mismatch: ${rel}`);
  }
}

async function directoryHasEntries(dir) {
  if (!existsSync(dir)) return false;
  return (await readdir(dir)).length > 0;
}

export async function restoreGenerated({
  snapshot,
  target = DEFAULT_SOURCE,
  yes = false,
  preRestoreOutput = DEFAULT_OUTPUT
} = {}) {
  if (!snapshot) throw new Error('restore requires a backup snapshot path');
  if (!yes) throw new Error('restore requires explicit --yes confirmation');

  const snapshotRoot = resolve(snapshot);
  const targetDir = resolve(target);
  const tempTarget = `${targetDir}.restore-tmp-${process.pid}`;

  assertSafeSnapshotPath(snapshotRoot);
  assertSafeRestoreTarget(targetDir);
  const manifest = await readManifest(snapshotRoot);
  await verifySnapshot(snapshotRoot, manifest);

  let preRestoreBackup = null;
  if (await directoryHasEntries(targetDir)) {
    preRestoreBackup = await backupGenerated({
      source: targetDir,
      output: preRestoreOutput,
      name: `pre-restore-generated-${timestampForName()}`
    });
  }

  await rm(tempTarget, { recursive: true, force: true });
  await mkdir(dirname(targetDir), { recursive: true });
  try {
    await cp(join(snapshotRoot, SNAPSHOT_DATA_DIR), tempTarget, { recursive: true, force: false, errorOnExist: true });
    await rm(targetDir, { recursive: true, force: true });
    await rename(tempTarget, targetDir);
    return { target: targetDir, manifest, preRestoreBackup };
  } catch (err) {
    await rm(tempTarget, { recursive: true, force: true });
    throw err;
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === 'yes' || key === 'help') {
      opts[key] = true;
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    opts[key] = value;
    i += 1;
  }
  return opts;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/generated-backup.js backup [--source generated] [--output backups/generated] [--name NAME]\n  node scripts/generated-backup.js restore SNAPSHOT --yes [--target generated] [--pre-restore-output backups/generated]\n\nBack up or restore the runtime generated/ directory (SQLite, WAL/SHM, images, prompt examples, and temporary reference files). Stop the app before backup/restore for the most consistent snapshot.`);
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (!opts.command || opts.help) {
    printHelp();
    return;
  }
  if (opts.command === 'backup') {
    const result = await backupGenerated({ source: opts.source, output: opts.output, name: opts.name });
    console.log(JSON.stringify({ ok: true, path: result.path, fileCount: result.manifest.fileCount, totalBytes: result.manifest.totalBytes }, null, 2));
    return;
  }
  if (opts.command === 'restore') {
    const result = await restoreGenerated({
      snapshot: opts._[0],
      target: opts.target,
      yes: Boolean(opts.yes),
      preRestoreOutput: opts['pre-restore-output'] || opts.preRestoreOutput
    });
    console.log(JSON.stringify({
      ok: true,
      target: result.target,
      restoredFileCount: result.manifest.fileCount,
      preRestoreBackup: result.preRestoreBackup?.path || null
    }, null, 2));
    return;
  }
  throw new Error(`unknown command: ${opts.command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  });
}
