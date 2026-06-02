import { test, before, after, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV_KEYS = [
  'REGISTRATION_MODE',
  'REGISTRATION_INVITE_CODE',
  'REGISTRATION_INVITE_CODES',
  'REGISTRATION_IP_MAX_PER_10MIN',
  'REGISTRATION_IP_MAX_PER_DAY',
  'REGISTRATION_EMAIL_DOMAIN_ALLOWLIST',
  'REGISTRATION_EMAIL_DOMAIN_BLOCKLIST'
];

let workDir;
let prevCwd;
let db;
let guard;
let rateLimit;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-registration-'));
  process.chdir(workDir);
  db = await import('../services/db.js');
  guard = await import('../services/registration-guard.js');
  rateLimit = await import('../services/rate-limit.js');
  db.migrate();
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

afterEach(() => {
  rateLimit.clear();
  db.registrationInvites.reset();
  db.systemSettings.delete('registration.settings');
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
      () => guard.assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof guard.RegistrationRejectedError &&
        err.code === 'invalid_registration_invite_code'
    );

    const settings = guard.assertRegistrationAllowed({
      body: { email: 'a@example.com', registrationCode: 'team-code' },
      isAdminBootstrap: false
    });
    assert.equal(settings.inviteRequired, true);
    assert.equal(settings.inviteSource, 'env');
  });
});

test('registration is closed by default unless explicitly opened', () => {
  return withEnv({}, () => {
    assert.equal(guard.registrationSettingsSnapshot().mode, 'closed');
    assert.throws(
      () => guard.assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof guard.RegistrationRejectedError &&
        err.code === 'registration_closed'
    );
  });
});

test('open registration mode must be explicit', () => {
  return withEnv({ REGISTRATION_MODE: 'open' }, () => {
    const settings = guard.assertRegistrationAllowed({
      body: { email: 'a@example.com' },
      isAdminBootstrap: false
    });
    assert.equal(settings.mode, 'open');
    assert.equal(settings.allowPublicRegistration, true);
  });
});

test('admin bootstrap can bypass closed registration', () => {
  return withEnv({ REGISTRATION_MODE: 'closed' }, () => {
    const settings = guard.assertRegistrationAllowed({
      body: { email: 'root@example.com' },
      isAdminBootstrap: true
    });
    assert.equal(settings.mode, 'closed');
  });
});

test('UI settings can enable invite-only registration with single-use codes', () => {
  return withEnv({}, () => {
    const saved = guard.setRegistrationSettings({
      allowPublicRegistration: false,
      allowInviteRegistration: true,
      defaultInviteUses: 1
    }, 'admin-1');
    assert.equal(saved.source, 'db');
    assert.equal(saved.inviteRequired, true);

    const [invite] = guard.generateRegistrationInviteCodes({ count: 1, createdBy: 'admin-1' });
    assert.ok(invite.code);
    assert.equal(invite.maxUses, 1);

    assert.throws(
      () => guard.assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof guard.RegistrationRejectedError &&
        err.code === 'invalid_registration_invite_code'
    );

    const accepted = guard.assertRegistrationAllowed({
      body: { email: 'a@example.com', registrationCode: invite.code },
      isAdminBootstrap: false
    });
    assert.equal(accepted.inviteSource, 'db');
    assert.equal(accepted.inviteAccepted, true);

    const consumed = guard.consumeRegistrationInviteCode(invite.code);
    assert.equal(consumed.remainingUses, 0);
    assert.throws(
      () => guard.assertRegistrationAllowed({
        body: { email: 'b@example.com', registrationCode: invite.code },
        isAdminBootstrap: false
      }),
      (err) => err instanceof guard.RegistrationRejectedError &&
        err.code === 'invalid_registration_invite_code'
    );
  });
});

test('UI settings can allow public registration while also managing invite codes', () => {
  return withEnv({}, () => {
    guard.setRegistrationSettings({
      allowPublicRegistration: true,
      allowInviteRegistration: true,
      defaultInviteUses: 2
    }, 'admin-1');
    const settings = guard.assertRegistrationAllowed({
      body: { email: 'open@example.com' },
      isAdminBootstrap: false
    });
    assert.equal(settings.mode, 'open');
    assert.equal(settings.inviteRequired, false);

    const [invite] = guard.generateRegistrationInviteCodes({ count: 1, createdBy: 'admin-1' });
    const withInvite = guard.assertRegistrationAllowed({
      body: { email: 'open2@example.com', registrationCode: invite.code },
      isAdminBootstrap: false
    });
    assert.equal(withInvite.inviteAccepted, true);
  });
});

test('resetting invite codes clears codes without changing registration settings', () => {
  return withEnv({}, () => {
    guard.setRegistrationSettings({
      allowPublicRegistration: false,
      allowInviteRegistration: true,
      defaultInviteUses: 3
    }, 'admin-1');
    guard.generateRegistrationInviteCodes({ count: 3, createdBy: 'admin-1' });
    assert.equal(guard.adminRegistrationSnapshot().invites.length, 3);
    const removed = guard.resetRegistrationInviteCodes();
    assert.equal(removed, 3);
    const snapshot = guard.adminRegistrationSnapshot();
    assert.equal(snapshot.invites.length, 0);
    assert.equal(snapshot.settings.allowInviteRegistration, true);
    assert.equal(snapshot.settings.defaultInviteUses, 3);
  });
});

test('registration IP daily limiter trips after configured attempts', () => {
  return withEnv({
    REGISTRATION_IP_MAX_PER_10MIN: '0',
    REGISTRATION_IP_MAX_PER_DAY: '2'
  }, () => {
    assert.equal(guard.checkRegistrationRateLimit({ ip: '198.51.100.7' }).ok, true);
    assert.equal(guard.checkRegistrationRateLimit({ ip: '198.51.100.7' }).ok, true);
    const third = guard.checkRegistrationRateLimit({ ip: '198.51.100.7' });
    assert.equal(third.ok, false);
    assert.equal(third.code, 'registration_rate_limited');
  });
});
