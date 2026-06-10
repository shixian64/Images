import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INCLUDE_DIRS = [
  'middleware',
  'public',
  'routes',
  'scripts',
  'services',
  'shared',
  'test',
  'utils'
];
const ROOT_FILES = ['server.js'];
const SKIP_DIRS = new Set(['.git', 'generated', 'node_modules']);

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectJsFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

function existingPath(name) {
  const full = path.join(ROOT, name);
  try {
    statSync(full);
    return full;
  } catch {
    return null;
  }
}

const files = [
  ...ROOT_FILES.map(existingPath).filter(Boolean),
  ...INCLUDE_DIRS.map(existingPath).filter(Boolean).flatMap((dir) => collectJsFiles(dir))
].sort((a, b) => a.localeCompare(b));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    failed += 1;
    const rel = path.relative(ROOT, file);
    process.stderr.write(`\nSyntax check failed: ${rel}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (failed) {
  process.stderr.write(`\n${failed} JavaScript file(s) failed syntax checks.\n`);
  process.exit(1);
}

process.stdout.write(`Checked ${files.length} JavaScript files.\n`);
