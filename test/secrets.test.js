import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canEncryptSecrets,
  isProtectedSecret,
  protectSecret,
  unprotectSecret
} from '../services/secrets.js';

test('protectSecret encrypts when IMAGE_STUDIO_SECRET_KEY is configured', () => {
  const previous = {
    IMAGE_STUDIO_SECRET_KEY: process.env.IMAGE_STUDIO_SECRET_KEY,
    SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY,
    APP_SECRET_KEY: process.env.APP_SECRET_KEY
  };
  process.env.IMAGE_STUDIO_SECRET_KEY = 'unit-test-master-secret';
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
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
    APP_SECRET_KEY: process.env.APP_SECRET_KEY
  };
  delete process.env.IMAGE_STUDIO_SECRET_KEY;
  delete process.env.SECRETS_MASTER_KEY;
  delete process.env.APP_SECRET_KEY;
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
