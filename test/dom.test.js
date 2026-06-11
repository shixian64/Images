import assert from 'node:assert/strict';
import test from 'node:test';

import { maskKey, setStatus } from '../public/modules/dom.js';
import { setLocale } from '../public/modules/i18n.js';

class FakeStatusElement {
  constructor() {
    this.textContent = '';
    this.dataset = {};
  }
}

function installStatusDom(t) {
  const oldDocument = globalThis.document;
  const el = new FakeStatusElement();

  globalThis.document = {
    getElementById(id) {
      return id === 'status' ? el : null;
    }
  };

  t.after(() => {
    setStatus('reset', 'ready', 0);
    globalThis.document = oldDocument;
  });

  return el;
}

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('maskKey keeps masking shape and localizes the empty state', () => {
  assert.equal(maskKey('sk-1234567890'), 'sk-1••••7890');
  assert.equal(maskKey('abcd'), 'ab••••');
  assert.equal(maskKey(''), '未填写 Key');

  setLocale('en-US');
  assert.equal(maskKey(''), 'Missing key');
});

test('setStatus auto reset uses the active locale ready label', (t) => {
  const status = installStatusDom(t);
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  let capturedCallback = null;
  let capturedDelay = null;

  globalThis.setTimeout = (callback, delay) => {
    capturedCallback = callback;
    capturedDelay = delay;
    return 42;
  };
  globalThis.clearTimeout = () => {};

  t.after(() => {
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  });

  setLocale('en-US');
  setStatus('Working', 'busy', 25);

  assert.equal(status.textContent, 'Working');
  assert.equal(status.dataset.state, 'busy');
  assert.equal(capturedDelay, 25);

  capturedCallback();
  assert.equal(status.textContent, 'Ready');
  assert.equal(status.dataset.state, 'ready');
});
