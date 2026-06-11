import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSseBlock,
  readGenerateStream
} from '../public/modules/studio-stream.js';

function streamFromChunks(chunks = []) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

test('studio stream parser handles event names, comments, CRLF, and multiline data', () => {
  assert.deepEqual(parseSseBlock([
    ': connected',
    'event: progress\r',
    'data: {"a":1}\r',
    'data: {"b":2}'
  ].join('\n')), {
    event: 'progress',
    data: '{"a":1}\n{"b":2}'
  });
});

test('studio stream reader returns result and emits progress events', async () => {
  const progress = [];
  const result = await readGenerateStream({
    body: streamFromChunks([
      'event: progress\n',
      'data: {"message":"queued"}\n\n',
      'event: result\n',
      'data: {"ok":true,"items":[1]}\n\n'
    ])
  }, {
    onProgress: (event) => progress.push(event)
  });

  assert.deepEqual(progress, [{ message: 'queued' }]);
  assert.deepEqual(result, { ok: true, items: [1] });
});

test('studio stream reader handles plain progress data and terminal errors', async () => {
  const progress = [];
  await assert.rejects(
    () => readGenerateStream({
      body: streamFromChunks([
        'event: progress\n',
        'data: still working\n\n',
        'event: error\n',
        'data: {"error":"upstream failed"}\n\n'
      ])
    }, {
      onProgress: (event) => progress.push(event)
    }),
    /upstream failed/
  );
  assert.deepEqual(progress, [{ message: 'still working' }]);
});
