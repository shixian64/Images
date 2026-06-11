import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createSseSession, openSse, writeSse } from '../utils/sse.js';

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = null;
    this.headers = {};
    this.chunks = [];
    this.destroyed = false;
    this.writableEnded = false;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
  }

  flushHeaders() {
    this.flushed = true;
  }

  write(chunk) {
    this.chunks.push(String(chunk));
    return true;
  }

  end() {
    this.writableEnded = true;
  }
}

test('openSse sends standard headers and connected comment', () => {
  const res = new MockResponse();

  openSse(res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(res.chunks.join('').includes(': connected'));
});

test('writeSse serializes event payloads', () => {
  const res = new MockResponse();

  assert.equal(writeSse(res, 'snapshot', { ok: true }), true);

  assert.equal(res.chunks.join(''), 'event: snapshot\ndata: {"ok":true}\n\n');
});

test('writeSse can attach replay ids', () => {
  const res = new MockResponse();

  assert.equal(writeSse(res, 'job', { ok: true }, { id: 42 }), true);

  assert.equal(res.chunks.join(''), 'id: 42\nevent: job\ndata: {"ok":true}\n\n');
});

test('SSE close cleanup runs once and stops heartbeat writes', async () => {
  const res = new MockResponse();
  let cleanupCalls = 0;

  createSseSession(res, {
    heartbeatMs: 5,
    onClose: () => { cleanupCalls += 1; }
  });
  res.emit('close');
  res.emit('close');
  await delay(20);

  assert.equal(cleanupCalls, 1);
  assert.equal(res.chunks.length, 0);
});
