import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { dbPaths, dbRuntimeInfo, healthCheck as dbHealthCheck } from './db.js';
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

async function eventLoopHealthCheck({ thresholdMs = 250 } = {}) {
  const started = performance.now();
  await new Promise((resolve) => setImmediate(resolve));
  const lagMs = Math.max(0, performance.now() - started);
  return {
    ok: lagMs <= thresholdMs,
    lagMs: Number(lagMs.toFixed(1)),
    thresholdMs
  };
}

export async function runtimeHealthSnapshot({
  uptimeSec = Math.round(process.uptime()),
  dbCheck = dbHealthCheck,
  dbRuntime = dbRuntimeInfo,
  diskCheck = diskHealthCheck,
  queueCheck = queueHealthCheck,
  eventLoopCheck = eventLoopHealthCheck
} = {}) {
  const dbProbe = dbCheck();
  const db = dbProbe?.runtime
    ? dbProbe
    : { ...(dbProbe || { ok: false }), runtime: dbRuntime() };
  const disk = await diskCheck();
  const queue = queueCheck();
  const eventLoop = await eventLoopCheck();
  const ok = Boolean(db?.ok && disk?.ok && queue?.ok && eventLoop?.ok);
  return {
    ok,
    uptimeSec,
    db,
    disk,
    queue,
    eventLoop
  };
}

export default runtimeHealthSnapshot;
