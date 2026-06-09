import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { dbPaths, healthCheck as dbHealthCheck } from './db.js';
import { getQueueSettings, queueRuntimeInfo } from './job-queue.js';

async function diskHealthCheck(dir = dbPaths.dir) {
  const probePath = join(dir, `.health-${process.pid}-${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, fsConstants.R_OK | fsConstants.W_OK);
    await writeFile(probePath, 'ok', { flag: 'wx' });
    await unlink(probePath);
    return { ok: true, path: dir, writable: true };
  } catch (err) {
    try { await unlink(probePath); } catch {}
    return { ok: false, path: dir, writable: false, error: err?.message || String(err) };
  }
}

function queueHealthCheck() {
  try {
    const settings = getQueueSettings();
    return {
      ok: true,
      maintenanceMode: Boolean(settings.maintenance_mode),
      runtime: queueRuntimeInfo()
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function runtimeHealthSnapshot({
  uptimeSec = Math.round(process.uptime()),
  dbCheck = dbHealthCheck,
  diskCheck = diskHealthCheck,
  queueCheck = queueHealthCheck
} = {}) {
  const db = dbCheck();
  const disk = await diskCheck();
  const queue = queueCheck();
  const ok = Boolean(db?.ok && disk?.ok && queue?.ok);
  return {
    ok,
    uptimeSec,
    db,
    disk,
    queue
  };
}

export default runtimeHealthSnapshot;
