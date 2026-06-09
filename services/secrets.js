// 对运行时可恢复的系统级密钥做加密封装。
// 开发环境未配置 IMAGE_STUDIO_SECRET_KEY 时保持兼容的明文存储；
// 生产环境默认拒绝新写入明文系统级密钥，除非显式打开兼容开关。

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const PROTECTED_SECRET_PREFIX = 'enc:v1:';

const AAD = Buffer.from('image-key-manager:secret:v1', 'utf8');
const SECRET_ENV_NAMES = Object.freeze([
  'IMAGE_STUDIO_SECRET_KEY',
  'SECRETS_MASTER_KEY',
  'APP_SECRET_KEY'
]);

function envFlagEnabled(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function masterSecret() {
  for (const name of SECRET_ENV_NAMES) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function encryptionKeyFromSecret(secret) {
  if (!secret) return null;
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptionKey() {
  return encryptionKeyFromSecret(masterSecret());
}

function encryptPlaintext(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PROTECTED_SECRET_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

function decryptProtected(stored, key) {
  const parts = stored.split(':');
  if (parts.length !== 5) throw new Error('invalid encrypted secret format');
  const [, version, ivRaw, tagRaw, encryptedRaw] = parts;
  if (version !== 'v1') throw new Error('unsupported encrypted secret version');

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

export function canEncryptSecrets() {
  return Boolean(encryptionKey());
}

export function requiresSecretEncryption() {
  return process.env.NODE_ENV === 'production' && !envFlagEnabled('ALLOW_PLAINTEXT_SYSTEM_KEYS');
}

export function isProtectedSecret(value) {
  return typeof value === 'string' && value.startsWith(PROTECTED_SECRET_PREFIX);
}

export function protectSecret(value) {
  const plain = String(value || '');
  if (!plain || isProtectedSecret(plain)) return plain;

  const key = encryptionKey();
  if (!key) {
    if (requiresSecretEncryption()) {
      throw new Error('IMAGE_STUDIO_SECRET_KEY is required to store system API keys in production');
    }
    return plain;
  }
  return encryptPlaintext(plain, key);
}

export function protectSecretWithMaster(value, master) {
  const plain = String(value || '');
  if (!plain || isProtectedSecret(plain)) return plain;
  const key = encryptionKeyFromSecret(String(master || '').trim());
  if (!key) throw new Error('new IMAGE_STUDIO_SECRET_KEY is required to rotate system API keys');
  return encryptPlaintext(plain, key);
}

export function secretUnavailableError() {
  const err = new Error('encrypted secret cannot be decrypted because IMAGE_STUDIO_SECRET_KEY is not configured');
  err.code = 'secret_key_unavailable';
  return err;
}

export function unprotectSecret(value) {
  const stored = String(value || '');
  if (!stored || !isProtectedSecret(stored)) return stored;

  const key = encryptionKey();
  if (!key) throw secretUnavailableError();
  return decryptProtected(stored, key);
}

export function unprotectSecretWithMaster(value, master) {
  const stored = String(value || '');
  if (!stored || !isProtectedSecret(stored)) return stored;

  const key = encryptionKeyFromSecret(String(master || '').trim());
  if (!key) throw secretUnavailableError();
  return decryptProtected(stored, key);
}

export function reencryptSecret(value, { currentSecret = '', nextSecret = '' } = {}) {
  const stored = String(value || '');
  if (!stored) return '';
  const plain = isProtectedSecret(stored)
    ? unprotectSecretWithMaster(stored, currentSecret)
    : stored;
  return protectSecretWithMaster(plain, nextSecret);
}
