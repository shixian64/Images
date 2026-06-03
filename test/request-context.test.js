import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  REQUEST_ID_HEADER,
  attachTraceId,
  normalizeTraceId,
  runWithRequestContext
} from '../utils/request-context.js';
import { logger } from '../utils/logger.js';

function fakeRes() {
  const headers = new Map();
  return {
    headersSent: false,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    }
  };
}

test('attachTraceId reuses valid incoming request id and sets response header', () => {
  const req = { headers: { [REQUEST_ID_HEADER]: 'trace-123' } };
  const res = fakeRes();

  const traceId = attachTraceId(req, res);

  assert.equal(traceId, 'trace-123');
  assert.equal(req.traceId, 'trace-123');
  assert.equal(res.getHeader(REQUEST_ID_HEADER), 'trace-123');
});

test('normalizeTraceId rejects unsafe request ids', () => {
  assert.equal(normalizeTraceId('bad trace\nid'), '');
  assert.equal(normalizeTraceId('a'.repeat(129)), '');
  assert.equal(normalizeTraceId('ok.trace-1:_'), 'ok.trace-1:_');
});

test('logger includes async request trace id and serializes Error objects', () => {
  const originalError = console.error;
  const lines = [];
  console.error = (line) => lines.push(JSON.parse(line));
  try {
    runWithRequestContext({ traceId: 'trace-logger' }, () => {
      logger.error('test.failed', { err: new Error('boom Authorization: Bearer sk-logger-secret-123456') });
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(lines.length, 1);
  assert.equal(lines[0].traceId, 'trace-logger');
  assert.equal(lines[0].err.message.includes('sk-logger-secret-123456'), false);
  assert.match(lines[0].err.message, /Bearer sk-l\*\*\*\*3456/);
  assert.equal(lines[0].err.stack.includes('sk-logger-secret-123456'), false);
  assert.match(lines[0].err.stack, /Bearer sk-l\*\*\*\*3456/);
});

test('logger redacts sensitive ordinary metadata recursively', () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(JSON.parse(line));
  try {
    logger.info('test.meta', {
      apiKey: 'sk-logger-meta-123456',
      nested: {
        authorization: 'Bearer custom-token-123456',
        message: 'upstream echoed sk-logger-nested-123456'
      }
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 1);
  assert.equal(lines[0].apiKey, '[redacted]');
  assert.equal(lines[0].nested.authorization, '[redacted]');
  assert.equal(lines[0].nested.message.includes('sk-logger-nested-123456'), false);
  assert.match(lines[0].nested.message, /sk-l\*\*\*\*3456/);
});

test('logger redacts sensitive keys before serializing object values', () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(JSON.parse(line));
  try {
    logger.info('test.sensitive-error', {
      apiKey: new Error('sk-sensitive-error-123456'),
      safeError: new Error('Authorization: Bearer sk-safe-error-123456')
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 1);
  assert.equal(lines[0].apiKey, '[redacted]');
  assert.match(lines[0].safeError.message, /Bearer sk-s\*\*\*\*3456/);
});
