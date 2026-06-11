import test from 'node:test';
import assert from 'node:assert/strict';

import { setLocale } from '../public/modules/i18n.js';
import { createImagePreviewController } from '../public/modules/image-preview.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(name) {
    this.values.add(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.focused = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (Object.hasOwn(this, name)) delete this[name];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }

  focus() {
    this.focused = true;
  }

  querySelector(selector) {
    if (!selector?.startsWith?.('.')) return null;
    const className = selector.slice(1);
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (String(node.className || '').split(/\s+/).includes(className)) return node;
      stack.push(...(node.children || []));
    }
    return null;
  }
}

function installDom(t) {
  const oldDocument = globalThis.document;
  const body = new FakeElement('body');
  globalThis.document = {
    body,
    createElement: (tagName) => new FakeElement(tagName)
  };
  t.after(() => {
    globalThis.document = oldDocument;
  });
  return { body };
}

test.beforeEach(() => {
  setLocale('zh-CN');
});

test('image preview controller builds and closes the modal without HTML injection', (t) => {
  const { body } = installDom(t);
  const trigger = new FakeElement('button');
  const controller = createImagePreviewController({
    ariaLabel: '预览',
    closeLabel: '关闭',
    closeAttribute: 'data-close-preview'
  });

  assert.equal(controller.open({ src: '/image.png', alt: 'sample image', trigger }), true);

  const modal = controller.getModal();
  assert.equal(modal.className, 'image-preview-modal');
  assert.equal(modal.hidden, false);
  assert.equal(modal.innerHTML, '');
  assert.equal(modal.attributes.role, 'dialog');
  assert.equal(modal.attributes['aria-modal'], 'true');
  assert.equal(modal.attributes['aria-label'], '预览');
  assert.equal(body.classList.contains('preview-open'), true);

  const img = modal.querySelector('.image-preview-image');
  assert.equal(img.src, '/image.png');
  assert.equal(img.alt, 'sample image');

  const closeButton = modal.querySelector('.image-preview-close');
  assert.equal(closeButton.textContent, '×');
  assert.equal(closeButton.attributes['aria-label'], '关闭');
  assert.equal(closeButton.hasAttribute('data-close-preview'), true);
  assert.equal(closeButton.focused, true);

  assert.equal(controller.close(), true);
  assert.equal(modal.hidden, true);
  assert.equal(img.src, undefined);
  assert.equal(body.classList.contains('preview-open'), false);
  assert.equal(trigger.focused, true);
});

test('image preview controller uses localized default labels', (t) => {
  installDom(t);

  const zh = createImagePreviewController();
  assert.equal(zh.open({ src: '/zh.png' }), true);
  let modal = zh.getModal();
  assert.equal(modal.attributes['aria-label'], '图片预览');
  assert.equal(modal.querySelector('.image-preview-close').attributes['aria-label'], '关闭图片预览');

  setLocale('en-US');
  const en = createImagePreviewController();
  assert.equal(en.open({ src: '/en.png' }), true);
  modal = en.getModal();
  assert.equal(modal.attributes['aria-label'], 'Image preview');
  assert.equal(modal.querySelector('.image-preview-close').attributes['aria-label'], 'Close image preview');
});

test('image preview controller supports URL transforms and referrer policy', (t) => {
  installDom(t);
  const controller = createImagePreviewController({
    modalClass: 'prompt-square-image-preview-modal',
    referrerPolicy: 'no-referrer',
    transformUrl: (url) => `${url}?large=1`
  });

  const longAlt = 'a'.repeat(200);
  assert.equal(controller.open({ src: 'https://cdn.example.test/p.png', alt: longAlt }), true);

  const modal = controller.getModal();
  assert.equal(modal.className, 'image-preview-modal prompt-square-image-preview-modal');
  const img = modal.querySelector('.image-preview-image');
  assert.equal(img.src, 'https://cdn.example.test/p.png?large=1');
  assert.equal(img.alt.length, 120);
  assert.equal(img.attributes.referrerpolicy, 'no-referrer');
  assert.equal(img.referrerPolicy, 'no-referrer');
});

test('image preview controller closes from the configured backdrop attribute', (t) => {
  const { body } = installDom(t);
  const controller = createImagePreviewController({ closeAttribute: 'data-close-preview' });
  assert.equal(controller.open({ src: '/image.png' }), true);

  const modal = controller.getModal();
  const backdrop = modal.querySelector('.image-preview-backdrop');
  modal.dispatch('click', { target: backdrop });

  assert.equal(controller.isOpen(), false);
  assert.equal(body.classList.contains('preview-open'), false);
});
