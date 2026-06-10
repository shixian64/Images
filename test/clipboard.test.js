import assert from 'node:assert/strict';
import test from 'node:test';

import { copyText, dismissManualCopyFallback } from '../public/modules/clipboard.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.id = '';
    this.type = '';
    this.focused = false;
    this.selected = false;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.listeners.get('click')?.({ target: this });
  }

  focus() {
    this.focused = true;
  }

  select() {
    this.selected = true;
  }
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function installFakeDom(t, { execResult = false } = {}) {
  const oldDocument = globalThis.document;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const calls = [];
  const doc = {
    body: null,
    execCommand(command) {
      calls.push(command);
      return execResult;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return findById(doc.body, id);
    }
  };
  doc.body = new FakeElement('body');
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true
  });

  t.after(() => {
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  });

  return { doc, calls };
}

test('copyText prefers navigator.clipboard when available', async (t) => {
  const { calls } = installFakeDom(t, { execResult: true });
  const written = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (value) => written.push(value) } },
    configurable: true
  });

  const result = await copyText('hello');

  assert.deepEqual(written, ['hello']);
  assert.deepEqual(calls, []);
  assert.equal(result.method, 'clipboard');
});

test('copyText falls back to execCommand copy and removes the hidden textarea', async (t) => {
  const { doc, calls } = installFakeDom(t, { execResult: true });

  const result = await copyText('hello');

  assert.deepEqual(calls, ['copy']);
  assert.equal(result.method, 'execCommand');
  assert.equal(doc.body.children.length, 0);
});

test('copyText leaves a selected manual fallback when automatic copy fails', async (t) => {
  const { doc } = installFakeDom(t, { execResult: false });

  const result = await copyText('manual secret');

  assert.equal(result.method, 'manual');
  assert.equal(result.manual, true);
  assert.equal(result.textarea.value, 'manual secret');
  assert.equal(result.textarea.focused, true);
  assert.equal(result.textarea.selected, true);
  assert.equal(doc.getElementById('clipboardManualCopy'), result.element);

  dismissManualCopyFallback(doc);
  assert.equal(doc.getElementById('clipboardManualCopy'), null);
});
