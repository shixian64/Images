import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let workDir;
let prevCwd;
let prevMaxImagesPerRequest;
let db;
let auth;
let quota;
let generate;
let jobQueue;
let interfaceDefaults;
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const skLike = (suffix) => ['sk', suffix].join('-');

function jsonReq(body, sessionUser) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.session = { user: sessionUser };
  return req;
}

function captureRes() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

async function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

before(async () => {
  prevCwd = process.cwd();
  prevMaxImagesPerRequest = process.env.MAX_IMAGES_PER_REQUEST;
  process.env.MAX_IMAGES_PER_REQUEST = '4';
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-generate-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  quota = await import('../services/quota.js');
  generate = await import('../routes/generate.js');
  jobQueue = await import('../services/job-queue.js');
  interfaceDefaults = await import('../services/interface-defaults.js');

  db.migrate();
  jobQueue.startJobQueue();
  user = auth.register({ username: 'gen_user', email: 'gen_user@example.com', password: 'longenough1' });
});

after(() => {
  try { jobQueue?.stopJobQueue?.(); } catch {}
  process.chdir(prevCwd);
  if (prevMaxImagesPerRequest === undefined) delete process.env.MAX_IMAGES_PER_REQUEST;
  else process.env.MAX_IMAGES_PER_REQUEST = prevMaxImagesPerRequest;
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

async function waitFor(fn, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}

test('handleGenerate fans out custom interface n>1 without consuming managed quota', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '4',
    DEFAULT_MONTHLY_LIMIT: undefined,
    DEFAULT_STORAGE_LIMIT_MB: undefined,
    IMAGE_GENERATION_BATCH_CONCURRENCY: '3'
  }, async () => {
    const upstreamPayloads = [];
    const server = http.createServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/images/generations');

      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const payload = JSON.parse(raw);
        upstreamPayloads.push(payload);
        const image = {
          b64_json: Buffer.from(PNG_BYTES).toString('base64'),
          revised_prompt: `image ${upstreamPayloads.length}`
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [image] }));
      });
    });
    await listen(server);

    try {
      const { port } = server.address();
      const req = jsonReq({
        imageBaseUrl: `http://127.0.0.1:${port}`,
        imageApiKey: skLike('test'),
        prompt: 'three small pngs',
        model: 'test-image-model',
        n: 3
      }, user);
      const res = captureRes();

      await generate.handleGenerate(req, res);

      assert.equal(res.statusCode, 202);
      const queued = JSON.parse(res.body);
      assert.equal(queued.status, 'queued');
      assert.ok(queued.jobId);

      const done = await waitFor(() => {
        const [job] = jobQueue.getUserJobs(user.id).filter((item) => item.id === queued.jobId);
        return job?.status === 'succeeded' ? job : null;
      });
      assert.equal(done?.status, 'succeeded');
      assert.equal(upstreamPayloads.length, 3);
      assert.deepEqual(upstreamPayloads.map((payload) => payload.n), [1, 1, 1]);
      assert.equal(done.result.data.length, 3);
      const usage = quota.usageSnapshot(user.id);
      assert.equal(usage.today.calls, 0);
      assert.equal(usage.today.images, 0);
      assert.equal(quota.assertCanGenerate(user.id, { n: 4 }).ok, true);
    } finally {
      await close(server);
    }
  });
});

test('handleGenerate records managed quota only for system default interface', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '4',
    DEFAULT_MONTHLY_LIMIT: undefined,
    DEFAULT_STORAGE_LIMIT_MB: undefined,
    IMAGE_GENERATION_BATCH_CONCURRENCY: '3'
  }, async () => {
    const upstreamPayloads = [];
    const server = http.createServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/images/generations');

      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const payload = JSON.parse(raw);
        upstreamPayloads.push(payload);
        const image = {
          b64_json: Buffer.from(PNG_BYTES).toString('base64'),
          revised_prompt: `system image ${upstreamPayloads.length}`
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [image] }));
      });
    });
    await listen(server);

    try {
      const { port } = server.address();
      interfaceDefaults.setGlobalInterfaceConfig({
        enabled: true,
        name: 'System Test',
        image: {
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: skLike('system-image'),
          defaultModel: 'test-image-model'
        },
        chat: { apiKey: skLike('system-chat') }
      }, 'test');

      const routeUser = auth.register({
        username: 'gen_system_quota_user',
        email: 'gen_system_quota_user@example.com',
        password: 'longenough1'
      });
      const req = jsonReq({
        useSystemDefault: true,
        prompt: 'three system pngs',
        model: 'test-image-model',
        n: 3
      }, routeUser);
      const res = captureRes();

      await generate.handleGenerate(req, res);

      assert.equal(res.statusCode, 202);
      const queued = JSON.parse(res.body);
      assert.ok(queued.jobId);

      const done = await waitFor(() => {
        const [job] = jobQueue.getUserJobs(routeUser.id).filter((item) => item.id === queued.jobId);
        return job?.status === 'succeeded' ? job : null;
      });
      assert.equal(done?.status, 'succeeded');
      assert.equal(upstreamPayloads.length, 3);
      assert.deepEqual(upstreamPayloads.map((payload) => payload.n), [1, 1, 1]);
      const usage = quota.usageSnapshot(routeUser.id);
      assert.equal(usage.today.calls, 3);
      assert.equal(usage.today.images, 3);
      assert.equal(quota.assertCanGenerate(routeUser.id, { n: 2 }).ok, false);
      assert.equal(quota.assertCanGenerate(routeUser.id, { n: 1 }).ok, true);
    } finally {
      await close(server);
    }
  });
});

test('custom interface image jobs still respect user concurrency quota', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '1',
    DEFAULT_CONCURRENT_LIMIT: '1'
  }, async () => {
    let upstreamHits = 0;
    let heldResponse = null;

    function sendImageOk(res) {
      const image = {
        b64_json: Buffer.from(PNG_BYTES).toString('base64'),
        revised_prompt: `concurrency image ${upstreamHits}`
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [image] }));
    }

    const server = http.createServer(async (req, res) => {
      upstreamHits += 1;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.includes('hold first custom job')) {
        heldResponse = res;
        return;
      }
      sendImageOk(res);
    });
    await listen(server);

    try {
      const { port } = server.address();
      const routeUser = auth.register({
        username: 'gen_custom_concurrent_user',
        email: 'gen_custom_concurrent_user@example.com',
        password: 'longenough1'
      });
      const basePayload = {
        imageBaseUrl: `http://127.0.0.1:${port}`,
        imageApiKey: skLike('custom-concurrency'),
        model: 'test-image-model',
        n: 1
      };

      const firstRes = captureRes();
      await generate.handleGenerate(jsonReq({
        ...basePayload,
        prompt: 'hold first custom job'
      }, routeUser), firstRes);
      assert.equal(firstRes.statusCode, 202);
      const first = JSON.parse(firstRes.body);

      const held = await waitFor(() => heldResponse);
      assert.ok(held, 'first custom job should reach upstream and stay running');

      const secondRes = captureRes();
      await generate.handleGenerate(jsonReq({
        ...basePayload,
        prompt: 'second custom job waits'
      }, routeUser), secondRes);
      assert.equal(secondRes.statusCode, 202);
      const second = JSON.parse(secondRes.body);

      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(upstreamHits, 1, 'second custom job must wait for the user concurrency slot');
      const queuedSecond = jobQueue.getJobForUser(second.jobId, routeUser);
      assert.equal(queuedSecond.status, 'queued');

      sendImageOk(heldResponse);
      heldResponse = null;

      const firstDone = await waitFor(() => {
        const job = jobQueue.getJobForUser(first.jobId, routeUser);
        return job.status === 'succeeded' ? job : null;
      });
      assert.equal(firstDone?.status, 'succeeded');

      const secondDone = await waitFor(() => {
        const job = jobQueue.getJobForUser(second.jobId, routeUser);
        return job.status === 'succeeded' ? job : null;
      });
      assert.equal(secondDone?.status, 'succeeded');
      assert.equal(upstreamHits, 2);
    } finally {
      if (heldResponse) sendImageOk(heldResponse);
      await close(server);
    }
  });
});

test('handleGenerate redacts upstream errors that echo API keys', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1'
  }, async () => {
    const secret = skLike('route-secret-123456');
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        error: { message: `upstream rejected Authorization: Bearer ${secret}` }
      }));
    });
    await listen(server);

    try {
      const routeUser = auth.register({
        username: 'gen_redact_user',
        email: 'gen_redact_user@example.com',
        password: 'longenough1'
      });
      const { port } = server.address();
      const req = jsonReq({
        imageBaseUrl: `http://127.0.0.1:${port}`,
        imageApiKey: secret,
        prompt: 'redact failure',
        model: 'test-image-model',
        n: 1
      }, routeUser);
      const res = captureRes();

      await generate.handleGenerate(req, res);

      assert.equal(res.statusCode, 202);
      const queued = JSON.parse(res.body);
      assert.ok(queued.jobId);

      const done = await waitFor(() => {
        const [job] = jobQueue.getUserJobs(routeUser.id).filter((j) => j.id === queued.jobId);
        return job?.status === 'failed' || job?.status === 'timeout' ? job : null;
      });
      assert.ok(done, 'job should have failed');
      assert.ok(!done.error.includes(secret), 'error must not contain raw secret');
      assert.match(done.error, /sk-r\*\*\*\*3456/);
    } finally {
      await close(server);
    }
  });
});
