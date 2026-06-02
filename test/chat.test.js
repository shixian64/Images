import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareChatRequestBody } from '../routes/chat.js';

async function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('prepareChatRequestBody adds and clamps completion token limits', async () => {
  await withEnv({
    CHAT_DEFAULT_MAX_COMPLETION_TOKENS: '100',
    CHAT_MAX_COMPLETION_TOKENS: '200'
  }, () => {
    const withDefault = prepareChatRequestBody({ prompt: 'optimize this' });
    assert.equal(withDefault.max_completion_tokens, 100);

    const clamped = prepareChatRequestBody({ prompt: 'x', max_completion_tokens: 999 });
    assert.equal(clamped.max_completion_tokens, 200);
  });
});

test('prepareChatRequestBody default ceiling allows comic storyboard requests', async () => {
  await withEnv({
    CHAT_MAX_COMPLETION_TOKENS: undefined
  }, () => {
    const comicStoryboard = prepareChatRequestBody({ prompt: 'comic storyboard', max_completion_tokens: 5200 });
    assert.equal(comicStoryboard.max_completion_tokens, 5200);
  });
});

test('prepareChatRequestBody rejects oversized chat inputs', async () => {
  await withEnv({
    CHAT_MAX_MESSAGES: '2',
    CHAT_MAX_INPUT_CHARS: '8'
  }, () => {
    assert.throws(
      () => prepareChatRequestBody({ messages: [{ content: 'a' }, { content: 'b' }, { content: 'c' }] }),
      /too many chat messages/
    );
    assert.throws(
      () => prepareChatRequestBody({ prompt: '123456789' }),
      /chat input too large/
    );
  });
});
