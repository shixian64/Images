import { test, before, after, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

const INVITE_CODE_HASH_PREFIX = 'inv:v1:';

function hashInviteCodeForTest(code) {
  const digest = createHash('sha256')
    .update(String(code || '').trim())
    .digest('hex');
  return `${INVITE_CODE_HASH_PREFIX}${digest}`;
}

function withSqlite(fn) {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    return fn(sqlite);
  } finally {
    sqlite.close();
  }
}

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
  db.registrationInviteRedemptions.cleanupBefore('9999-12-31T23:59:59.999Z');
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
    const expectedHash = hashInviteCodeForTest(invite.code);
    assert.equal(invite.codeHash, expectedHash);
    assert.equal(invite.displayCode, invite.code);
    assert.equal(invite.oneTimePlaintext, true);

    const storedInviteCodes = withSqlite((sqlite) => sqlite.prepare(
      'SELECT code FROM registration_invites ORDER BY created_at DESC'
    ).all().map((row) => row.code));
    assert.deepEqual(storedInviteCodes, [expectedHash]);

    const snapshotAfterGenerate = guard.adminRegistrationSnapshot();
    assert.equal(snapshotAfterGenerate.invites.length, 1);
    assert.equal(snapshotAfterGenerate.invites[0].code, expectedHash);
    assert.equal(snapshotAfterGenerate.invites[0].codeHash, expectedHash);
    assert.equal(
      snapshotAfterGenerate.invites[0].displayCode,
      `${INVITE_CODE_HASH_PREFIX}${expectedHash.slice(
        INVITE_CODE_HASH_PREFIX.length,
        INVITE_CODE_HASH_PREFIX.length + 10
      )}...`
    );
    assert.notEqual(snapshotAfterGenerate.invites[0].displayCode, invite.code);

    assert.throws(
      () => guard.assertRegistrationAllowed({
        body: { email: 'a@example.com' },
        isAdminBootstrap: false
      }),
      (err) => err instanceof guard.RegistrationRejectedError &&
        err.code === 'invalid_registration_invite_code'
    );

    assert.throws(
      () => guard.assertRegistrationAllowed({
        body: { email: 'a@example.com', registrationCode: expectedHash },
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
    assert.equal(consumed.code, expectedHash);
    const storedRedemptionCodes = withSqlite((sqlite) => sqlite.prepare(
      'SELECT code FROM registration_invite_redemptions ORDER BY used_at DESC'
    ).all().map((row) => row.code));
    assert.deepEqual(storedRedemptionCodes, [expectedHash]);
    const snapshotAfterConsume = guard.adminRegistrationSnapshot();
    assert.equal(snapshotAfterConsume.redemptions[0].code, expectedHash);
    assert.notEqual(snapshotAfterConsume.redemptions[0].displayCode, invite.code);
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

test('invite redemption records the registered user and invites can be disabled', () => {
  return withEnv({}, () => {
    guard.setRegistrationSettings({
      allowPublicRegistration: false,
      allowInviteRegistration: true,
      defaultInviteUses: 2
    }, 'admin-1');
    const [invite] = guard.generateRegistrationInviteCodes({ count: 1, maxUses: 2, createdBy: 'admin-1' });
    const user = db.users.create({
      username: 'invite-redeemer-1',
      email: 'invite-redeemer-1@example.com',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    });

    const consumed = guard.consumeRegistrationInviteCode(invite.code, { userId: user.id });
    assert.equal(consumed.usedCount, 1);
    assert.equal(consumed.remainingUses, 1);

    const snapshot = guard.adminRegistrationSnapshot();
    assert.equal(snapshot.redemptions.length, 1);
    assert.equal(snapshot.redemptions[0].code, invite.codeHash);
    assert.notEqual(snapshot.redemptions[0].displayCode, invite.code);
    assert.equal(snapshot.redemptions[0].userId, user.id);
    assert.equal(snapshot.redemptions[0].username, user.username);
    assert.equal(snapshot.redemptions[0].email, user.email);

    const disabled = guard.disableRegistrationInviteCode(snapshot.invites[0].code, { disabledBy: 'admin-1' });
    assert.equal(disabled.active, false);
    assert.ok(disabled.disabledAt);
    assert.equal(disabled.disabledBy, 'admin-1');
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

test('redemption cleanup can also disable old unused invites', () => {
  return withEnv({}, () => {
    guard.setRegistrationSettings({
      allowPublicRegistration: false,
      allowInviteRegistration: true,
      defaultInviteUses: 2
    }, 'admin-1');
    const [usedInvite, unusedInvite] = guard.generateRegistrationInviteCodes({
      count: 2,
      maxUses: 2,
      createdBy: 'admin-1'
    });
    const user = db.users.create({
      username: 'invite-redeemer-2',
      email: 'invite-redeemer-2@example.com',
      passwordHash: 'hash',
      passwordSalt: 'salt'
    });
    guard.consumeRegistrationInviteCode(usedInvite.code, { userId: user.id });

    const result = guard.cleanupRegistrationInviteRedemptions({
      before: '9999-01-01T00:00:00.000Z',
      disableUnusedInvites: true,
      disabledBy: 'admin-1'
    });
    assert.equal(result.removedRedemptions, 1);
    assert.equal(result.disabledInvites, 1);

    const snapshot = guard.adminRegistrationSnapshot();
    assert.equal(snapshot.redemptions.length, 0);
    const used = snapshot.invites.find((item) => item.code === usedInvite.codeHash);
    const unused = snapshot.invites.find((item) => item.code === unusedInvite.codeHash);
    assert.equal(used.disabledAt, null);
    assert.ok(unused.disabledAt);
    assert.equal(unused.disabledBy, 'admin-1');
  });
});

test('legacy plaintext invite rows are hashed by migration', () => {
  return withEnv({}, () => {
    const now = new Date().toISOString();
    const legacyCode = 'LEGACY-CODE-1';
    const orphanCode = 'ORPHAN-CODE-1';
    const legacyHash = hashInviteCodeForTest(legacyCode);
    const orphanHash = hashInviteCodeForTest(orphanCode);

    withSqlite((sqlite) => {
      sqlite.prepare('DELETE FROM schema_migrations WHERE version = 7').run();
      sqlite.prepare(`
        INSERT INTO registration_invites
        (code, max_uses, used_count, created_at, created_by, updated_at, disabled_at, disabled_by)
        VALUES (?, 2, 0, ?, ?, ?, NULL, NULL)
      `).run(legacyCode, now, 'legacy-admin', now);
      sqlite.prepare(`
        INSERT INTO registration_invite_redemptions
        (id, code, user_id, user_username, user_email, used_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('legacy-redemption-1', legacyCode, 'legacy-user', 'legacy-user', 'legacy@example.com', now);
      sqlite.prepare(`
        INSERT INTO registration_invite_redemptions
        (id, code, user_id, user_username, user_email, used_at)
        VALUES (?, ?, NULL, NULL, NULL, ?)
      `).run('orphan-redemption-1', orphanCode, now);
    });

    db.migrate();

    const stored = withSqlite((sqlite) => ({
      invites: sqlite.prepare('SELECT code FROM registration_invites ORDER BY code').all().map((row) => row.code),
      redemptions: sqlite.prepare(
        'SELECT code FROM registration_invite_redemptions ORDER BY id'
      ).all().map((row) => row.code)
    }));
    assert.deepEqual(stored.invites, [legacyHash]);
    assert.deepEqual(stored.redemptions, [legacyHash, orphanHash]);
    assert.equal(stored.invites.includes(legacyCode), false);
    assert.equal(stored.redemptions.includes(legacyCode), false);
    assert.equal(stored.redemptions.includes(orphanCode), false);

    const listedInvite = db.registrationInvites.list({ includeDisabled: true })[0];
    assert.equal(listedInvite.code, legacyHash);
    assert.notEqual(listedInvite.displayCode, legacyCode);
    const redemptions = db.registrationInviteRedemptions.list();
    assert.equal(redemptions.length, 2);
    assert.ok(redemptions.every((item) => item.displayCode.startsWith(INVITE_CODE_HASH_PREFIX)));
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
