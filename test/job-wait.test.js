import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelGenerationJob,
  createAbortError,
  fetchGenerationJob,
  waitForGenerationJob
} from '../public/modules/job-wait.js';

function jobEvent(job) {
  const ev = new Event('generation-job-finished');
  Object.defineProperty(ev, 'detail', { value: { job } });
  return ev;
}

test('fetchGenerationJob finds a job in the API list', async () => {
  const apiFetch = async (url, options) => {
    assert.equal(url, '/api/jobs');
    assert.deepEqual(options, { headers: { accept: 'application/json' } });
    return {
      ok: true,
      json: async () => ({ items: [{ id: 'a' }, { id: 'b', status: 'succeeded' }] })
    };
  };

  assert.deepEqual(await fetchGenerationJob('b', { apiFetch }), { id: 'b', status: 'succeeded' });
  assert.equal(await fetchGenerationJob('missing', { apiFetch }), null);
});

test('waitForGenerationJob resolves from finish events and ignores other jobs', async () => {
  const eventTarget = new EventTarget();
  const waited = waitForGenerationJob('target', {
    eventTarget,
    timeoutMs: 200,
    pollMs: 1000
  });

  eventTarget.dispatchEvent(jobEvent({ id: 'other', status: 'succeeded' }));
  eventTarget.dispatchEvent(jobEvent({ id: 'target', status: 'failed' }));

  assert.deepEqual(await waited, { id: 'target', status: 'failed' });
});

test('waitForGenerationJob resolves from polling and rejects on abort', async () => {
  let polls = 0;
  const polled = await waitForGenerationJob('poll-me', {
    eventTarget: new EventTarget(),
    timeoutMs: 200,
    pollMs: 1,
    fetchJob: async () => {
      polls += 1;
      return { id: 'poll-me', status: polls > 1 ? 'succeeded' : 'running' };
    }
  });
  assert.equal(polled.status, 'succeeded');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    waitForGenerationJob('abort-me', {
      eventTarget: new EventTarget(),
      signal: controller.signal,
      timeoutMs: 200,
      pollMs: 1000,
      abortErrorFactory: () => createAbortError('stop')
    }),
    { name: 'AbortError', message: 'stop' }
  );
});

test('cancelGenerationJob is best effort', async () => {
  const calls = [];
  const ok = await cancelGenerationJob('job/1', {
    apiFetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true };
    }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: '/api/jobs/job%2F1/cancel',
    options: { method: 'POST' }
  }]);

  const failed = await cancelGenerationJob('job/2', {
    apiFetch: async () => { throw new Error('gone'); }
  });
  assert.equal(failed, false);
});
