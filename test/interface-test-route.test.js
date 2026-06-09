import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let workDir;
let prevCwd;
let prevEnv;
let db;
let interfaces;
let routes;

const ENV_KEYS = [
  'ALLOW_INSECURE_UPSTREAMS',
  'ALLOW_PRIVATE_UPSTREAMS',
  'IMAGE_STUDIO_SECRET_KEY',
  'NODE_ENV'
];

before(async () => {
  prevCwd = process.cwd();
  prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  process.env.IMAGE_STUDIO_SECRET_KEY = 'interface-route-test-secret';
  process.env.NODE_ENV = 'development';

  workDir = mkdtempSync(join(tmpdir(), 'image-studio-interface-test-route-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  interfaces = await import('../services/interface-defaults.js');
  routes = await import('../routes/interfaces.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  for (const [key, value] of Object.entries(prevEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function jsonReq(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'user-agent': 'interface-test-route' };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.session = { user: { id: 'admin-user', role: 'admin' } };
  return req;
}

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    getHeader(key) {
      return this.headers[String(key).toLowerCase()];
    },
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

test('system interface probe failures do not proxy upstream status or body to the browser', async (t) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(418, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      error: { message: 'internal upstream routing detail sk-upstream-secret' }
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  interfaces.setGlobalInterfaceConfig({
    image: {
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'sk-system-probe-secret',
      defaultModel: 'gpt-image-2'
    }
  }, 'admin-user');

  const req = jsonReq({ kind: 'image' });
  const res = captureRes();
  await routes.handleInterfacesRoute(req, res, '/api/admin/interfaces/default/test');

  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'Upstream profile test failed.');
  assert.equal(JSON.stringify(body).includes('418'), false);
  assert.equal(JSON.stringify(body).includes('routing detail'), false);
  assert.equal(body.default.image.testError, 'Upstream profile test failed.');
});
