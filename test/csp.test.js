import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SECURITY_HEADERS } from '../utils/http.js';

test('content security policy does not allow inline scripts or styles', () => {
  const csp = SECURITY_HEADERS['content-security-policy'];

  assert.match(csp, /script-src 'self'(?:;|$)/);
  assert.match(csp, /style-src 'self'(?:;|$)/);
  assert.doesNotMatch(csp, /'unsafe-inline'/);
});

test('entry HTML uses external scripts and styles for CSP compatibility', () => {
  for (const file of ['public/index.html', 'public/login.html']) {
    const html = readFileSync(file, 'utf8');
    const scriptTags = html.match(/<script\b[^>]*>/gi) || [];

    assert.doesNotMatch(html, /<style\b/i, `${file} must not contain inline <style>`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${file} must not contain inline style attributes`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} must not contain inline event handlers`);
    for (const tag of scriptTags) {
      assert.match(tag, /\ssrc=/i, `${file} script must be external: ${tag}`);
    }
  }
});
