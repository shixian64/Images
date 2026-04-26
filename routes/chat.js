// POST /api/chat —— 对话模型代理。
// 前端可传入 chatBaseUrl/chatApiKey，也兼容 baseUrl/apiKey；上游按 OpenAI-compatible /v1/chat/completions 调用。

import { readJsonBody, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { assertAllowedUpstreamUrl, buildChatPayload, callUpstream, resolveChatCompletionsUrl } from '../services/upstream.js';
import { getSystemEndpoint } from '../services/interface-defaults.js';
import { hit as rateLimitHit } from '../services/rate-limit.js';
import { clientIp } from '../utils/request.js';
import {
  assertCanGenerate,
  recordFailure,
  recordSuccess
} from '../services/quota.js';

const DEFAULT_CHAT_RATE_LIMIT_MAX_PER_MINUTE = 20;
const DEFAULT_CHAT_GLOBAL_CONCURRENT_REQUESTS = 4;
const DEFAULT_CHAT_MAX_MESSAGES = 12;
const DEFAULT_CHAT_MAX_INPUT_CHARS = 12_000;
const DEFAULT_CHAT_MAX_COMPLETION_TOKENS = 1_200;
const DEFAULT_CHAT_COMPLETION_TOKEN_CEILING = 2_000;
const DEFAULT_CHAT_COMPLETION_TIMEOUT_MS = 180_000;
const CHAT_QUOTA_COST = 1;

let activeChatRequests = 0;

function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const text = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'none', 'null', 'disabled'].includes(text)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function makeHttpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function chatLimitSnapshot() {
  return {
    rateMax: envPositiveInt('CHAT_RATE_LIMIT_MAX_PER_MINUTE', DEFAULT_CHAT_RATE_LIMIT_MAX_PER_MINUTE),
    rateWindowMs: envPositiveInt('CHAT_RATE_LIMIT_WINDOW_MS', 60_000),
    globalConcurrent: envPositiveInt('CHAT_GLOBAL_CONCURRENT_REQUESTS', DEFAULT_CHAT_GLOBAL_CONCURRENT_REQUESTS),
    maxMessages: envPositiveInt('CHAT_MAX_MESSAGES', DEFAULT_CHAT_MAX_MESSAGES),
    maxInputChars: envPositiveInt('CHAT_MAX_INPUT_CHARS', DEFAULT_CHAT_MAX_INPUT_CHARS),
    defaultMaxCompletionTokens: envPositiveInt(
      'CHAT_DEFAULT_MAX_COMPLETION_TOKENS',
      DEFAULT_CHAT_MAX_COMPLETION_TOKENS
    ),
    maxCompletionTokens: envPositiveInt(
      'CHAT_MAX_COMPLETION_TOKENS',
      DEFAULT_CHAT_COMPLETION_TOKEN_CEILING
    ),
    timeoutMs: envPositiveInt('CHAT_COMPLETION_TIMEOUT_MS', DEFAULT_CHAT_COMPLETION_TIMEOUT_MS)
  };
}

function estimateInputChars(body = {}) {
  const messages = Array.isArray(body.messages)
    ? body.messages
    : (body.prompt || body.input) ? [{ content: body.prompt ?? body.input }] : [];
  return messages.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const content = item.content;
    if (Array.isArray(content)) return sum + content.reduce((n, part) => n + String(part?.text || part || '').length, 0);
    return sum + String(content ?? '').length;
  }, 0);
}

function countMessages(body = {}) {
  if (Array.isArray(body.messages)) return body.messages.length;
  return (body.prompt || body.input) ? 1 : 0;
}

function clampCompletionTokens(value, limit, fallback) {
  if (!limit) return value ?? fallback ?? undefined;
  if (value === undefined || value === null || value === '') return fallback ? Math.min(fallback, limit) : undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw makeHttpError(400, 'invalid max completion tokens', 'invalid_chat_limit');
  return Math.min(Math.floor(n), limit);
}

export function prepareChatRequestBody(body = {}) {
  const limits = chatLimitSnapshot();
  const messageCount = countMessages(body);
  if (limits.maxMessages && messageCount > limits.maxMessages) {
    throw makeHttpError(400, `too many chat messages (max ${limits.maxMessages})`, 'chat_messages_too_many');
  }
  const inputChars = estimateInputChars(body);
  if (limits.maxInputChars && inputChars > limits.maxInputChars) {
    throw makeHttpError(400, `chat input too large (max ${limits.maxInputChars} characters)`, 'chat_input_too_large');
  }

  const next = { ...body };
  if (next.max_tokens !== undefined && next.max_completion_tokens !== undefined) {
    next.max_completion_tokens = clampCompletionTokens(
      next.max_completion_tokens,
      limits.maxCompletionTokens,
      limits.defaultMaxCompletionTokens
    );
    next.max_tokens = clampCompletionTokens(next.max_tokens, limits.maxCompletionTokens, null);
  } else if (next.max_tokens !== undefined) {
    next.max_tokens = clampCompletionTokens(next.max_tokens, limits.maxCompletionTokens, limits.defaultMaxCompletionTokens);
  } else {
    next.max_completion_tokens = clampCompletionTokens(
      next.max_completion_tokens,
      limits.maxCompletionTokens,
      limits.defaultMaxCompletionTokens
    );
  }
  return next;
}

function checkChatRateLimit(req, res) {
  const { rateMax, rateWindowMs } = chatLimitSnapshot();
  if (!rateMax || !rateWindowMs) return true;
  const ip = clientIp(req);
  const userId = req.session?.user?.id || 'anonymous';
  const checks = [
    `chat:user:${userId}`,
    `chat:ip:${ip}`
  ];
  for (const key of checks) {
    const result = rateLimitHit(key, rateMax, rateWindowMs);
    if (!result.allowed) {
      res.setHeader('retry-after', Math.ceil(result.retryAfterMs / 1000));
      sendJson(res, 429, { error: 'chat rate limited', code: 'chat_rate_limited' });
      return false;
    }
  }
  return true;
}

function tryAcquireChatSlot() {
  const { globalConcurrent: limit } = chatLimitSnapshot();
  if (!limit) return { ok: true, release: () => {}, active: activeChatRequests, limit: null };
  if (activeChatRequests >= limit) {
    return {
      ok: false,
      active: activeChatRequests,
      limit,
      message: `当前对话队列已满（${activeChatRequests}/${limit}），请稍后再试。`
    };
  }
  activeChatRequests += 1;
  let released = false;
  return {
    ok: true,
    active: activeChatRequests,
    limit,
    release: () => {
      if (released) return;
      released = true;
      activeChatRequests = Math.max(0, activeChatRequests - 1);
    }
  };
}

function shouldUseSystemDefault(body = {}) {
  return body.useSystemDefault === true || body.interfaceMode === 'system';
}

function resolveChatRequest(body = {}) {
  if (shouldUseSystemDefault(body)) {
    const endpoint = getSystemEndpoint('chat');
    return {
      apiKey: endpoint.apiKey,
      targetUrl: resolveChatCompletionsUrl(endpoint.baseUrl),
      profileName: endpoint.name || '系统默认接口',
      bodyForPayload: {
        ...body,
        model: body.model || body.chatModel || endpoint.defaultModel,
        chatModel: body.chatModel || body.model || endpoint.defaultModel
      },
      usingSystemDefault: true
    };
  }

  const apiKey = String(body.chatApiKey || body.apiKey || '').trim();
  if (!apiKey) throw new Error('API key is required.');
  return {
    apiKey,
    targetUrl: resolveChatCompletionsUrl(body.chatBaseUrl || body.baseUrl),
    profileName: body.name,
    bodyForPayload: body,
    usingSystemDefault: false
  };
}

function checkChatQuota(userInfo, { model } = {}) {
  if (!userInfo?.id || userInfo.role === 'admin') return { ok: true, cost: CHAT_QUOTA_COST };
  const check = assertCanGenerate(userInfo.id, { n: CHAT_QUOTA_COST });
  if (!check.ok) {
    logger.warn('chat.completion.quota_exceeded', {
      userId: userInfo.id,
      code: check.code,
      model
    });
  }
  return { ...check, cost: CHAT_QUOTA_COST };
}

function recordChatQuotaSuccess(userInfo) {
  if (!userInfo?.id) return;
  recordSuccess(userInfo.id, { calls: CHAT_QUOTA_COST, images: 0, bytes: 0 });
}

function recordChatQuotaFailure(userInfo) {
  if (!userInfo?.id) return;
  recordFailure(userInfo.id, { calls: CHAT_QUOTA_COST });
}

export async function handleChat(req, res) {
  const started = Date.now();
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = {};
  let releaseChatSlot = null;
  try {
    body = await readJsonBody(req);
    body = prepareChatRequestBody(body);
    if (!checkChatRateLimit(req, res)) return;

    const requestConfig = resolveChatRequest(body);
    const { apiKey, targetUrl, bodyForPayload, usingSystemDefault } = requestConfig;
    await assertAllowedUpstreamUrl(targetUrl);
    const payload = buildChatPayload(bodyForPayload);

    // 提示词优化走 /api/chat，同样占用“生图次数”额度：普通用户按 1 次检查，
    // 管理员延续生图接口语义（不拦截，但仍记录用量便于审计）。
    const quotaCheck = checkChatQuota(req.session.user, { model: payload.model });
    if (!quotaCheck.ok) {
      return sendJson(res, 429, { error: quotaCheck.message, code: quotaCheck.code });
    }

    const slot = tryAcquireChatSlot();
    if (!slot.ok) {
      logger.warn('chat.completion.queue_full', {
        userId: req.session.user.id,
        active: slot.active,
        limit: slot.limit
      });
      return sendJson(res, 429, { error: slot.message, code: 'chat_concurrent_limit_exceeded' });
    }
    releaseChatSlot = slot.release;

    logger.info('chat.completion.request', {
      targetUrl,
      model: payload.model,
      profileName: requestConfig.profileName,
      usingSystemDefault,
      userId: req.session.user.id,
      apiKey: maskApiKey(apiKey)
    });

    const { ok, status, data, durationMs } = await callUpstream({
      targetUrl,
      apiKey,
      payload,
      timeoutMs: chatLimitSnapshot().timeoutMs,
      timeoutMessage: 'Upstream chat completion timed out.'
    });

    if (!ok) {
      const errMsg = data?.error?.message || data?.message || `Request failed with ${status}`;
      logger.error('chat.completion.failed', {
        status, durationMs, model: payload.model, error: errMsg
      });
      recordChatQuotaFailure(req.session.user);
      return sendJson(res, status, { error: errMsg });
    }

    logger.info('chat.completion.success', {
      status, durationMs, model: payload.model
    });
    recordChatQuotaSuccess(req.session.user);
    return sendJson(res, 200, data);
  } catch (error) {
    logger.warn('chat.completion.rejected', {
      durationMs: Date.now() - started,
      model: body?.model || body?.chatModel,
      baseUrl: body?.chatBaseUrl || body?.baseUrl,
      error: error.message || String(error)
    });
    return sendJson(res, bodyErrorStatus(error), { error: error.message || String(error) });
  } finally {
    releaseChatSlot?.();
  }
}
