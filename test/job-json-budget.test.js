import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let auth;
let jobDb;
let userSeq = 0;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-job-json-budget-'));
  mkdirSync(join(workDir, 'generated'), { recursive: true });
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  jobDb = await import('../services/db-generation-jobs.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function createUser() {
  userSeq += 1;
  const suffix = String(userSeq);
  return auth.register({
    username: `job_budget_${suffix}`,
    email: `job-budget-${suffix}@example.com`,
    password: 'longenough1'
  });
}

function createJob(user) {
  return db.generationJobs.create({
    userId: user.id,
    status: 'queued',
    priority: 0,
    payload: {
      prompt: 'keep the runnable payload intact',
      n: 1
    },
    promptPreview: 'keep the runnable payload intact',
    profileName: 'Budget Test',
    model: 'test-image-model',
    n: 1
  });
}

test('generation job result and progress JSON are capped before persistence', () => {
  const user = createUser();
  const job = createJob(user);
  const largeResult = {
    data: Array.from({ length: 120 }, (_, i) => ({
      index: i,
      text: 'result-payload-'.repeat(160)
    })),
    saved: []
  };
  const largeProgress = {
    stage: 'saving',
    message: 'progress-payload-'.repeat(1200)
  };

  const updated = db.generationJobs.updateStatus(job.id, 'succeeded', {
    finishedAt: Date.now(),
    result: largeResult,
    progress: largeProgress
  });

  assert.equal(updated.payload.prompt, 'keep the runnable payload intact');
  assert.equal(updated.result.truncated, true);
  assert.equal(updated.progress.truncated, true);
  assert.ok(updated.result.originalJsonChars > jobDb.JOB_RESULT_MAX_JSON_CHARS);
  assert.ok(updated.progress.originalJsonChars > jobDb.JOB_PROGRESS_MAX_JSON_CHARS);
  assert.ok(JSON.stringify(updated.result).length <= jobDb.JOB_RESULT_MAX_JSON_CHARS);
  assert.ok(JSON.stringify(updated.progress).length <= jobDb.JOB_PROGRESS_MAX_JSON_CHARS);

  const sqlite = new DatabaseSync(db.dbPaths.file, { readOnly: true });
  try {
    const row = sqlite.prepare(`
      SELECT
        length(payload_json) AS payload_chars,
        length(result_json) AS result_chars,
        length(progress_json) AS progress_chars
      FROM generation_jobs
      WHERE id = ?
    `).get(job.id);
    assert.ok(row.payload_chars < jobDb.JOB_PROGRESS_MAX_JSON_CHARS);
    assert.ok(row.result_chars <= jobDb.JOB_RESULT_MAX_JSON_CHARS);
    assert.ok(row.progress_chars <= jobDb.JOB_PROGRESS_MAX_JSON_CHARS);
  } finally {
    sqlite.close();
  }
});

test('generation job ordinary result and progress JSON remain unchanged', () => {
  const user = createUser();
  const job = createJob(user);
  const result = { data: [{ local_url: '/gallery-files/users/u/images/a.png' }], saved: [{ id: 'img-1' }] };
  const progress = { stage: 'succeeded', message: '生成完成' };

  const updated = db.generationJobs.updateStatus(job.id, 'succeeded', {
    finishedAt: Date.now(),
    result,
    progress
  });

  assert.deepEqual(updated.result, result);
  assert.deepEqual(updated.progress, progress);
});
