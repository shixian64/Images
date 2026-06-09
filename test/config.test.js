import { test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  knownPositiveIntEnvNames,
  parsePositiveInt,
  positiveIntFromEnv,
  validateEnvConfig
} from '../utils/config.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('positiveIntFromEnv preserves legacy fallback behavior', () => {
  process.env.MAX_IMAGES_PER_REQUEST = '3.9';
  assert.equal(positiveIntFromEnv('MAX_IMAGES_PER_REQUEST', 4), 3);

  process.env.MAX_IMAGES_PER_REQUEST = 'abc';
  assert.equal(positiveIntFromEnv('MAX_IMAGES_PER_REQUEST', 4), 4);

  process.env.MAX_IMAGES_PER_REQUEST = '0';
  assert.equal(positiveIntFromEnv('MAX_IMAGES_PER_REQUEST', 4), 4);
});

test('positive int parser can explicitly allow zero', () => {
  assert.equal(parsePositiveInt('0', 20, { allowZero: true }), 0);
  assert.equal(parsePositiveInt('-1', 20, { allowZero: true }), 20);
});

test('validateEnvConfig reports invalid configured numeric env values', () => {
  process.env.MAX_JSON_BODY_BYTES = 'abc';
  process.env.SIGNUP_IP_DAILY_LIMIT = '0';
  process.env.CHAT_MAX_COMPLETION_TOKENS = 'abc';

  const events = [];
  const warnings = validateEnvConfig({
    logger: { warn: (message, meta) => events.push({ message, meta }) }
  });

  assert.ok(warnings.some((warning) => warning.name === 'MAX_JSON_BODY_BYTES'));
  assert.equal(warnings.some((warning) => warning.name === 'SIGNUP_IP_DAILY_LIMIT'), false);
  assert.ok(warnings.some((warning) => warning.name === 'CHAT_MAX_COMPLETION_TOKENS' && warning.fallback === 6000));
  assert.ok(events.some((event) => event.message === 'config.env.invalid_positive_int'));
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
  assert.ok(names.includes('GALLERY_STAT_CONCURRENCY'));
});
