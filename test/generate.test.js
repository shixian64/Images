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
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

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

  db.migrate();
  user = auth.register({ username: 'gen_user', email: 'gen_user@example.com', password: 'longenough1' });
});

after(() => {
  process.chdir(prevCwd);
  if (prevMaxImagesPerRequest === undefined) delete process.env.MAX_IMAGES_PER_REQUEST;
  else process.env.MAX_IMAGES_PER_REQUEST = prevMaxImagesPerRequest;
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('handleGenerate records multi-image requests with the same quota cost used by precheck', async () => {
  await withEnv({
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '4'
  }, async () => {
    let upstreamPayload = null;
    const server = http.createServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/images/generations');

      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        upstreamPayload = JSON.parse(raw);
        const image = { b64_json: Buffer.from(PNG_BYTES).toString('base64') };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [image, image, image] }));
      });
    });
    await listen(server);

    try {
      const { port } = server.address();
      const req = jsonReq({
        imageBaseUrl: `http://127.0.0.1:${port}`,
        imageApiKey: 'sk-test',
        prompt: 'three small pngs',
        model: 'test-image-model',
        n: 3
      }, user);
      const res = captureRes();

      await generate.handleGenerate(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(upstreamPayload.n, 3);
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
