// 用户管理服务：admin 侧的列表/改角色/改状态/创建/删除/重置密码/强制下线，
// 以及当前用户的资料/密码维护。
// TAG: hmt---

import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { users, sessions, images } from './db.js';
import { hashPassword, verifyPassword, sanitizeUser } from './auth.js';
import { assertPasswordAllowed } from './password-policy.js';
import { userImageDir } from './path-guard.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['admin', 'user']);
const VALID_STATUSES = new Set(['active', 'disabled']);
const MAX_AVATAR_URL_LEN = 500;

export function listUsers() {
  return users.list();
}

export function getUserDetail(userId) {
  const row = users.findById(userId);
  if (!row) throw new Error('user not found');
  const stats = images.statsByUser(userId);
  const userSessions = sessions.listByUser(userId).map((s) => ({
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    userAgent: s.user_agent,
    ip: s.ip
  }));
  return {
    user: sanitizeUser(row, { includeSecurity: true }),
    stats: {
      imageCount: Number(stats.count) || 0,
      imageBytes: Number(stats.bytes) || 0,
      lastImageAt: stats.last_at || null,
      activeSessions: userSessions.length
    },
    sessions: userSessions
  };
}

export function patchUser(actorId, targetId, { role, status } = {}) {
  if (!targetId) throw new Error('user not found');
  if (actorId === targetId) {
    // 不允许管理员改自己的角色或状态，避免误把自己降权/禁用
    throw new Error('self-modify forbidden');
  }
  const target = users.findById(targetId);
  if (!target) throw new Error('user not found');

  if (role !== undefined && !VALID_ROLES.has(role)) {
    throw new Error('invalid role');
  }
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    throw new Error('invalid status');
  }

  // 降级/停用最后一个活跃 admin 会让系统失去管理员
  const willDemote = role !== undefined && target.role === 'admin' && role !== 'admin';
  const willDisable =
    status !== undefined && target.role === 'admin' && target.status === 'active' && status === 'disabled';
  if ((willDemote || willDisable) && users.countAdmins() <= 1) {
    throw new Error('cannot remove last active admin');
  }

  let updated = target;
  if (role !== undefined && role !== target.role) {
    updated = users.updateRole(targetId, role);
  }
  if (status !== undefined && status !== target.status) {
    updated = users.updateStatus(targetId, status);
  }
  return sanitizeUser(updated);
}

export function updateProfile(userId, { username, email, avatarUrl } = {}) {
  const cur = users.findById(userId);
  if (!cur) throw new Error('user not found');

  if (username !== undefined) {
    if (!USERNAME_RE.test(username)) throw new Error('invalid username');
    if (username !== cur.username) {
      const clash = users.findByLogin(username);
      if (clash && clash.id !== userId) throw new Error('username already taken');
    }
  }
  if (email !== undefined) {
    if (!EMAIL_RE.test(email)) throw new Error('invalid email');
    if (email !== cur.email) {
      const clash = users.findByLogin(email);
      if (clash && clash.id !== userId) throw new Error('email already taken');
    }
  }

  const nextAvatarUrl = normalizeAvatarUrl(avatarUrl, cur.avatar_url);

  const updated = users.updateProfile(userId, {
    username: username ?? cur.username,
    email: email ?? cur.email,
    avatarUrl: nextAvatarUrl
  });
  return sanitizeUser(updated);
}

function normalizeAvatarUrl(value, current = '') {
  if (value === undefined || value === null) return current;
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > MAX_AVATAR_URL_LEN) throw new Error(`avatar URL too long (max ${MAX_AVATAR_URL_LEN} characters)`);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('invalid avatar URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('invalid avatar URL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('avatar URL must not include credentials');
  }
  return parsed.toString();
}

export function createUserByAdmin({ username, email, password, role = 'user' } = {}) {
  if (!username || !email || !password) {
    throw new Error('username, email and password are required');
  }
  if (!USERNAME_RE.test(username)) throw new Error('invalid username');
  if (!EMAIL_RE.test(email)) throw new Error('invalid email');
  assertPasswordAllowed(password, { username, email });
  if (!VALID_ROLES.has(role)) throw new Error('invalid role');

  if (users.findByLogin(username)) throw new Error('username already taken');
  if (users.findByLogin(email)) throw new Error('email already taken');

  const { hash, salt } = hashPassword(password);
  const row = users.create({
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role
  });
  return sanitizeUser(row);
}

export function resetPasswordByAdmin(actorId, targetId, { password } = {}) {
  if (!targetId) throw new Error('user not found');
  const target = users.findById(targetId);
  if (!target) throw new Error('user not found');
  // 允许给自己重置（管理员忘了密码自救），但通常调用方会限制
  let plain = password;
  let generated = false;
  if (!plain) {
    generated = true;
    for (let i = 0; i < 10; i += 1) {
      plain = generateTempPassword();
      try {
        assertPasswordAllowed(plain, { username: target.username, email: target.email });
        break;
      } catch {
        plain = '';
      }
    }
    if (!plain) throw new Error('failed to generate a valid temporary password');
  } else {
    assertPasswordAllowed(plain, { username: target.username, email: target.email });
  }
  const { hash, salt } = hashPassword(plain);
  users.updatePassword(targetId, hash, salt, { resetRequired: true });
  // 重置后强制其他会话下线，避免遗留登录
  sessions.destroyByUser(targetId);
  return { generated, password: generated ? plain : null };
}

export function forceLogoutByAdmin(actorId, targetId) {
  if (!targetId) throw new Error('user not found');
  if (actorId === targetId) throw new Error('self-modify forbidden');
  const target = users.findById(targetId);
  if (!target) throw new Error('user not found');
  sessions.destroyByUser(targetId);
  return sanitizeUser(target);
}

export async function deleteUserByAdmin(actorId, targetId) {
  if (!targetId) throw new Error('user not found');
  if (actorId === targetId) throw new Error('self-modify forbidden');
  const target = users.findById(targetId);
  if (!target) throw new Error('user not found');
  if (target.role === 'admin' && users.countAdmins() <= 1) {
    throw new Error('cannot remove last active admin');
  }
  // 先尝试清理用户图片目录（库行通过外键 ON DELETE CASCADE 自动清）
  const stats = images.statsByUser(targetId);
  try {
    const dir = userImageDir(targetId);
    await rm(dir, { recursive: true, force: true });
  } catch {
    // 目录缺失/权限失败都不阻断用户删除
  }
  sessions.destroyByUser(targetId);
  users.delete(targetId);
  return {
    user: sanitizeUser(target),
    removedImages: Number(stats.count) || 0,
    removedBytes: Number(stats.bytes) || 0
  };
}

function generateTempPassword() {
  // 12 字节 base64 ≈ 16 字符，含字母数字与少量符号，便于一次性发给用户
  return randomBytes(12)
    .toString('base64')
    .replace(/[+/=]/g, (c) => ({ '+': 'A', '/': 'B', '=': '' }[c] || ''))
    .slice(0, 16);
}

export function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) throw new Error('old and new password are required');
  const cur = users.findById(userId);
  if (!cur) throw new Error('user not found');
  if (!verifyPassword(oldPassword, cur.password_hash, cur.password_salt)) {
    throw new Error('invalid credentials');
  }
  assertPasswordAllowed(newPassword, {
    username: cur.username,
    email: cur.email,
    oldPassword
  });
  const { hash, salt } = hashPassword(newPassword);
  users.updatePassword(userId, hash, salt, { resetRequired: false });
}
