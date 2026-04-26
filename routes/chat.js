// POST /api/chat —— 对话模型代理。
// 前端可传入 chatBaseUrl/chatApiKey，也兼容 baseUrl/apiKey；上游按 OpenAI-compatible /v1/chat/completions 调用。

import { readJsonBody, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { assertAllowedUpstreamUrl, buildChatPayload, callUpstream, resolveChatCompletionsUrl } from '../services/upstream.js';
import { getSystemEndpoint } from '../services/interface-defaults.js';

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

export async function handleChat(req, res) {
  const started = Date.now();
  let body = {};
  try {
    body = await readJsonBody(req);
    const requestConfig = resolveChatRequest(body);
    const { apiKey, targetUrl, bodyForPayload, usingSystemDefault } = requestConfig;
    await assertAllowedUpstreamUrl(targetUrl);
    const payload = buildChatPayload(bodyForPayload);

    logger.info('chat.completion.request', {
      targetUrl,
      model: payload.model,
      profileName: requestConfig.profileName,
      usingSystemDefault,
      apiKey: maskApiKey(apiKey)
    });

    const { ok, status, data, durationMs } = await callUpstream({
      targetUrl,
      apiKey,
      payload,
      timeoutMessage: 'Upstream chat completion timed out.'
    });

    if (!ok) {
      const errMsg = data?.error?.message || data?.message || `Request failed with ${status}`;
      logger.error('chat.completion.failed', {
        status, durationMs, model: payload.model, error: errMsg
      });
      return sendJson(res, status, { error: errMsg });
    }

    logger.info('chat.completion.success', {
      status, durationMs, model: payload.model
    });
    return sendJson(res, 200, data);
  } catch (error) {
    logger.warn('chat.completion.rejected', {
      durationMs: Date.now() - started,
      model: body?.model || body?.chatModel,
      baseUrl: body?.chatBaseUrl || body?.baseUrl,
      error: error.message || String(error)
    });
    return sendJson(res, bodyErrorStatus(error), { error: error.message || String(error) });
  }
}
