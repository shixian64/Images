import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let prevEnv = {};
let db;
let auth;
let quota;
let jobQueue;

const ENV_KEYS = ['ALLOW_INSECURE_UPSTREAMS', 'ALLOW_PRIVATE_UPSTREAMS', 'DEFAULT_DAILY_LIMIT'];

before(async () => {
  prevCwd = process.cwd();
  prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  process.env.DEFAULT_DAILY_LIMIT = '3';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-jobq-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  quota = await import('../services/quota.js');
  jobQueue = await import('../services/job-queue.js');
  db.migrate();
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

test('enqueue quota check counts already queued calls', async () => {
  const u = user('queued_quota');

  const first = await jobQueue.enqueueImageGeneration(payload(2), u);
  assert.equal(first.status, 'queued');

  await assert.rejects(
    () => jobQueue.enqueueImageGeneration(payload(2), u),
    (err) => err.statusCode === 429 && err.code === 'daily_limit_exceeded'
  );

  const check = quota.assertCanGenerate(u.id, { n: 2, includeQueued: true });
  assert.equal(check.ok, false);
  jobQueue.cancelJob(first.id, u);
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

test('startup recovery marks stale running jobs as failed', async () => {
  const u = user('recover_running');
  const job = await jobQueue.enqueueImageGeneration(payload(1), u);
  db.generationJobs.updateStatus(job.id, 'running', { startedAt: Date.now(), attempts: 1 });

  jobQueue.setQueueSettings({ maintenance_mode: true });
  jobQueue.startJobQueue();
  const recovered = jobQueue.getJobForUser(job.id, u);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.error, 'server_restart');
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
