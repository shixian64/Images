import test from 'node:test';
import assert from 'node:assert/strict';

import { setCurrentUser } from '../public/modules/auth.js';
import {
  KEYS,
  readString,
  readStringScoped,
  writeString,
  writeStringScoped
} from '../public/modules/state.js';

function installLocalStorage(t) {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  t.after(() => {
    delete globalThis.localStorage;
    setCurrentUser(null);
  });

  return store;
}

test('localStorage reads migrate legacy image-key-manager keys to image-studio keys', (t) => {
  const store = installLocalStorage(t);
  store.set('image-key-manager.theme', 'dark');

  assert.equal(readString(KEYS.theme, 'light'), 'dark');
  assert.equal(store.get('image-studio.theme'), 'dark');

  writeString(KEYS.theme, 'system');
  assert.equal(store.get('image-studio.theme'), 'system');
  assert.equal(store.has('image-key-manager.theme'), false);
});

test('scoped localStorage keys migrate legacy per-user data', (t) => {
  const store = installLocalStorage(t);
  setCurrentUser({ id: 'user-1' });
  store.set('image-key-manager.promptDraft:user-1', 'old prompt');

  assert.equal(readStringScoped(KEYS.promptDraft, ''), 'old prompt');
  assert.equal(store.get('image-studio.promptDraft:user-1'), 'old prompt');

  writeStringScoped(KEYS.promptDraft, 'new prompt');
  assert.equal(store.get('image-studio.promptDraft:user-1'), 'new prompt');
  assert.equal(store.has('image-key-manager.promptDraft:user-1'), false);
});
