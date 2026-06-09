import { test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  knownPositiveIntEnvNames,
  parsePositiveInt,
  positiveIntFromEnv,
  validateEnvConfig
} from '../utils/config.js';
import { getMultipartBodyLimitBytes } from '../utils/http.js';

const MIB = 1024 * 1024;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('positiveIntFromEnv preserves legacy fallback behavior', () => {
  process.env.TEST_POSITIVE_INT_HELPER = '3.9';
  assert.equal(positiveIntFromEnv('TEST_POSITIVE_INT_HELPER', 4), 3);

  process.env.TEST_POSITIVE_INT_HELPER = 'abc';
  assert.equal(positiveIntFromEnv('TEST_POSITIVE_INT_HELPER', 4), 4);

  process.env.TEST_POSITIVE_INT_HELPER = '0';
  assert.equal(positiveIntFromEnv('TEST_POSITIVE_INT_HELPER', 4), 4);
});

test('positive int parser can explicitly allow zero', () => {
  assert.equal(parsePositiveInt('0', 20, { allowZero: true }), 0);
  assert.equal(parsePositiveInt('-1', 20, { allowZero: true }), 20);
});

test('validateEnvConfig reports invalid configured numeric env values', () => {
  process.env.MAX_JSON_BODY_BYTES = 'abc';
  process.env.MAX_IMAGES_PER_REQUEST = 'abc';
  process.env.SIGNUP_IP_DAILY_LIMIT = '0';
  process.env.CHAT_MAX_COMPLETION_TOKENS = 'abc';

  const events = [];
  const warnings = validateEnvConfig({
    logger: { warn: (message, meta) => events.push({ message, meta }) }
  });

  assert.ok(warnings.some((warning) => warning.name === 'MAX_JSON_BODY_BYTES'));
  assert.ok(warnings.some((warning) => warning.name === 'MAX_IMAGES_PER_REQUEST' && warning.fallback === 1));
  assert.equal(warnings.some((warning) => warning.name === 'SIGNUP_IP_DAILY_LIMIT'), false);
  assert.ok(warnings.some((warning) => warning.name === 'CHAT_MAX_COMPLETION_TOKENS' && warning.fallback === 6000));
  assert.ok(events.some((event) => event.message === 'config.env.invalid_positive_int'));
});

test('resource guard fallbacks fit the low-memory container profile', () => {
  delete process.env.MAX_MULTIPART_BODY_BYTES;
  assert.equal(getMultipartBodyLimitBytes(), 64 * MIB);

  process.env.MAX_MULTIPART_BODY_BYTES = 'invalid';
  process.env.MAX_REFERENCE_IMAGE_BYTES = 'invalid';
  process.env.MAX_REFERENCE_IMAGE_TOTAL_BYTES = 'invalid';

  const warnings = validateEnvConfig();
  const byName = new Map(warnings.map((warning) => [warning.name, warning]));
  assert.equal(byName.get('MAX_MULTIPART_BODY_BYTES')?.fallback, 64 * MIB);
  assert.equal(byName.get('MAX_REFERENCE_IMAGE_BYTES')?.fallback, 12 * MIB);
  assert.equal(byName.get('MAX_REFERENCE_IMAGE_TOTAL_BYTES')?.fallback, 48 * MIB);
});

test('config center knows common positive integer env names', () => {
  const names = knownPositiveIntEnvNames();
  assert.ok(names.includes('MAX_JSON_BODY_BYTES'));
  assert.ok(names.includes('MAX_UPSTREAM_RESPONSE_BYTES'));
  assert.ok(names.includes('AUDIT_LOG_RETENTION_DAYS'));
  assert.ok(names.includes('DATA_CLEANUP_INTERVAL_MS'));
  assert.ok(names.includes('SQLITE_BUSY_TIMEOUT_MS'));
  assert.ok(names.includes('SHUTDOWN_TIMEOUT_MS'));
  assert.ok(names.includes('RATE_LIMIT_MAX_KEYS'));
  assert.ok(names.includes('CLIENT_LOG_RATE_LIMIT_MAX_PER_MINUTE'));
  assert.ok(names.includes('CLIENT_LOG_RATE_LIMIT_WINDOW_MS'));
  assert.ok(names.includes('GALLERY_STAT_CONCURRENCY'));
});
