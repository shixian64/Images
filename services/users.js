// 用户管理服务：admin 侧的列表/改角色/改状态，以及当前用户的资料/密码维护。
// TAG: hmt---

import { users } from './db.js';
import { hashPassword, verifyPassword, sanitizeUser } from './auth.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['admin', 'user']);
const VALID_STATUSES = new Set(['active', 'disabled']);

export function listUsers() {
  return users.list();
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

  const updated = users.updateProfile(userId, {
    username: username ?? cur.username,
    email: email ?? cur.email,
    avatarUrl: avatarUrl ?? cur.avatar_url
  });
  return sanitizeUser(updated);
}

export function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) throw new Error('old and new password are required');
  if (String(newPassword).length < 8) throw new Error('password must be at least 8 characters');
  const cur = users.findById(userId);
  if (!cur) throw new Error('user not found');
  if (!verifyPassword(oldPassword, cur.password_hash, cur.password_salt)) {
    throw new Error('invalid credentials');
  }
  const { hash, salt } = hashPassword(newPassword);
  users.updatePassword(userId, hash, salt);
}
