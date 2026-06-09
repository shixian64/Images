import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';

import { handleTestProfile } from '../routes/test-profile.js';

function jsonReq(body) {
  return Readable.from([Buffer.from(JSON.stringify(body))]);
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

test('handleTestProfile disables automatic fetch redirects', async (t) => {
  const prevEnv = {
    ALLOW_INSECURE_UPSTREAMS: process.env.ALLOW_INSECURE_UPSTREAMS,
    ALLOW_PRIVATE_UPSTREAMS: process.env.ALLOW_PRIVATE_UPSTREAMS
  };
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  let redirected = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/redirected') {
      redirected = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'should-not-follow' }] }));
      return;
    }
    res.writeHead(302, { location: '/redirected' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { port } = server.address();
  const req = jsonReq({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'sk-test' });
  const res = captureRes();
  await handleTestProfile(req, res);

  assert.equal(redirected, false);
  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'Upstream profile test failed.');
  assert.equal(JSON.stringify(body).includes('302'), false);
});

test('handleTestProfile times out stalled probes', async (t) => {
  const prevEnv = {
    ALLOW_INSECURE_UPSTREAMS: process.env.ALLOW_INSECURE_UPSTREAMS,
    ALLOW_PRIVATE_UPSTREAMS: process.env.ALLOW_PRIVATE_UPSTREAMS,
    TEST_PROFILE_TIMEOUT_MS: process.env.TEST_PROFILE_TIMEOUT_MS
  };
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  process.env.TEST_PROFILE_TIMEOUT_MS = '25';

  const server = http.createServer((_req, _res) => {
    // Keep the socket open without sending headers; the route must abort it.
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { port } = server.address();
  const req = jsonReq({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'sk-test' });
  const res = captureRes();
  await handleTestProfile(req, res);

  assert.equal(res.statusCode, 504);
  assert.match(JSON.parse(res.body).error, /timed out/);
});

test('handleTestProfile caps upstream response body size', async (t) => {
  const prevEnv = {
    ALLOW_INSECURE_UPSTREAMS: process.env.ALLOW_INSECURE_UPSTREAMS,
    ALLOW_PRIVATE_UPSTREAMS: process.env.ALLOW_PRIVATE_UPSTREAMS,
    MAX_UPSTREAM_RESPONSE_BYTES: process.env.MAX_UPSTREAM_RESPONSE_BYTES
  };
  process.env.ALLOW_INSECURE_UPSTREAMS = '1';
  process.env.ALLOW_PRIVATE_UPSTREAMS = '1';
  process.env.MAX_UPSTREAM_RESPONSE_BYTES = '8';

  const server = http.createServer((_req, res) => {
    const body = '0123456789';
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body)
    });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { port } = server.address();
  const req = jsonReq({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'sk-test' });
  const res = captureRes();
  await handleTestProfile(req, res);

  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /too large/);
});
