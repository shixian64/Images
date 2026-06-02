import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const ENV_KEYS = [
  'ALLOW_INSECURE_UPSTREAMS',
  'ALLOW_PRIVATE_UPSTREAMS',
  'DEFAULT_DAILY_LIMIT',
  'DEFAULT_MONTHLY_LIMIT',
  'DEFAULT_STORAGE_LIMIT_MB',
  'DEFAULT_CONCURRENT_LIMIT',
  'SIGNUP_IP_DAILY_LIMIT',
  'SIGNUP_IP_MONTHLY_LIMIT',
  'CHAT_RATE_LIMIT_MAX_PER_MINUTE',
  'CHAT_GLOBAL_CONCURRENT_REQUESTS',
  'CHAT_COMPLETION_TIMEOUT_MS'
];

function jsonReq(body, user, { ip = '198.51.100.77' } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'user-agent': 'node-test' };
  req.socket = { remoteAddress: ip };
  req.session = { user };
  return req;
}

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

async function callChat(handleChat, body, user) {
  const req = jsonReq(body, user);
  const res = captureRes();
  await handleChat(req, res);
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body || '{}')
  };
}

async function waitFor(fn, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}

test('system default chat requests use managed quota while custom chat bypasses it', async (t) => {
  const prevCwd = process.cwd();
  const prevEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const workDir = mkdtempSync(join(tmpdir(), 'image-studio-chat-quota-'));
  process.chdir(workDir);

  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, {
    ALLOW_INSECURE_UPSTREAMS: '1',
    ALLOW_PRIVATE_UPSTREAMS: '1',
    DEFAULT_DAILY_LIMIT: '1',
    DEFAULT_CONCURRENT_LIMIT: '1',
    CHAT_RATE_LIMIT_MAX_PER_MINUTE: 'disabled',
    CHAT_GLOBAL_CONCURRENT_REQUESTS: 'disabled',
    CHAT_COMPLETION_TIMEOUT_MS: '5000'
  });

  let upstreamHits = 0;
  let heldChatResponse = null;
  let heldChatSeen = false;
  function sendChatOk(res) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '优化后提示词' } }] }));
  }
  const upstream = http.createServer(async (req, res) => {
    upstreamHits += 1;
    assert.equal(req.url, '/v1/chat/completions');
    const chunks = [];
    for await (const _chunk of req) {
      chunks.push(_chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (rawBody.includes('hold concurrency') && !heldChatSeen) {
      heldChatSeen = true;
      heldChatResponse = res;
      return;
    }
    sendChatOk(res);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  t.after(async () => {
    await new Promise((resolve) => upstream.close(resolve));
    process.chdir(prevCwd);
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  });

  const db = await import('../services/db.js');
  const auth = await import('../services/auth.js');
  const quota = await import('../services/quota.js');
  const interfaceDefaults = await import('../services/interface-defaults.js');
  const { handleChat } = await import('../routes/chat.js');
  db.migrate();

  const { port } = upstream.address();
  interfaceDefaults.setGlobalInterfaceConfig({
    enabled: true,
    name: 'System Chat Test',
    image: { apiKey: 'sk-system-image' },
    chat: {
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'sk-system-chat',
      defaultModel: 'gpt-test'
    }
  }, 'test');

  const user = auth.register({
    username: 'chat_quota_user',
    email: 'chat_quota_user@example.com',
    password: 'longenough1'
  });
  if (user.role === 'admin') db.users.updateRole(user.id, 'user');
  user.role = 'user';
  const body = {
    useSystemDefault: true,
    quotaPurpose: 'prompt_optimize',
    model: 'gpt-test',
    messages: [{ role: 'user', content: '请优化提示词' }]
  };

  const first = await callChat(handleChat, body, user);
  assert.equal(first.statusCode, 200);
  assert.equal(quota.usageSnapshot(user.id).today.calls, 1);
  assert.equal(quota.usageSnapshot(user.id).today.promptOptimizations, 1);

  const second = await callChat(handleChat, body, user);
  assert.equal(second.statusCode, 429);
  assert.equal(second.body.code, 'daily_limit_exceeded');
  assert.equal(upstreamHits, 1);

  const concurrentUser = auth.register({
    username: 'chat_quota_race',
    email: 'chat_quota_race@example.com',
    password: 'longenough1'
  });
  const concurrentBody = {
    ...body,
    messages: [{ role: 'user', content: 'hold concurrency' }]
  };
  const firstConcurrent = callChat(handleChat, concurrentBody, concurrentUser);
  const held = await waitFor(() => heldChatResponse);
  assert.ok(held, 'first concurrent request should reach upstream and stay pending');

  const secondConcurrent = await callChat(handleChat, concurrentBody, concurrentUser);
  assert.equal(secondConcurrent.statusCode, 429);
  assert.equal(secondConcurrent.body.code, 'daily_limit_exceeded');
  assert.equal(upstreamHits, 2);

  sendChatOk(heldChatResponse);
  heldChatResponse = null;
  const firstConcurrentResult = await firstConcurrent;
  assert.equal(firstConcurrentResult.statusCode, 200);
  assert.equal(quota.usageSnapshot(concurrentUser.id).today.calls, 1);
  assert.equal(quota.usageSnapshot(concurrentUser.id).today.promptOptimizations, 1);
  assert.equal(upstreamHits, 2);

  const customUser = auth.register({
    username: 'chat_custom_bypass',
    email: 'chat_custom_bypass@example.com',
    password: 'longenough1'
  });
  quota.recordSuccess(customUser.id, { calls: 1, images: 1 });
  const custom = await callChat(handleChat, {
    chatBaseUrl: `http://127.0.0.1:${port}`,
    chatApiKey: 'sk-custom',
    model: 'gpt-test',
    messages: [{ role: 'user', content: '自定义接口不占用日月次数' }]
  }, customUser);
  assert.equal(custom.statusCode, 200);
  assert.equal(quota.usageSnapshot(customUser.id).today.calls, 1);
  assert.equal(quota.usageSnapshot(customUser.id).today.promptOptimizations, 0);
  assert.equal(upstreamHits, 3);

  const storageFullUser = auth.register({
    username: 'chat_storage_full',
    email: 'chat_storage_full@example.com',
    password: 'longenough1'
  });
  quota.patchUserQuota(storageFullUser.id, { storage_limit_mb: 1 }, 'test');
  db.images.insert({
    id: 'chat-storage-full-existing',
    userId: storageFullUser.id,
    createdAt: new Date().toISOString(),
    filename: 'existing.png',
    path: `users/${storageFullUser.id}/images/2026-04-29/existing.png`,
    mimeType: 'image/png',
    bytes: 1024 * 1024,
    isPublic: false,
    prompt: 'existing storage',
    model: 'test-image-model',
    sourceType: 'b64_json',
    index: 1
  });
  const storageFullChat = await callChat(handleChat, body, storageFullUser);
  assert.equal(storageFullChat.statusCode, 200);
  assert.equal(quota.usageSnapshot(storageFullUser.id).today.calls, 1);
  assert.equal(quota.usageSnapshot(storageFullUser.id).today.promptOptimizations, 1);
  assert.equal(upstreamHits, 4);
});
