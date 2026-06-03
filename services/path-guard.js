// 用户图片目录路径守卫，防穿越。

import { join, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'generated');
const USERS_ROOT = join(ROOT, 'users');

export const guardPaths = Object.freeze({
  generatedRoot: ROOT,
  usersRoot: USERS_ROOT
});

export function userImageDir(userId) {
  if (!isValidUserId(userId)) {
    throw new Error('invalid userId');
  }
  return join(USERS_ROOT, userId, 'images');
}

export function userImageRel(userId) {
  if (!isValidUserId(userId)) {
    throw new Error('invalid userId');
  }
  return `users/${userId}/images`;
}

export function assertUserPath(absPath, userId) {
  const expectedPrefix = resolve(userImageDir(userId)) + sep;
  const real = resolve(absPath);
  if (real !== expectedPrefix.slice(0, -1) && !real.startsWith(expectedPrefix)) {
    throw new Error('path outside user dir');
  }
  return real;
}

export function isUnderUserImages(absPath) {
  const real = resolve(absPath);
  const prefix = resolve(USERS_ROOT) + sep;
  return real.startsWith(prefix);
}

export function userIdFromUserPath(relPath) {
  // relPath like "users/<uid>/images/..."
  const m = String(relPath || '').match(/^users\/([^/\\]+)\/images\//);
  return m && isValidUserId(m[1]) ? m[1] : null;
}

function isValidUserId(id) {
  return typeof id === 'string' &&
    id !== '.' &&
    id !== '..' &&
    /^[a-zA-Z0-9._-]{1,128}$/.test(id);
}
