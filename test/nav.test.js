import test from 'node:test';
import assert from 'node:assert/strict';

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains(name) {
      return values.has(name);
    },
    toggle(name, force) {
      const enabled = Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    }
  };
}

function makeElement({ id = '', dataset = {}, classes = [], hidden = false } = {}) {
  return {
    id,
    dataset,
    hidden,
    classList: createClassList(classes)
  };
}

test('switchTab activates comic tab discovered from DOM panels', async (t) => {
  const oldDocument = globalThis.document;
  const oldLocalStorage = globalThis.localStorage;
  const oldCustomEvent = globalThis.CustomEvent;
  const studioButton = makeElement({ dataset: { tab: 'studioPanel' }, classes: ['tab-button', 'active'] });
  const comicButton = makeElement({ dataset: { tab: 'comicPanel' }, classes: ['tab-button'] });
  const studioPanel = makeElement({ id: 'studioPanel', classes: ['tab-panel', 'active'] });
  const comicPanel = makeElement({ id: 'comicPanel', classes: ['tab-panel'] });
  const elements = [studioButton, comicButton, studioPanel, comicPanel];
  const byId = new Map(elements.filter((el) => el.id).map((el) => [el.id, el]));
  const events = [];
  const storage = new Map();

  globalThis.document = {
    getElementById(id) {
      return byId.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.tab-button') return [studioButton, comicButton];
      if (selector === '.tab-panel') return [studioPanel, comicPanel];
      return [];
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };
  globalThis.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.localStorage = oldLocalStorage;
    globalThis.CustomEvent = oldCustomEvent;
  });

  const { switchTab } = await import('../public/modules/nav.js');
  switchTab('comicPanel');

  assert.equal(comicPanel.classList.contains('active'), true);
  assert.equal(studioPanel.classList.contains('active'), false);
  assert.equal(comicButton.classList.contains('active'), true);
  assert.equal(studioButton.classList.contains('active'), false);
  assert.equal(storage.get('image-key-manager.activeTab'), 'comicPanel');
  assert.deepEqual(events.at(-1)?.detail, { tabId: 'comicPanel' });
});
