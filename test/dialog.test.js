import assert from 'node:assert/strict';
import test from 'node:test';

import { closeDialog, presentDialog } from '../public/modules/dialog.js';

class FakeElement {
  constructor(name = 'el') {
    this.name = name;
    this.hidden = false;
    this.attributes = {};
    this.listeners = new Map();
    this.classList = {
      values: new Set(),
      add: (value) => this.classList.values.add(value),
      contains: (value) => this.classList.values.has(value)
    };
  }

  focus() {
    document.activeElement = this;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return !event.defaultPrevented;
  }
}

class FakeDialog extends FakeElement {
  constructor(focusable = []) {
    super('dialog');
    this.focusable = focusable;
    this.returnValue = '';
  }

  querySelectorAll() {
    return this.focusable;
  }
}

function keyboardEvent(key, options = {}) {
  return {
    type: 'keydown',
    key,
    shiftKey: Boolean(options.shiftKey),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

function installDocument(t) {
  const oldDocument = globalThis.document;
  const oldEvent = globalThis.Event;
  const opener = new FakeElement('opener');
  globalThis.document = { activeElement: opener };
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };

  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.Event = oldEvent;
  });

  return { opener };
}

test('fallback dialog presentation sets modal semantics and traps focus', async (t) => {
  const { opener } = installDocument(t);
  const first = new FakeElement('first');
  const last = new FakeElement('last');
  const dlg = new FakeDialog([first, last]);

  const cleanup = presentDialog(dlg);
  await Promise.resolve();

  assert.equal(dlg.getAttribute('open'), '');
  assert.equal(dlg.getAttribute('role'), 'dialog');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  assert.equal(dlg.classList.contains('app-dialog-fallback'), true);
  assert.equal(document.activeElement, first);

  document.activeElement = last;
  const forwardTab = keyboardEvent('Tab');
  dlg.dispatchEvent(forwardTab);
  assert.equal(forwardTab.defaultPrevented, true);
  assert.equal(document.activeElement, first);

  document.activeElement = first;
  const backwardTab = keyboardEvent('Tab', { shiftKey: true });
  dlg.dispatchEvent(backwardTab);
  assert.equal(backwardTab.defaultPrevented, true);
  assert.equal(document.activeElement, last);

  cleanup();
  assert.equal(document.activeElement, opener);
});

test('fallback dialog Escape closes with cancel return value', (t) => {
  installDocument(t);
  const dlg = new FakeDialog();
  let closed = false;
  dlg.addEventListener('close', () => { closed = true; });
  presentDialog(dlg);

  const escape = keyboardEvent('Escape');
  dlg.dispatchEvent(escape);

  assert.equal(escape.defaultPrevented, true);
  assert.equal(closed, true);
  assert.equal(dlg.returnValue, 'cancel');
  assert.equal(dlg.getAttribute('open'), null);
});

test('closeDialog uses native close when available', () => {
  let closedWith = null;
  const dlg = {
    returnValue: '',
    close(value) {
      closedWith = value;
      this.returnValue = value;
    }
  };

  closeDialog(dlg, 'confirm');

  assert.equal(closedWith, 'confirm');
  assert.equal(dlg.returnValue, 'confirm');
});
