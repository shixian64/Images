import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir;
let prevCwd;
let db;
let auth;
let audit;
let jobQueue;
let jobsRoutes;
let queueEventsService;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-jobs-route-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  audit = await import('../services/audit.js');
  jobQueue = await import('../services/job-queue.js');
  jobsRoutes = await import('../routes/jobs.js');
  queueEventsService = await import('../services/queue-events.js');
  db.migrate();
});

after(() => {
  try { jobQueue?.stopJobQueue?.(); } catch {}
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

class SseResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = null;
    this.headers = {};
    this.chunks = [];
    this.destroyed = false;
    this.writableEnded = false;
  }

  setHeader(key, value) {
    this.headers[String(key).toLowerCase()] = value;
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headers = { ...this.headers, ...headers };
  }

  flushHeaders() {
    this.flushed = true;
  }

  write(chunk = '') {
    this.chunks.push(String(chunk));
    return true;
  }

  end(chunk = '') {
    if (chunk) this.write(chunk);
    this.writableEnded = true;
  }
}

function jsonReq(user, method, body) {
  const raw = Buffer.from(JSON.stringify(body || {}));
  return {
    method,
    session: { user },
    headers: { 'user-agent': 'jobs-route-test' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield raw;
    }
  };
}

test('admin queue settings updates are audited', async () => {
  const admin = auth.register({
    username: 'jobs_route_admin',
    email: 'jobs_route_admin@example.com',
    password: 'longenough1'
  });
  assert.equal(admin.role, 'admin');

  const res = captureRes();
  await jobsRoutes.handleJobsRoute(
    jsonReq(admin, 'PUT', { maintenance_mode: true, max_pending_global: 123 }),
    res,
    '/api/admin/jobs/settings',
    new URL('http://localhost/api/admin/jobs/settings')
  );

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.settings.maintenance_mode, true);
  assert.equal(body.settings.max_pending_global, 123);

  const entry = audit.listRecent(5).find((item) => item.action === 'queue.settings_update');
  assert.ok(entry);
  assert.equal(entry.actorId, admin.id);
  assert.equal(entry.targetType, 'system');
  assert.equal(entry.targetId, 'queue.settings');
  assert.equal(entry.meta.patch.maintenance_mode, true);
  assert.equal(entry.meta.patch.max_pending_global, 123);
  assert.equal(entry.meta.settings.maintenance_mode, true);
  assert.equal(entry.meta.settings.max_pending_global, 123);
});

test('admin job detail reads the requested job directly by id', async () => {
  const owner = auth.register({
    username: 'jobs_route_owner',
    email: 'jobs_route_owner@example.com',
    password: 'longenough1'
  });
  const admin = auth.register({
    username: 'jobs_route_detail_admin',
    email: 'jobs_route_detail_admin@example.com',
    password: 'longenough1',
    adminBootstrapToken: ''
  });
  // 第一个测试已创建首个管理员；这里通过 DB 提权一个独立账号用于管理员详情路由测试。
  const freshAdmin = db.users.updateRole(admin.id, 'admin');
  const job = db.generationJobs.create({
    userId: owner.id,
    status: 'queued',
    priority: 7,
    payload: { prompt: 'direct admin detail', n: 1 },
    promptPreview: 'direct admin detail',
    profileName: 'Route Test',
    model: 'test-image-model',
    n: 1
  });

  const res = captureRes();
  await jobsRoutes.handleJobsRoute(
    { method: 'GET', session: { user: freshAdmin }, headers: {}, socket: { remoteAddress: '127.0.0.1' } },
    res,
    `/api/admin/jobs/${encodeURIComponent(job.id)}`,
    new URL(`http://localhost/api/admin/jobs/${encodeURIComponent(job.id)}`)
  );

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.job.id, job.id);
  assert.equal(body.job.userId, owner.id);
  assert.equal(body.job.user.username, owner.username);
  assert.equal(body.job.priority, 7);
});

test('user job stream replays persisted queue events after cursor', async () => {
  const owner = auth.register({
    username: 'jobs_route_replay_owner',
    email: 'jobs_route_replay_owner@example.com',
    password: 'longenough1'
  });
  const first = db.queueEvents.create({
    scope: 'user',
    event: 'job',
    userId: owner.id,
    jobId: 'old-job',
    payload: { id: 'old-job', status: 'queued' }
  });
  const second = db.queueEvents.create({
    scope: 'user',
    event: 'job',
    userId: owner.id,
    jobId: 'new-job',
    payload: { id: 'new-job', status: 'running' }
  });

  const res = new SseResponse();
  await jobsRoutes.handleJobsRoute(
    { method: 'GET', session: { user: owner }, headers: {}, socket: { remoteAddress: '127.0.0.1' } },
    res,
    '/api/jobs/stream',
    new URL(`http://localhost/api/jobs/stream?after=${first.id}`)
  );
  res.emit('close');

  const text = res.chunks.join('');
  assert.equal(res.statusCode, 200);
  assert.match(text, new RegExp(`id: ${second.id}\\nevent: job`));
  assert.match(text, /"id":"new-job"/);
  assert.doesNotMatch(text, /"id":"old-job"/);
  assert.match(text, /event: snapshot/);
});

test('admin job stream replays admin events without user-scope leakage', async () => {
  const user = auth.register({
    username: 'jobs_route_replay_user_scope',
    email: 'jobs_route_replay_user_scope@example.com',
    password: 'longenough1'
  });
  const adminUser = auth.register({
    username: 'jobs_route_replay_admin',
    email: 'jobs_route_replay_admin@example.com',
    password: 'longenough1',
    adminBootstrapToken: ''
  });
  const admin = db.users.updateRole(adminUser.id, 'admin');
  const cursor = db.queueEvents.latestId();
  const userOnly = db.queueEvents.create({
    scope: 'user',
    event: 'job',
    userId: user.id,
    jobId: 'user-only-job',
    payload: { id: 'user-only-job', secret: 'not for admin replay' }
  });
  const adminEvent = db.queueEvents.create({
    scope: 'admin',
    event: 'job',
    userId: user.id,
    jobId: 'admin-job',
    payload: { id: 'admin-job', user: { id: user.id, username: user.username } }
  });

  const res = new SseResponse();
  await jobsRoutes.handleJobsRoute(
    { method: 'GET', session: { user: admin }, headers: {}, socket: { remoteAddress: '127.0.0.1' } },
    res,
    '/api/admin/jobs/stream',
    new URL(`http://localhost/api/admin/jobs/stream?after=${cursor}`)
  );
  res.emit('close');

  const text = res.chunks.join('');
  assert.equal(res.statusCode, 200);
  assert.ok(userOnly.id < adminEvent.id);
  assert.match(text, new RegExp(`id: ${adminEvent.id}\\nevent: job`));
  assert.match(text, /"id":"admin-job"/);
  assert.doesNotMatch(text, /user-only-job/);
  assert.doesNotMatch(text, /not for admin replay/);
});

test('queue job emissions persist replay rows for user and admin streams', () => {
  const owner = auth.register({
    username: 'jobs_route_emit_owner',
    email: 'jobs_route_emit_owner@example.com',
    password: 'longenough1'
  });
  const job = db.generationJobs.create({
    userId: owner.id,
    status: 'queued',
    priority: 5,
    payload: { prompt: 'persist emitted event', n: 1 },
    promptPreview: 'persist emitted event',
    profileName: 'Replay Test',
    model: 'test-image-model',
    n: 1
  });
  const cursor = db.queueEvents.latestId();

  queueEventsService.emitJob({ ...job, user_username: owner.username, user_email: owner.email, user_role: owner.role });

  const userRows = db.queueEvents.listForUser(owner.id, { afterId: cursor });
  const adminRows = db.queueEvents.listForAdmin({ afterId: cursor });
  assert.equal(userRows.length, 1);
  assert.equal(userRows[0].payload.id, job.id);
  assert.equal(userRows[0].payload.user, undefined);
  assert.equal(adminRows.length, 1);
  assert.equal(adminRows[0].payload.id, job.id);
  assert.equal(adminRows[0].payload.user.username, owner.username);
});
