// 认证核心：密码哈希、注册、登录、session 读取与销毁。
// TAG: hmt---

import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { users, sessions } from './db.js';
import { assertPasswordAllowed } from './password-policy.js';

// scrypt 参数按 plan §安全要点
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;
const scryptAsync = promisify(scrypt);

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CSRF_TOKEN_BYTES = 32;

// 一天毫秒数，用于判断是否需要滑动续期
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function allowInsecureFirstAdmin() {
  return String(process.env.ALLOW_FIRST_ADMIN_WITHOUT_TOKEN || '').trim() === '1';
}

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS).toString('hex');
  return { hash, salt };
}

export async function hashPasswordAsync(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(plain, salt, KEY_LEN, SCRYPT_OPTS);
  return { hash: Buffer.from(hash).toString('hex'), salt };
}

export function verifyPassword(plain, hash, salt) {
  if (typeof hash !== 'string' || typeof salt !== 'string') return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS);
  // 等长才能走 timingSafeEqual
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function verifyPasswordAsync(plain, hash, salt) {
  if (typeof hash !== 'string' || typeof salt !== 'string') return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(plain, salt, KEY_LEN, SCRYPT_OPTS);
  const actualBuffer = Buffer.from(actual);
  if (expected.length !== actualBuffer.length) return false;
  return timingSafeEqual(expected, actualBuffer);
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
  assertPasswordAllowed(password, { username, email });
}

function createCsrfToken() {
  return randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

export function isValidAdminBootstrapToken(token) {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function canUseAdminBootstrapToken(token) {
  return users.countAdmins() === 0 && isValidAdminBootstrapToken(token);
}

export function canCreateFirstAdminWithoutToken() {
  if (users.count() !== 0) return false;
  return process.env.NODE_ENV !== 'production' || allowInsecureFirstAdmin();
}

export function isFirstAdminBootstrapRequired() {
  return users.count() === 0 && !canCreateFirstAdminWithoutToken();
}

export function canInitializeAdminRegistration({ adminBootstrapToken } = {}) {
  if (adminBootstrapToken) return canUseAdminBootstrapToken(adminBootstrapToken);
  return canCreateFirstAdminWithoutToken();
}

export function sanitizeUser(row, { includeSecurity = false } = {}) {
  if (!row) return null;
  const { password_hash, password_salt, ...rest } = row;
  const passwordResetRequired = Boolean(rest.password_reset_required);
  rest.password_reset_required = passwordResetRequired;
  rest.passwordResetRequired = passwordResetRequired;
  rest.avatar_url = publicAvatarUrl(rest.avatar_url);
  if (!includeSecurity) {
    delete rest.signup_ip;
    delete rest.signup_user_agent;
  }
  return rest;
}

function publicAvatarUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function register({ username, email, password, adminBootstrapToken, signupIp, signupUserAgent }) {
  assertValidCredentials({ username, email, password });
  const hasBootstrapToken = Boolean(adminBootstrapToken);
  if (hasBootstrapToken) {
    if (!isValidAdminBootstrapToken(adminBootstrapToken)) {
      throw new Error('invalid admin bootstrap token');
    }
    if (users.countAdmins() > 0) {
      throw new Error('admin bootstrap token is no longer accepted');
    }
  }
  if (!hasBootstrapToken && isFirstAdminBootstrapRequired()) {
    throw new Error('admin bootstrap token required');
  }
  // 查重（username / email 分别查一次，区分错误信息）
  if (users.findByLogin(username)) {
    throw new Error('username already taken');
  }
  if (users.findByLogin(email)) {
    throw new Error('email already taken');
  }
  const { hash, salt } = hashPassword(password);
  // 开发/本地仍允许空库首个注册账号自动成为 admin；生产环境默认要求 bootstrap token。
  // 兼容旧部署：如果库里已有普通用户但没有活跃 admin，仍允许用有效令牌初始化 admin。
  const role = (users.count() === 0 || hasBootstrapToken) ? 'admin' : 'user';
  const row = users.create({
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role,
    signupIp,
    signupUserAgent
  });
  return sanitizeUser(row);
}

export async function registerAsync({ username, email, password, adminBootstrapToken, signupIp, signupUserAgent }) {
  assertValidCredentials({ username, email, password });
  const hasBootstrapToken = Boolean(adminBootstrapToken);
  if (hasBootstrapToken) {
    if (!isValidAdminBootstrapToken(adminBootstrapToken)) {
      throw new Error('invalid admin bootstrap token');
    }
    if (users.countAdmins() > 0) {
      throw new Error('admin bootstrap token is no longer accepted');
    }
  }
  if (!hasBootstrapToken && isFirstAdminBootstrapRequired()) {
    throw new Error('admin bootstrap token required');
  }
  if (users.findByLogin(username)) {
    throw new Error('username already taken');
  }
  if (users.findByLogin(email)) {
    throw new Error('email already taken');
  }
  const { hash, salt } = await hashPasswordAsync(password);
  if (users.findByLogin(username)) {
    throw new Error('username already taken');
  }
  if (users.findByLogin(email)) {
    throw new Error('email already taken');
  }
  const role = (users.count() === 0 || hasBootstrapToken) ? 'admin' : 'user';
  const row = users.create({
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role,
    signupIp,
    signupUserAgent
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
  const csrfToken = createCsrfToken();
  sessions.create({ id: sessionId, userId: row.id, userAgent: ua, ip, csrfToken });
  // 重新取一次以带上最新 last_login_at
  const fresh = users.findById(row.id);
  return { user: sanitizeUser(fresh), sessionId, csrfToken };
}

export async function loginAsync({ login: loginId, password, ua, ip }) {
  if (!loginId || !password) throw new Error('invalid credentials');
  const row = users.findByLogin(loginId);
  if (!row) throw new Error('invalid credentials');
  if (row.status === 'disabled') throw new Error('invalid credentials');
  if (!await verifyPasswordAsync(password, row.password_hash, row.password_salt)) {
    throw new Error('invalid credentials');
  }
  users.touchLogin(row.id);
  const sessionId = randomBytes(32).toString('hex');
  const csrfToken = createCsrfToken();
  sessions.create({ id: sessionId, userId: row.id, userAgent: ua, ip, csrfToken });
  const fresh = users.findById(row.id);
  return { user: sanitizeUser(fresh), sessionId, csrfToken };
}

// 直接创建 session（注册后自动登录用）
export function createSession({ userId, ua, ip }) {
  const sessionId = randomBytes(32).toString('hex');
  const csrfToken = createCsrfToken();
  sessions.create({ id: sessionId, userId, userAgent: ua, ip, csrfToken });
  return { sessionId, csrfToken };
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
  let renewed = false;
  if (expiresTs - now < ONE_DAY_MS) {
    const newExpires = sessions.extend(sessionId);
    session.expires_at = newExpires;
    renewed = true;
  }
  return { user: sanitizeUser(user), session, csrfToken: session.csrf_token || '', renewed };
}

export function ensureSessionCsrfToken(sessionId) {
  if (!sessionId) return '';
  const session = sessions.get(sessionId);
  if (!session) return '';
  const existing = String(session.csrf_token || '').trim();
  if (existing) return existing;
  const csrfToken = createCsrfToken();
  sessions.setCsrfToken(sessionId, csrfToken);
  return csrfToken;
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  sessions.destroy(sessionId);
}
