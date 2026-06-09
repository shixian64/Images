import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}

class FakeElement extends FakeNode {
  constructor(id = '') {
    super();
    this.id = id;
    this.hidden = true;
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this.attributes = {};
    this.classList = {
      values: new Set(),
      add: (name) => this.classList.values.add(name),
      remove: (name) => this.classList.values.delete(name),
      contains: (name) => this.classList.values.has(name)
    };
  }

  replaceChildren() {
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  addEventListener() {}

  removeAttribute(name) {
    delete this.attributes[name];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  closest() {
    return null;
  }
}

function installDrawerDom(t) {
  const oldDocument = globalThis.document;
  const oldNode = globalThis.Node;
  const elements = new Map([
    ['appDrawer', new FakeElement('appDrawer')],
    ['appDrawerEyebrow', new FakeElement('appDrawerEyebrow')],
    ['appDrawerTitle', new FakeElement('appDrawerTitle')],
    ['appDrawerBody', new FakeElement('appDrawerBody')]
  ]);
  const body = new FakeElement('body');

  globalThis.Node = FakeNode;
  globalThis.document = {
    body,
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener() {}
  };

  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.Node = oldNode;
  });

  return { elements, body };
}

test('drawer renders string bodies as text by default', async (t) => {
  const { elements } = installDrawerDom(t);
  const drawer = await import(`../public/modules/drawer.js?safe=${Date.now()}-${Math.random()}`);

  drawer.open({ title: 'Safe', body: '<img src=x onerror=alert(1)>' });

  const bodyEl = elements.get('appDrawerBody');
  assert.equal(bodyEl.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(bodyEl.innerHTML, '');
  assert.deepEqual(bodyEl.children, []);
});

test('drawer only renders HTML strings when explicitly requested', async (t) => {
  const { elements } = installDrawerDom(t);
  const drawer = await import(`../public/modules/drawer.js?html=${Date.now()}-${Math.random()}`);

  drawer.open({ title: 'HTML', body: '<strong>ok</strong>', unsafeHtml: true });

  const bodyEl = elements.get('appDrawerBody');
  assert.equal(bodyEl.innerHTML, '<strong>ok</strong>');
  assert.equal(bodyEl.textContent, '');
});

test('drawer update keeps the same safe default', async (t) => {
  const { elements } = installDrawerDom(t);
  const drawer = await import(`../public/modules/drawer.js?update=${Date.now()}-${Math.random()}`);

  drawer.open({ body: '<em>trusted</em>', unsafeHtml: true });
  drawer.update({ body: '<script>alert(1)</script>' });

  const bodyEl = elements.get('appDrawerBody');
  assert.equal(bodyEl.textContent, '<script>alert(1)</script>');
  assert.equal(bodyEl.innerHTML, '');
});
