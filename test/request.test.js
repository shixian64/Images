import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { clientIp, shouldTrustForwardedHeaders } from '../utils/request.js';

async function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function req(headers = {}, remoteAddress = '203.0.113.10') {
  return {
    headers,
    socket: { remoteAddress }
  };
}

test('clientIp ignores X-Forwarded-For unless TRUST_PROXY=1', async () => {
  await withEnv({ TRUST_PROXY: undefined, TRUST_PROXY_ALLOWED_IPS: undefined }, () => {
    assert.equal(
      clientIp(req({ 'x-forwarded-for': '198.51.100.23' })),
      '203.0.113.10'
    );
  });
});

test('clientIp ignores forwarded address from non-allowlisted proxies', async () => {
  await withEnv({ TRUST_PROXY: '1', TRUST_PROXY_ALLOWED_IPS: '127.0.0.1' }, () => {
    assert.equal(shouldTrustForwardedHeaders(req({ 'x-forwarded-for': '198.51.100.23' })), false);
    assert.equal(
      clientIp(req({ 'x-forwarded-for': '198.51.100.23' })),
      '203.0.113.10'
    );
  });
});

test('clientIp uses first forwarded address when TRUST_PROXY=1 and proxy is allowlisted', async () => {
  await withEnv({ TRUST_PROXY: '1', TRUST_PROXY_ALLOWED_IPS: '203.0.113.10' }, () => {
    assert.equal(shouldTrustForwardedHeaders(req({ 'x-forwarded-for': '198.51.100.23' })), true);
    assert.equal(
      clientIp(req({ 'x-forwarded-for': '198.51.100.23, 198.51.100.24' })),
      '198.51.100.23'
    );
  });
});

test('clientIp supports IPv4 CIDR proxy allowlists', async () => {
  await withEnv({ TRUST_PROXY: '1', TRUST_PROXY_ALLOWED_IPS: '203.0.113.0/24' }, () => {
    assert.equal(
      clientIp(req({ 'x-real-ip': '198.51.100.50' }, '203.0.113.200')),
      '198.51.100.50'
    );
    assert.equal(
      clientIp(req({ 'x-real-ip': '198.51.100.50' }, '198.51.100.200')),
      '198.51.100.200'
    );
  });
});
