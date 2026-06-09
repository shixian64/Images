import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backupGenerated, restoreGenerated } from '../scripts/generated-backup.js';

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'image-studio-generated-backup-'));
}

test('generated backup snapshots runtime files with a manifest', async () => {
  const root = tempRoot();
  try {
    const generated = join(root, 'generated');
    const output = join(root, 'backups');
    await mkdir(join(generated, 'users', 'u1', 'images', '2026-06-09'), { recursive: true });
    await mkdir(join(generated, 'tmp', 'jobs', 'j1', 'references'), { recursive: true });
    writeFileSync(join(generated, 'app.db'), 'sqlite bytes');
    writeFileSync(join(generated, 'app.db-wal'), 'wal bytes');
    writeFileSync(join(generated, 'users', 'u1', 'images', '2026-06-09', 'one.png'), 'png bytes');
    writeFileSync(join(generated, 'tmp', 'jobs', 'j1', 'references', 'ref.png'), 'ref bytes');

    const result = await backupGenerated({ source: generated, output, name: 'snapshot-one' });

    assert.equal(result.manifest.kind, 'generated-backup');
    assert.equal(result.manifest.fileCount, 4);
    assert.ok(existsSync(join(result.path, 'manifest.json')));
    assert.ok(existsSync(join(result.path, 'generated', 'app.db-wal')));
    assert.ok(result.manifest.files.some((item) => item.path === 'users/u1/images/2026-06-09/one.png'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated restore verifies manifest and preserves a pre-restore backup', async () => {
  const root = tempRoot();
  try {
    const generated = join(root, 'generated');
    const output = join(root, 'backups');
    const preRestoreOutput = join(root, 'pre-restore');
    await mkdir(join(generated, 'users', 'old', 'images'), { recursive: true });
    writeFileSync(join(generated, 'app.db'), 'old db');
    writeFileSync(join(generated, 'users', 'old', 'images', 'old.png'), 'old image');

    const backup = await backupGenerated({ source: generated, output, name: 'restore-source' });

    rmSync(generated, { recursive: true, force: true });
    await mkdir(join(generated, 'users', 'new', 'images'), { recursive: true });
    writeFileSync(join(generated, 'app.db'), 'new db');
    writeFileSync(join(generated, 'users', 'new', 'images', 'new.png'), 'new image');

    await assert.rejects(
      () => restoreGenerated({ snapshot: backup.path, target: generated, preRestoreOutput }),
      /--yes/
    );

    const restored = await restoreGenerated({ snapshot: backup.path, target: generated, yes: true, preRestoreOutput });

    assert.equal(readFileSync(join(generated, 'app.db'), 'utf8'), 'old db');
    assert.ok(existsSync(join(generated, 'users', 'old', 'images', 'old.png')));
    assert.equal(existsSync(join(generated, 'users', 'new', 'images', 'new.png')), false);
    assert.ok(restored.preRestoreBackup?.path);
    assert.equal(readFileSync(join(restored.preRestoreBackup.path, 'generated', 'app.db'), 'utf8'), 'new db');

    const manifest = JSON.parse(await readFile(join(restored.preRestoreBackup.path, 'manifest.json'), 'utf8'));
    assert.equal(manifest.fileCount, 2);
    assert.deepEqual((await readdir(preRestoreOutput)).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
