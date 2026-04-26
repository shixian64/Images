import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  const prevFetch = globalThis.fetch;
  let called = false;
  t.after(() => {
    globalThis.fetch = prevFetch;
  });

  globalThis.fetch = async (_url, options) => {
    called = true;
    assert.equal(options.redirect, 'manual');
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const req = jsonReq({ baseUrl: 'https://93.184.216.34', apiKey: 'sk-test' });
  const res = captureRes();
  await handleTestProfile(req, res);

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).models, []);
});
