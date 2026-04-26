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
  assert.equal(res.statusCode, 302);
});
