import test from 'node:test';
import assert from 'node:assert/strict';

import { setCurrentUser } from '../public/modules/auth.js';
import { KEYS, userKey } from '../public/modules/state.js';
import {
  doneJobDismissalKey,
  isDoneJobDismissed,
  readDismissedDoneJobs,
  removeDismissalsForJobIds,
  writeDismissedDoneJobs
} from '../public/modules/job-dismissal.js';

function installLocalStorage() {
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
    },
    clear() {
      store.clear();
    }
  };
}

test.beforeEach(() => {
  installLocalStorage();
  setCurrentUser({ id: 'user-a' });
});

test.afterEach(() => {
  setCurrentUser(null);
  delete globalThis.localStorage;
});

test('dismissed done jobs persist per current user', () => {
  const written = writeDismissedDoneJobs([
    'job-1:succeeded:1',
    'job-1:succeeded:1',
    '',
    'job-2:failed:2'
  ]);

  assert.deepEqual([...written], ['job-1:succeeded:1', 'job-2:failed:2']);
  assert.deepEqual([...readDismissedDoneJobs()], ['job-1:succeeded:1', 'job-2:failed:2']);
  assert.equal(
    localStorage.getItem(userKey(KEYS.jobQueueDismissedDone)),
    JSON.stringify(['job-1:succeeded:1', 'job-2:failed:2'])
  );

  setCurrentUser({ id: 'user-b' });
  assert.deepEqual([...readDismissedDoneJobs()], []);
});

test('dismissal key is tied to one terminal job version', () => {
  const oldJob = { id: 'job-1', status: 'succeeded', finishedAt: 100, updatedAt: 100 };
  const nextRun = { id: 'job-1', status: 'succeeded', finishedAt: 200, updatedAt: 200 };
  const differentStatus = { id: 'job-1', status: 'failed', finishedAt: 100, updatedAt: 100 };
  const keys = writeDismissedDoneJobs([doneJobDismissalKey(oldJob)]);

  assert.equal(isDoneJobDismissed(oldJob, keys), true);
  assert.equal(isDoneJobDismissed(nextRun, keys), false);
  assert.equal(isDoneJobDismissed(differentStatus, keys), false);
});

test('active jobs remove stale dismissal records for the same id', () => {
  let keys = writeDismissedDoneJobs([
    'job-1:succeeded:1',
    'job-2:failed:2',
    'job-1'
  ]);

  keys = removeDismissalsForJobIds(keys, ['job-1']);

  assert.deepEqual([...keys], ['job-2:failed:2']);
  assert.deepEqual([...readDismissedDoneJobs()], ['job-2:failed:2']);
});
