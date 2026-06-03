import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let prevEnv = {};
let db;
let auth;
let quota;
let jobQueue;
let interfaceDefaults;
let referenceImages;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const ENV_KEYS = [
  'ALLOW_INSECURE_UPSTREAMS',
  'ALLOW_PRIVATE_UPSTREAMS',
  'DEFAULT_DAILY_LIMIT',
  'DEFAULT_MONTHLY_LIMIT',
  'DEFAULT_STORAGE_LIMIT_MB',
  'DEFAULT_CONCURRENT_LIMIT'
];

before(async () => {
  prevCwd = process.cwd();
  prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  process.env.DEFAULT_DAILY_LIMIT = '3';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-jobq-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  quota = await import('../services/quota.js');
  jobQueue = await import('../services/job-queue.js');
  interfaceDefaults = await import('../services/interface-defaults.js');
  referenceImages = await import('../services/reference-images.js');
  db.migrate();
  interfaceDefaults.setGlobalInterfaceConfig({
    enabled: true,
    name: 'System Test',
    image: {
      baseUrl: 'http://127.0.0.1:8787',
      apiKey: 'sk-system-image',
      defaultModel: 'test-image-model'
    },
    chat: { apiKey: 'sk-system-chat' }
  }, 'test');
});

after(() => {
  try { jobQueue?.stopJobQueue?.(); } catch {}
  process.chdir(prevCwd);
  for (const key of ENV_KEYS) {
    if (prevEnv[key] === undefined) delete process.env[key];
    else process.env[key] = prevEnv[key];
  }
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function user(name) {
  return auth.register({ username: name, email: `${name}@example.com`, password: 'longenough1' });
}

function payload(n = 1) {
  return {
    useSystemDefault: false,
    baseUrl: 'http://127.0.0.1:8787',
    apiKey: 'sk-test',
    model: 'test-image-model',
    prompt: `test prompt ${n}`,
    n
  };
}

function systemPayload(n = 1) {
  return {
    useSystemDefault: true,
    model: 'test-image-model',
    prompt: `system test prompt ${n}`,
    n
  };
}

async function waitFor(fn, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}

test('queued jobs persist only safe worker payload fields', async () => {
  const u = user('safe_payload');
  const job = await jobQueue.enqueueImageGeneration({
    ...payload(1),
    imageApiKey: 'sk-image',
    api_key: 'sk-alt',
    token: 'secret-token',
    extraHeaders: { Authorization: 'Bearer secret-token' },
    messages: [{ role: 'user', content: 'chat-only context' }],
    size: '1024x1024',
    quality: 'high',
    output_format: 'png'
  }, u);

  const stored = db.generationJobs.findById(job.id).payload;
  assert.equal(stored.prompt, 'test prompt 1');
  assert.equal(stored.model, 'test-image-model');
  assert.equal(stored.n, 1);
  assert.equal(stored.size, '1024x1024');
  assert.equal(stored.quality, 'high');
  assert.equal(stored.output_format, 'png');
  assert.equal(stored.apiKey, undefined);
  assert.equal(stored.imageApiKey, undefined);
  assert.equal(stored.api_key, undefined);
  assert.equal(stored.token, undefined);
  assert.equal(stored.extraHeaders, undefined);
  assert.equal(stored.messages, undefined);
  assert.equal(stored.baseUrl, undefined);
  assert.equal(stored.imageBaseUrl, undefined);
  jobQueue.cancelJob(job.id, u);
});

test('enqueue rejects comic projects owned by another user', async () => {
  const owner = user('job_comic_owner');
  const requester = user('job_comic_requester');
  const projectId = 'job-foreign-comic-project';
  db.comicProjects.upsert({
    id: projectId,
    userId: owner.id,
    title: 'Foreign project',
    story: 'Other story',
    panelCount: 1,
    storyboard: { title: 'Foreign project', panels: [{ beat: 'one' }] }
  });

  await assert.rejects(
    () => jobQueue.enqueueImageGeneration({ ...payload(1), comicProjectId: projectId }, requester),
    /comic project not found/
  );
});

test('compactGenerationResult strips inline b64_json from failed save items', () => {
  const input = {
    data: [
      {
        b64_json: 'a'.repeat(4096),
        url: 'https://upstream.example/failed-save.png?token=secret',
        save_error: 'decoded image too large',
        revised_prompt: 'kept'
      },
      {
        b64_json: 'b'.repeat(4096),
        url: 'https://upstream.example/signed-image.png?token=secret',
        local_url: '/gallery-files/users/u/images/x.png',
        gallery_id: 'img-1'
      }
    ]
  };

  const compacted = jobQueue.compactGenerationResult(input);

  assert.equal(Object.hasOwn(compacted.data[0], 'b64_json'), false);
  assert.equal(Object.hasOwn(compacted.data[0], 'url'), false);
  assert.equal(compacted.data[0].save_error, 'decoded image too large');
  assert.equal(compacted.data[0].revised_prompt, 'kept');
  assert.equal(Object.hasOwn(compacted.data[1], 'b64_json'), false);
  assert.equal(Object.hasOwn(compacted.data[1], 'url'), false);
  assert.equal(compacted.data[1].local_url, '/gallery-files/users/u/images/x.png');
  assert.equal(input.data[0].b64_json.length, 4096, 'source object should not be mutated');
  assert.equal(input.data[0].url, 'https://upstream.example/failed-save.png?token=secret', 'source object should not be mutated');
  assert.equal(input.data[1].url, 'https://upstream.example/signed-image.png?token=secret', 'source object should not be mutated');
});

test('enqueue quota check counts already queued system-default calls', async () => {
  const u = user('queued_quota');

  const first = await jobQueue.enqueueImageGeneration(systemPayload(2), u);
  assert.equal(first.status, 'queued');

  await assert.rejects(
    () => jobQueue.enqueueImageGeneration(systemPayload(2), u),
    (err) => err.statusCode === 429 && err.code === 'daily_limit_exceeded'
  );

  const check = quota.assertCanGenerate(u.id, { n: 2, includeQueued: true });
  assert.equal(check.ok, false);
  jobQueue.cancelJob(first.id, u);
});

test('custom interface jobs bypass daily/monthly call quota checks', async () => {
  const u = user('custom_quota_bypass');
  quota.recordSuccess(u.id, { calls: 3, images: 3 });

  const job = await jobQueue.enqueueImageGeneration(payload(2), u);

  assert.equal(job.status, 'queued');
  assert.equal(job.payload.interfaceMode, 'custom');
  assert.equal(quota.usageSnapshot(u.id).today.calls, 3);
  jobQueue.cancelJob(job.id, u);
});

test('custom interface jobs still respect storage quota', async () => {
  const u = user('custom_storage_managed');
  quota.patchUserQuota(u.id, { storage_limit_mb: 1 }, 'test');
  db.images.insert({
    id: 'custom-storage-existing',
    userId: u.id,
    createdAt: new Date().toISOString(),
    filename: 'existing.png',
    path: `users/${u.id}/images/2026-04-29/existing.png`,
    mimeType: 'image/png',
    bytes: 1024 * 1024,
    isPublic: false,
    prompt: 'existing storage',
    model: 'test-image-model',
    sourceType: 'b64_json',
    index: 1
  });

  await assert.rejects(
    () => jobQueue.enqueueImageGeneration(payload(1), u),
    (err) => err.statusCode === 429 && err.code === 'storage_limit_exceeded'
  );
});

test('queued jobs can be cancelled before execution without usage', async () => {
  const u = user('cancel_queued');
  const job = await jobQueue.enqueueImageGeneration(payload(1), u);

  const cancelled = jobQueue.cancelJob(job.id, u);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(quota.usageSnapshot(u.id).today.calls, 0);
});

test('queue wait timeout emits a terminal job update', async () => {
  const u = user('wait_timeout');
  const job = await jobQueue.enqueueImageGeneration(payload(1), u);
  let cleanup = () => {};
  const updatePromise = new Promise((resolve) => {
    cleanup = jobQueue.onJobUpdate(job.id, (updated) => {
      if (updated.status === 'cancelled') resolve(updated);
    });
  });

  jobQueue.setQueueSettings({ max_wait_ms: 1, maintenance_mode: false });
  await new Promise((resolve) => setTimeout(resolve, 10));
  jobQueue.startJobQueue();

  const updated = await Promise.race([
    updatePromise,
    waitFor(() => {
      const current = jobQueue.getJobForUser(job.id, u);
      return current.status === 'cancelled' ? current : null;
    })
  ]);

  cleanup();
  assert.equal(updated?.status, 'cancelled');
  assert.equal(updated?.error, 'queue_wait_timeout');
  assert.equal(updated?.progress?.stage, 'cancelled');
  jobQueue.stopJobQueue();
  jobQueue.setQueueSettings({ max_wait_ms: 0, maintenance_mode: false });
});

test('expired reference cleanup preserves queued job files', async () => {
  const u = user('reference_cleanup_queued');
  const job = await jobQueue.enqueueImageGeneration(payload(1), u);
  const queuedDir = join(workDir, 'generated', 'tmp', 'jobs', job.id, 'references');
  const orphanDir = join(workDir, 'generated', 'tmp', 'jobs', 'orphan-reference-job', 'references');
  mkdirSync(queuedDir, { recursive: true });
  mkdirSync(orphanDir, { recursive: true });
  writeFileSync(join(queuedDir, 'reference.png'), 'queued');
  writeFileSync(join(orphanDir, 'reference.png'), 'orphan');

  const removed = await referenceImages.cleanupExpiredReferenceJobFiles({
    now: Date.now() + 60_000,
    ttlMs: 1
  });

  assert.equal(removed, 1);
  assert.equal(existsSync(queuedDir), true);
  assert.equal(existsSync(orphanDir), false);
  jobQueue.cancelJob(job.id, u);
});

test('runnableReferenceImages only accepts staged job reference paths', () => {
  assert.throws(
    () => referenceImages.runnableReferenceImages([
      { relPath: 'users/someone/images/2026-06-01/private.png' }
    ]),
    /invalid staged reference path/
  );

  const [item] = referenceImages.runnableReferenceImages([
    { relPath: 'tmp/jobs/job-123/references/ref.png' }
  ]);
  assert.match(item.absPath, /tmp[\\/]+jobs[\\/]+job-123[\\/]+references[\\/]+ref\.png$/);
});

test('system jobs with gallery references can be retried after staged files were cleaned', async () => {
  const u = user('retry_gallery_reference');
  const date = '2026-06-01';
  const fileName = 'source.png';
  const relPath = `users/${u.id}/images/${date}/${fileName}`;
  const absDir = join(workDir, 'generated', 'users', u.id, 'images', date);
  mkdirSync(absDir, { recursive: true });
  writeFileSync(join(absDir, fileName), PNG_BYTES);
  db.images.insert({
    id: 'retry-gallery-reference-source',
    userId: u.id,
    createdAt: new Date().toISOString(),
    filename: fileName,
    path: relPath,
    mimeType: 'image/png',
    bytes: PNG_BYTES.length,
    isPublic: false,
    prompt: 'source',
    model: 'test-image-model',
    sourceType: 'b64_json',
    index: 1
  });

  const job = await jobQueue.enqueueImageGeneration({
    ...systemPayload(1),
    references: [{ type: 'gallery', id: 'retry-gallery-reference-source' }]
  }, u);
  const stagedDir = join(workDir, 'generated', 'tmp', 'jobs', job.id, 'references');
  assert.equal(existsSync(stagedDir), true);

  db.generationJobs.updateStatus(job.id, 'failed', {
    finishedAt: Date.now(),
    errorMessage: 'boom',
    progress: { stage: 'failed', message: 'boom' }
  });
  await referenceImages.cleanupReferenceJobFiles(job.id);
  assert.equal(existsSync(stagedDir), false);

  const retried = await jobQueue.retryJob(job.id, u);
  assert.equal(retried.status, 'queued');
  assert.equal(existsSync(stagedDir), true);
  assert.equal(retried.payload.referenceImages[0].originalId, 'retry-gallery-reference-source');
  assert.equal(retried.payload.referenceImages[0].relPath, undefined);
  jobQueue.cancelJob(job.id, u);
});

test('startup recovery marks stale running jobs as failed', async () => {
  const u = user('recover_running');
  const job = await jobQueue.enqueueImageGeneration(payload(1), u);
  db.generationJobs.updateStatus(job.id, 'running', { startedAt: Date.now(), attempts: 1 });
  const recoveredDir = join(workDir, 'generated', 'tmp', 'jobs', job.id, 'references');
  mkdirSync(recoveredDir, { recursive: true });
  writeFileSync(join(recoveredDir, 'reference.png'), 'running');

  jobQueue.setQueueSettings({ maintenance_mode: true });
  jobQueue.startJobQueue();
  const recovered = jobQueue.getJobForUser(job.id, u);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.error, 'server_restart');
  const cleaned = await waitFor(() => !existsSync(recoveredDir));
  assert.equal(cleaned, true);
  jobQueue.stopJobQueue();
  jobQueue.setQueueSettings({ maintenance_mode: false });
});

test('queued batch can skip a saturated user and pick the next user', async () => {
  const a = user('fair_a');
  const b = user('fair_b');
  const jobA = await jobQueue.enqueueImageGeneration(payload(1), a);
  const jobB = await jobQueue.enqueueImageGeneration(payload(1), b);

  const [picked] = db.generationJobs.queuedBatch(1, [a.id]);
  assert.equal(picked.id, jobB.id);
  assert.notEqual(picked.id, jobA.id);
});
