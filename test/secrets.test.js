import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canEncryptSecrets,
  isProtectedSecret,
  protectSecret,
  reencryptSecret,
  unprotectSecret,
  unprotectSecretWithMaster
} from '../services/secrets.js';

test('protectSecret encrypts when IMAGE_STUDIO_SECRET_KEY is configured', () => {
  const previous = {
    IMAGE_STUDIO_SECRET_KEY: process.env.IMAGE_STUDIO_SECRET_KEY,
    SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY,
    APP_SECRET_KEY: process.env.APP_SECRET_KEY,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PLAINTEXT_SYSTEM_KEYS: process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS
  };
  process.env.IMAGE_STUDIO_SECRET_KEY = 'unit-test-master-secret';
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;
  try {
    const protectedValue = protectSecret('sk-secret-value');
    assert.equal(canEncryptSecrets(), true);
    assert.equal(isProtectedSecret(protectedValue), true);
    assert.notEqual(protectedValue.includes('sk-secret-value'), true);
    assert.equal(unprotectSecret(protectedValue), 'sk-secret-value');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('protectSecret preserves legacy plaintext compatibility without a master key', () => {
  const previous = {
    IMAGE_STUDIO_SECRET_KEY: process.env.IMAGE_STUDIO_SECRET_KEY,
    SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY,
    APP_SECRET_KEY: process.env.APP_SECRET_KEY,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PLAINTEXT_SYSTEM_KEYS: process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS
  };
  delete process.env.IMAGE_STUDIO_SECRET_KEY;
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  process.env.NODE_ENV = 'development';
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;
  try {
    assert.equal(protectSecret('sk-legacy'), 'sk-legacy');
    assert.equal(unprotectSecret('sk-legacy'), 'sk-legacy');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('protectSecret rejects plaintext system key storage in production without a master key', () => {
  const previous = {
    IMAGE_STUDIO_SECRET_KEY: process.env.IMAGE_STUDIO_SECRET_KEY,
    SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY,
    APP_SECRET_KEY: process.env.APP_SECRET_KEY,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PLAINTEXT_SYSTEM_KEYS: process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS
  };
  delete process.env.IMAGE_STUDIO_SECRET_KEY;
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;
  try {
    assert.throws(
      () => protectSecret('sk-prod-secret'),
      /IMAGE_STUDIO_SECRET_KEY is required/
    );

    process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS = '1';
    assert.equal(protectSecret('sk-prod-secret'), 'sk-prod-secret');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('reencryptSecret rotates protected values to a new master key', () => {
  const previous = {
    IMAGE_STUDIO_SECRET_KEY: process.env.IMAGE_STUDIO_SECRET_KEY,
    SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY,
    APP_SECRET_KEY: process.env.APP_SECRET_KEY,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_PLAINTEXT_SYSTEM_KEYS: process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS
  };
  process.env.IMAGE_STUDIO_SECRET_KEY = 'old-master-secret';
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_PLAINTEXT_SYSTEM_KEYS;
  try {
    const oldProtected = protectSecret('sk-rotated-secret');
    const rotated = reencryptSecret(oldProtected, {
      currentSecret: 'old-master-secret',
      nextSecret: 'new-master-secret'
    });

    assert.equal(isProtectedSecret(rotated), true);
    assert.notEqual(rotated, oldProtected);
    assert.equal(unprotectSecretWithMaster(rotated, 'new-master-secret'), 'sk-rotated-secret');
    assert.throws(() => unprotectSecretWithMaster(rotated, 'old-master-secret'));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('reencryptSecret can migrate legacy plaintext values into encrypted storage', () => {
  const rotated = reencryptSecret('sk-legacy-plaintext', {
    nextSecret: 'new-master-secret'
  });

  assert.equal(isProtectedSecret(rotated), true);
  assert.equal(unprotectSecretWithMaster(rotated, 'new-master-secret'), 'sk-legacy-plaintext');
});
