// 认证核心：密码哈希、注册、登录、session 读取与销毁。
// TAG: hmt---

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { users, sessions } from './db.js';

// scrypt 参数按 plan §安全要点
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 一天毫秒数，用于判断是否需要滑动续期
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS).toString('hex');
  return { hash, salt };
}

export function verifyPassword(plain, hash, salt) {
  if (typeof hash !== 'string' || typeof salt !== 'string') return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS);
  // 等长才能走 timingSafeEqual
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// 输入校验，错误直接抛给路由层统一转 400
function assertValidCredentials({ username, email, password }) {
  if (!username || !email || !password) {
    throw new Error('username, email and password are required');
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error('invalid username');
  }
  if (!EMAIL_RE.test(email)) {
    throw new Error('invalid email');
  }
  if (String(password).length < 8) {
    throw new Error('password must be at least 8 characters');
  }
}

function isValidAdminBootstrapToken(token) {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, password_salt, ...rest } = row;
  return rest;
}

export function register({ username, email, password, adminBootstrapToken }) {
  assertValidCredentials({ username, email, password });
  if (adminBootstrapToken && !isValidAdminBootstrapToken(adminBootstrapToken)) {
    throw new Error('invalid admin bootstrap token');
  }
  // 查重（username / email 分别查一次，区分错误信息）
  if (users.findByLogin(username)) {
    throw new Error('username already taken');
  }
  if (users.findByLogin(email)) {
    throw new Error('email already taken');
  }
  const { hash, salt } = hashPassword(password);
  // 管理员必须通过部署时设置的 ADMIN_BOOTSTRAP_TOKEN 显式初始化；
  // 避免空库状态下任意首位注册者直接变成 admin。
  const role = users.countAdmins() === 0 && isValidAdminBootstrapToken(adminBootstrapToken)
    ? 'admin'
    : 'user';
  const row = users.create({
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role
  });
  return sanitizeUser(row);
}

export function login({ login: loginId, password, ua, ip }) {
  if (!loginId || !password) throw new Error('invalid credentials');
  const row = users.findByLogin(loginId);
  if (!row) throw new Error('invalid credentials');
  if (row.status === 'disabled') throw new Error('invalid credentials');
  if (!verifyPassword(password, row.password_hash, row.password_salt)) {
    throw new Error('invalid credentials');
  }
  users.touchLogin(row.id);
  const sessionId = randomBytes(32).toString('hex');
  sessions.create({ id: sessionId, userId: row.id, userAgent: ua, ip });
  // 重新取一次以带上最新 last_login_at
  const fresh = users.findById(row.id);
  return { user: sanitizeUser(fresh), sessionId };
}

// 直接创建 session（注册后自动登录用）
export function createSession({ userId, ua, ip }) {
  const sessionId = randomBytes(32).toString('hex');
  sessions.create({ id: sessionId, userId, userAgent: ua, ip });
  return sessionId;
}

export function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  const now = Date.now();
  const expiresTs = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresTs) || expiresTs <= now) {
    sessions.destroy(sessionId);
    return null;
  }
  const user = users.findById(session.user_id);
  if (!user) {
    sessions.destroy(sessionId);
    return null;
  }
  if (user.status === 'disabled') {
    sessions.destroy(sessionId);
    return null;
  }
  // 剩余不足一天时滑动续期，避免活跃用户被登出
  if (expiresTs - now < ONE_DAY_MS) {
    const newExpires = sessions.extend(sessionId);
    session.expires_at = newExpires;
  }
  return { user: sanitizeUser(user), session };
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  sessions.destroy(sessionId);
}
