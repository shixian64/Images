import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { clientIp } from '../utils/request.js';

async function withTrustProxy(value, fn) {
  const previous = process.env.TRUST_PROXY;
  if (value === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
}

function req(headers = {}) {
  return {
    headers,
    socket: { remoteAddress: '203.0.113.10' }
  };
}

test('clientIp ignores X-Forwarded-For unless TRUST_PROXY=1', async () => {
  await withTrustProxy(undefined, () => {
    assert.equal(
      clientIp(req({ 'x-forwarded-for': '198.51.100.23' })),
      '203.0.113.10'
    );
  });
});

test('clientIp uses first forwarded address when TRUST_PROXY=1', async () => {
  await withTrustProxy('1', () => {
    assert.equal(
      clientIp(req({ 'x-forwarded-for': '198.51.100.23, 198.51.100.24' })),
      '198.51.100.23'
    );
  });
});
