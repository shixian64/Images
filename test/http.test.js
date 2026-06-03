import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';

import {
  HTTP_ERROR_CODES,
  bodyErrorStatus,
  createHttpError,
  readJsonBody,
  readMultipartFormData,
  sendJson
} from '../utils/http.js';

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

test('createHttpError keeps status/statusCode/code compatibility', () => {
  const err = createHttpError(429, 'limited', 'rate_limited');

  assert.equal(err.message, 'limited');
  assert.equal(err.statusCode, 429);
  assert.equal(err.status, 429);
  assert.equal(err.code, 'rate_limited');
  assert.equal(bodyErrorStatus(err), 429);
});

test('readJsonBody invalid JSON includes stable error code', async () => {
  const req = Readable.from([Buffer.from('{', 'utf8')]);

  await assert.rejects(
    readJsonBody(req),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.status, 400);
      assert.equal(err.code, HTTP_ERROR_CODES.INVALID_JSON);
      return true;
    }
  );
});

function multipartReq(boundary, body) {
  const req = Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')]);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  return req;
}

test('readMultipartFormData preserves boundary-like bytes inside file content', async () => {
  const boundary = 'abc';
  const fileBytes = Buffer.from('prefix\r\n--abc suffix\r\nreal end', 'utf8');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nhello\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reference"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  ]);

  const form = await readMultipartFormData(multipartReq(boundary, body));

  assert.equal(form.fields.prompt, 'hello');
  assert.equal(form.files.length, 1);
  assert.equal(form.files[0].fieldName, 'reference');
  assert.equal(form.files[0].filename, 'a.bin');
  assert.deepEqual(form.files[0].buffer, fileBytes);
});

test('readMultipartFormData accepts multiple file parts with the same field name', async () => {
  const boundary = 'multi';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="one.txt"',
    'Content-Type: text/plain',
    '',
    'one',
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="two.txt"',
    'Content-Type: text/plain',
    '',
    'two',
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const form = await readMultipartFormData(multipartReq(boundary, body));

  assert.equal(form.files.length, 2);
  assert.deepEqual(form.files.map((file) => file.filename), ['one.txt', 'two.txt']);
  assert.deepEqual(form.files.map((file) => file.buffer.toString('utf8')), ['one', 'two']);
});

test('readMultipartFormData treats prototype-looking field names as data', async () => {
  const boundary = 'proto';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="__proto__"',
    '',
    'polluted',
    `--${boundary}`,
    'Content-Disposition: form-data; name="constructor"',
    '',
    'plain',
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const form = await readMultipartFormData(multipartReq(boundary, body));

  assert.equal(Object.getPrototypeOf(form.fields), null);
  assert.equal(Object.hasOwn(form.fields, '__proto__'), true);
  assert.equal(form.fields.__proto__, 'polluted');
  assert.equal(form.fields.constructor, 'plain');
  assert.equal({}.polluted, undefined);
});
