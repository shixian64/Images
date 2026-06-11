// SQLite repositories for registration invite codes and redemption rows.

import { createHash, randomUUID } from 'node:crypto';

const INVITE_CODE_HASH_PREFIX = 'inv:v1:';

export function isInviteCodeHash(value) {
  return String(value || '').startsWith(INVITE_CODE_HASH_PREFIX);
}

export function hashInviteCode(code) {
  const text = String(code || '').trim();
  return `${INVITE_CODE_HASH_PREFIX}${createHash('sha256').update(text).digest('hex')}`;
}

function inviteLookupKeys(code, { allowStoredIdentifier = false } = {}) {
  const text = String(code || '').trim();
  if (!text) return [];
  const keys = [hashInviteCode(text)];
  if (allowStoredIdentifier || !isInviteCodeHash(text)) keys.push(text);
  return [...new Set(keys)];
}

function inviteDisplayCode(code) {
  const text = String(code || '').trim();
  if (!isInviteCodeHash(text)) return text;
  const hash = text.slice(INVITE_CODE_HASH_PREFIX.length);
  return `${INVITE_CODE_HASH_PREFIX}${hash.slice(0, 10)}...`;
}

function isPastIso(value, nowMs = Date.now()) {
  const text = String(value || '').trim();
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time) && time <= nowMs;
}

function parseInvite(row) {
  if (!row) return null;
  const maxUses = Math.max(1, Math.floor(Number(row.max_uses) || 1));
  const usedCount = Math.max(0, Math.floor(Number(row.used_count) || 0));
  const remainingUses = Math.max(0, maxUses - usedCount);
  const expiresAt = row.expires_at || null;
  const expired = isPastIso(expiresAt);
  return {
    code: row.code,
    displayCode: inviteDisplayCode(row.code),
    codeHash: isInviteCodeHash(row.code) ? row.code : hashInviteCode(row.code),
    maxUses,
    usedCount,
    remainingUses,
    createdAt: row.created_at,
    createdBy: row.created_by || null,
    updatedAt: row.updated_at,
    expiresAt,
    expired,
    disabledAt: row.disabled_at || null,
    disabledBy: row.disabled_by || null,
    active: !row.disabled_at && !expired && remainingUses > 0
  };
}

function parseInviteRedemption(row) {
  if (!row) return null;
  const currentUsername = row.current_username || null;
  const currentEmail = row.current_email || null;
  return {
    id: row.id,
    code: row.code,
    displayCode: inviteDisplayCode(row.code),
    userId: row.user_id || null,
    username: currentUsername || row.user_username || null,
    email: currentEmail || row.user_email || null,
    userDeleted: Boolean(row.user_id && !currentUsername && !currentEmail),
    usedAt: row.used_at
  };
}

export function createRegistrationInviteRepositories({ open, nowIso }) {
  const registrationInvites = {
    list({ includeDisabled = false } = {}) {
      const where = includeDisabled ? '' : 'WHERE disabled_at IS NULL';
      return open().prepare(`
        SELECT * FROM registration_invites
        ${where}
        ORDER BY created_at DESC
      `).all().map(parseInvite);
    },
    activeCount() {
      const now = nowIso();
      const row = open().prepare(`
        SELECT COUNT(*) AS n
        FROM registration_invites
        WHERE disabled_at IS NULL
          AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > ?)
      `).get(now);
      return Number(row?.n) || 0;
    },
    findUsable(code) {
      const keys = inviteLookupKeys(code);
      if (!keys.length) return null;
      const now = nowIso();
      const row = open().prepare(`
        SELECT * FROM registration_invites
        WHERE code IN (${keys.map(() => '?').join(',')})
          AND disabled_at IS NULL
          AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1
      `).get(...keys, now);
      return parseInvite(row);
    },
    exists(code) {
      const keys = inviteLookupKeys(code, { allowStoredIdentifier: true });
      if (!keys.length) return false;
      const row = open().prepare(`
        SELECT 1 AS found
        FROM registration_invites
        WHERE code IN (${keys.map(() => '?').join(',')})
        LIMIT 1
      `).get(...keys);
      return Boolean(row?.found);
    },
    createMany(items = [], { createdBy = null } = {}) {
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) return [];
      const db = open();
      const createdAt = nowIso();
      const stmt = db.prepare(`
        INSERT INTO registration_invites
        (code, max_uses, used_count, created_at, created_by, updated_at, expires_at, disabled_at, disabled_by)
        VALUES (?, ?, 0, ?, ?, ?, ?, NULL, NULL)
      `);
      const created = [];
      db.exec('BEGIN;');
      try {
        for (const item of rows) {
          const code = String(item?.code || '').trim();
          if (!code) continue;
          const storedCode = hashInviteCode(code);
          const maxUses = Math.max(1, Math.floor(Number(item?.maxUses) || 1));
          const expiresAt = String(item?.expiresAt || '').trim() || null;
          stmt.run(storedCode, maxUses, createdAt, createdBy || null, createdAt, expiresAt);
          created.push({
            ...parseInvite({
              code: storedCode,
              max_uses: maxUses,
              used_count: 0,
              created_at: createdAt,
              created_by: createdBy || null,
              updated_at: createdAt,
              expires_at: expiresAt,
              disabled_at: null,
              disabled_by: null
            }),
            code,
            codeHash: storedCode,
            displayCode: code,
            oneTimePlaintext: true
          });
        }
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
      return created;
    },
    consume(code, { userId = null } = {}) {
      const keys = inviteLookupKeys(code);
      if (!keys.length) return null;
      const db = open();
      const usedAt = nowIso();
      db.exec('BEGIN;');
      try {
        const res = db.prepare(`
          UPDATE registration_invites
          SET used_count = used_count + 1,
              updated_at = ?
          WHERE code IN (${keys.map(() => '?').join(',')})
            AND disabled_at IS NULL
            AND used_count < max_uses
            AND (expires_at IS NULL OR expires_at > ?)
        `).run(usedAt, ...keys, usedAt);
        if (!res.changes) {
          db.exec('ROLLBACK;');
          return null;
        }
        const stored = db.prepare(`
          SELECT * FROM registration_invites
          WHERE code IN (${keys.map(() => '?').join(',')})
          LIMIT 1
        `).get(...keys);
        const storedCode = stored?.code || keys[0];
        const safeUserId = String(userId || '').trim();
        const user = safeUserId
          ? db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(safeUserId)
          : null;
        db.prepare(`
          INSERT INTO registration_invite_redemptions
          (id, code, user_id, user_username, user_email, used_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          storedCode,
          user?.id || safeUserId || null,
          user?.username || null,
          user?.email || null,
          usedAt
        );
        const invite = parseInvite(stored);
        db.exec('COMMIT;');
        return invite;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    },
    disable(code, { disabledBy = null } = {}) {
      const keys = inviteLookupKeys(code, { allowStoredIdentifier: true });
      if (!keys.length) return null;
      const db = open();
      const existing = db.prepare(`
        SELECT * FROM registration_invites
        WHERE code IN (${keys.map(() => '?').join(',')})
        LIMIT 1
      `).get(...keys);
      if (!existing) return null;
      if (existing.disabled_at) return parseInvite(existing);
      const disabledAt = nowIso();
      db.prepare(`
        UPDATE registration_invites
        SET disabled_at = ?,
            disabled_by = ?,
            updated_at = ?
        WHERE code = ? AND disabled_at IS NULL
      `).run(disabledAt, disabledBy || null, disabledAt, existing.code);
      return parseInvite(db.prepare('SELECT * FROM registration_invites WHERE code = ?').get(existing.code));
    },
    disableUnusedBefore(cutoffIso, { disabledBy = null } = {}) {
      const cutoff = String(cutoffIso || '').trim();
      if (!cutoff) return 0;
      const disabledAt = nowIso();
      const res = open().prepare(`
        UPDATE registration_invites
        SET disabled_at = ?,
            disabled_by = ?,
            updated_at = ?
        WHERE disabled_at IS NULL
          AND used_count = 0
          AND created_at < ?
      `).run(disabledAt, disabledBy || null, disabledAt, cutoff);
      return res.changes || 0;
    },
    reset() {
      const res = open().prepare('DELETE FROM registration_invites').run();
      return res.changes || 0;
    }
  };

  const registrationInviteRedemptions = {
    list({ limit = 1000 } = {}) {
      const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 1000)));
      return open().prepare(`
        SELECT
          r.*,
          u.username AS current_username,
          u.email AS current_email
        FROM registration_invite_redemptions r
        LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.used_at DESC, r.id DESC
        LIMIT ?
      `).all(safeLimit).map(parseInviteRedemption);
    },
    cleanupBefore(cutoffIso) {
      const cutoff = String(cutoffIso || '').trim();
      if (!cutoff) return 0;
      const res = open().prepare(
        'DELETE FROM registration_invite_redemptions WHERE used_at < ?'
      ).run(cutoff);
      return res.changes || 0;
    }
  };


  return { registrationInvites, registrationInviteRedemptions };
}
