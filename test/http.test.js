import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { sendJson } from '../utils/http.js';

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

test('sendJson marks JSON API responses as no-store', () => {
  const res = captureRes();
  sendJson(res, 200, { ok: true });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});
