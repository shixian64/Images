import { test, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  assertRegistrationAllowed,
  checkRegistrationRateLimit,
  registrationSettingsSnapshot,
  RegistrationRejectedError
} from '../services/registration-guard.js';
import { clear as clearRateLimit } from '../services/rate-limit.js';

const ENV_KEYS = [
  'REGISTRATION_MODE',
  'REGISTRATION_INVITE_CODE',
  'REGISTRATION_INVITE_CODES',
  'REGISTRATION_IP_MAX_PER_10MIN',
  'REGISTRATION_IP_MAX_PER_DAY',
  'REGISTRATION_EMAIL_DOMAIN_ALLOWLIST',
  'REGISTRATION_EMAIL_DOMAIN_BLOCKLIST'
];

afterEach(() => {
  clearRateLimit();
});

async function withEnv(patch, fn) {
  const prev = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) process.env[key] = String(value);
  }
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test('invite mode rejects missing code and accepts configured code', () => {
  return withEnv({
    REGISTRATION_MODE: 'invite',
    REGISTRATION_INVITE_CODE: 'team-code'
  }, () => {
    assert.throws(
      () => assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof RegistrationRejectedError &&
        err.code === 'invalid_registration_invite_code'
    );

    const settings = assertRegistrationAllowed({
      body: { email: 'a@example.com', registrationCode: 'team-code' },
      isAdminBootstrap: false
    });
    assert.equal(settings.inviteRequired, true);
  });
});

test('registration is closed by default unless explicitly opened', () => {
  return withEnv({}, () => {
    assert.equal(registrationSettingsSnapshot().mode, 'closed');
    assert.throws(
      () => assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof RegistrationRejectedError &&
        err.code === 'registration_closed'
    );
  });
});

test('open registration mode must be explicit', () => {
  return withEnv({ REGISTRATION_MODE: 'open' }, () => {
    const settings = assertRegistrationAllowed({
      body: { email: 'a@example.com' },
      isAdminBootstrap: false
    });
    assert.equal(settings.mode, 'open');
  });
});

test('admin bootstrap can bypass closed registration', () => {
  return withEnv({ REGISTRATION_MODE: 'closed' }, () => {
    const settings = assertRegistrationAllowed({
      body: { email: 'root@example.com' },
      isAdminBootstrap: true
    });
    assert.equal(settings.mode, 'closed');
  });
});

test('registration IP daily limiter trips after configured attempts', () => {
  return withEnv({
    REGISTRATION_IP_MAX_PER_10MIN: '0',
    REGISTRATION_IP_MAX_PER_DAY: '2'
  }, () => {
    assert.equal(checkRegistrationRateLimit({ ip: '198.51.100.7' }).ok, true);
    assert.equal(checkRegistrationRateLimit({ ip: '198.51.100.7' }).ok, true);
    const third = checkRegistrationRateLimit({ ip: '198.51.100.7' });
    assert.equal(third.ok, false);
    assert.equal(third.code, 'registration_rate_limited');
  });
});
