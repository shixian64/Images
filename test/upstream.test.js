import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAllowedUpstreamUrl,
  buildChatPayload,
  buildImagePayload,
  buildMultipartBody,
  callUpstream,
  readResponseTextLimited,
  resolveApiUrl,
  resolveChatCompletionsUrl,
  resolveImageEditsUrl,
  resolveModelsUrl
} from '../services/upstream.js';

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

// --- resolveApiUrl ---

test('resolveApiUrl 追加 /v1/images/generations', () => {
  assert.equal(resolveApiUrl('https://api.openai.com'), 'https://api.openai.com/v1/images/generations');
});

test('resolveApiUrl 不重复追加 /v1', () => {
  assert.equal(resolveApiUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/images/generations');
  assert.equal(resolveApiUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/images/generations');
});

test('resolveApiUrl 对自定义网关也生效', () => {
  assert.equal(
    resolveApiUrl('https://gateway.example.com/openai'),
    'https://gateway.example.com/openai/v1/images/generations'
  );
});

test('resolveImageEditsUrl 追加 /v1/images/edits', () => {
  assert.equal(resolveImageEditsUrl('https://api.openai.com'), 'https://api.openai.com/v1/images/edits');
  assert.equal(resolveImageEditsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/images/edits');
});

test('resolveApiUrl 空值 / 非法 URL 抛错', () => {
  assert.throws(() => resolveApiUrl(''), /Base URL is required/);
  assert.throws(() => resolveApiUrl('   '), /Base URL is required/);
  assert.throws(() => resolveApiUrl('not a url'));
  assert.throws(() => resolveApiUrl('file:///tmp/socket'), /http or https/);
});

test('buildMultipartBody serializes repeated image files', () => {
  const multipart = buildMultipartBody({
    fields: { model: 'gpt-image-2', prompt: 'edit me' },
    files: [
      { fieldName: 'image[]', filename: 'a.png', contentType: 'image/png', buffer: Buffer.from('a') },
      { fieldName: 'image[]', filename: 'b.png', contentType: 'image/png', buffer: Buffer.from('b') }
    ]
  });
  const raw = multipart.body.toString('latin1');
  assert.match(multipart.contentType, /^multipart\/form-data; boundary=/);
  assert.match(raw, /name="model"/);
  assert.match(raw, /gpt-image-2/);
  assert.equal((raw.match(/name="image\[\]"/g) || []).length, 2);
});

// --- SSRF guard ---

test('assertAllowedUpstreamUrl 允许解析到公网地址的 HTTPS 上游', async () => {
  await assert.doesNotReject(() => assertAllowedUpstreamUrl('https://gateway.example.com/v1/models', {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }]
  }));
});

test('assertAllowedUpstreamUrl returns a lookup pinned to vetted DNS records', async () => {
  await withEnv({ NODE_ENV: 'production', ALLOW_PRIVATE_UPSTREAMS: '0' }, async () => {
    const policy = await assertAllowedUpstreamUrl('https://gateway.example.com/v1/models', {
      lookupImpl: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }
      ]
    });
    assert.equal(typeof policy.lookup, 'function');
    const first = await new Promise((resolve, reject) => {
      policy.lookup('gateway.example.com', {}, (err, address, family) => {
        if (err) reject(err);
        else resolve({ address, family });
      });
    });
    assert.deepEqual(first, { address: '93.184.216.34', family: 4 });
  });
});

test('assertAllowedUpstreamUrl 默认拒绝 HTTP 上游', async () => {
  await assert.rejects(() => assertAllowedUpstreamUrl('http://gateway.example.com/v1/models', {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }]
  }), /https/);
});

test('assertAllowedUpstreamUrl rejects localhost and private upstreams in production', async () => {
  await withEnv({ NODE_ENV: 'production', ALLOW_PRIVATE_UPSTREAMS: '0' }, async () => {
    await assert.rejects(() => assertAllowedUpstreamUrl('https://localhost/v1/models'), /not allowed/);
    await assert.rejects(() => assertAllowedUpstreamUrl('https://127.0.0.1/v1/models'), /not allowed/);
    await assert.rejects(() => assertAllowedUpstreamUrl('https://10.0.0.1/v1/models'), /not allowed/);
    await assert.rejects(() => assertAllowedUpstreamUrl('https://evil.example/v1/models', {
      lookupImpl: async () => [{ address: '192.168.1.10', family: 4 }]
    }), /private address/);
  });
});

test('assertAllowedUpstreamUrl rejects private upstreams by default in development', async () => {
  await withEnv({ NODE_ENV: 'development', ALLOW_PRIVATE_UPSTREAMS: undefined }, async () => {
    await assert.rejects(() => assertAllowedUpstreamUrl('https://internal.example/v1/models', {
      lookupImpl: async () => [{ address: '192.168.1.10', family: 4 }]
    }), /private address/);
  });
});

test('assertAllowedUpstreamUrl allows private upstreams only with explicit opt-in', async () => {
  await withEnv({ NODE_ENV: 'development', ALLOW_PRIVATE_UPSTREAMS: '1' }, async () => {
    await assert.doesNotReject(() => assertAllowedUpstreamUrl('https://internal.example/v1/models', {
      lookupImpl: async () => [{ address: '192.168.1.10', family: 4 }]
    }));
  });
});

test('assertAllowedUpstreamUrl rejects private IPv4-mapped IPv6 addresses in production', async () => {
  await withEnv({ NODE_ENV: 'production', ALLOW_PRIVATE_UPSTREAMS: '0' }, async () => {
    await assert.rejects(() => assertAllowedUpstreamUrl('https://[::ffff:127.0.0.1]/v1/models'), /not allowed/);
    await assert.rejects(() => assertAllowedUpstreamUrl('https://[::ffff:169.254.169.254]/v1/models'), /not allowed/);
    await assert.rejects(() => assertAllowedUpstreamUrl('https://evil.example/v1/models', {
      lookupImpl: async () => [{ address: '::ffff:7f00:1', family: 6 }]
    }), /private address/);
  });
});

test('callUpstream disables automatic fetch redirects', async () => {
  const result = await callUpstream({
    targetUrl: 'https://gateway.example.com/v1/chat/completions',
    apiKey: 'sk-test',
    payload: { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'manual');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  assert.equal(result.ok, true);
});

test('callUpstream rejects upstream responses over byte limit', async () => {
  await withEnv({ MAX_UPSTREAM_RESPONSE_BYTES: '8' }, async () => {
    await assert.rejects(
      () => callUpstream({
        targetUrl: 'https://gateway.example.com/v1/chat/completions',
        apiKey: 'sk-test',
        payload: { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
        fetchImpl: async () => new Response('0123456789', { status: 200 })
      }),
      /Upstream response too large/
    );
  });
});

test('readResponseTextLimited decodes streamed utf8 without concatenating a response buffer', async () => {
  const text = JSON.stringify({ message: '你好，stream 🌟' });
  const bytes = new TextEncoder().encode(text);
  const response = new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 3) {
        controller.enqueue(bytes.subarray(offset, Math.min(bytes.length, offset + 3)));
      }
      controller.close();
    }
  }), { status: 200 });

  assert.equal(await readResponseTextLimited(response, 1024), text);
});

test('callUpstream applies timeout while reading response body', async () => {
  let canceled = false;
  const encoder = new TextEncoder();
  const result = await callUpstream({
    targetUrl: 'https://gateway.example.com/v1/chat/completions',
    apiKey: 'sk-test',
    payload: { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
    timeoutMs: 25,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"partial":'));
      },
      cancel() {
        canceled = true;
      }
    }), { status: 200 })
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.match(result.data?.error?.message, /timed out/);
  assert.equal(canceled, true);
});

test('callUpstream allows timeout to be disabled', async () => {
  const result = await callUpstream({
    targetUrl: 'https://gateway.example.com/v1/chat/completions',
    apiKey: 'sk-test',
    payload: { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
    timeoutMs: null,
    fetchImpl: async (_url, options) => {
      assert.equal(options.signal.aborted, false);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { ok: true });
});

// --- resolveModelsUrl ---

test('resolveModelsUrl 指向 /v1/models', () => {
  assert.equal(resolveModelsUrl('https://api.openai.com'), 'https://api.openai.com/v1/models');
  assert.equal(resolveModelsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/models');
});

// --- resolveChatCompletionsUrl ---

test('resolveChatCompletionsUrl 指向 /v1/chat/completions', () => {
  assert.equal(resolveChatCompletionsUrl('https://api.openai.com'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(resolveChatCompletionsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions');
});

// --- buildImagePayload ---

test('buildImagePayload 需要 prompt', () => {
  assert.throws(() => buildImagePayload({}), /Prompt is required/);
  assert.throws(() => buildImagePayload({ prompt: '   ' }), /Prompt is required/);
});

test('buildImagePayload 默认模型 gpt-image-2', () => {
  const p = buildImagePayload({ prompt: 'a cat' });
  assert.equal(p.model, 'gpt-image-2');
  assert.equal(p.n, 1);
});

test('buildImagePayload 过滤 auto 值', () => {
  const p = buildImagePayload({
    prompt: 'x',
    size: 'auto',
    quality: 'high',
    background: 'transparent',
    output_format: 'png'
  });
  assert.equal(p.quality, 'high');
  assert.equal(p.output_format, 'png');
  assert.ok(!('size' in p), 'auto 值的 size 不应传给上游');
  assert.ok(!('background' in p), 'background 不应传给上游');
});

test('buildImagePayload 会 trim prompt', () => {
  const p = buildImagePayload({ prompt: '  hi  ' });
  assert.equal(p.prompt, 'hi');
});

test('buildImagePayload 只带白名单字段，忽略未知字段', () => {
  const p = buildImagePayload({ prompt: 'x', evil_field: 'boom', apiKey: 'sk-xxx' });
  assert.ok(!('evil_field' in p));
  assert.ok(!('apiKey' in p), 'apiKey 绝不能跟进 upstream body');
});

// --- buildChatPayload ---

test('buildChatPayload 需要 messages 或 prompt', () => {
  assert.throws(() => buildChatPayload({}), /Messages are required/);
  assert.throws(() => buildChatPayload({ messages: [] }), /Messages are required/);
});

test('buildChatPayload 支持 prompt 简写并使用默认对话模型', () => {
  const p = buildChatPayload({ prompt: 'hello' });
  assert.equal(p.model, 'gpt-5.5');
  assert.deepEqual(p.messages, [{ role: 'user', content: 'hello' }]);
});

test('buildChatPayload 支持 messages 与可选参数白名单', () => {
  const p = buildChatPayload({
    model: 'custom-chat',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2,
    max_tokens: 128,
    stream: true,
    apiKey: 'sk-xxx',
    baseUrl: 'https://api.openai.com'
  });
  assert.equal(p.model, 'custom-chat');
  assert.equal(p.temperature, 0.2);
  assert.equal(p.max_tokens, 128);
  assert.ok(!('stream' in p), '当前 JSON 代理不透传 stream');
  assert.ok(!('apiKey' in p));
  assert.ok(!('baseUrl' in p));
});
