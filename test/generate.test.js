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

test('handleGenerate fans out n>1 into individual upstream requests and records matching quota cost', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '4',
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
      assert.equal(usage.today.calls, 3);
      assert.equal(usage.today.images, 3);
      assert.equal(quota.assertCanGenerate(user.id, { n: 2 }).ok, false);
      assert.equal(quota.assertCanGenerate(user.id, { n: 1 }).ok, true);
    } finally {
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
