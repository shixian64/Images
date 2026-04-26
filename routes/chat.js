// POST /api/chat —— 对话模型代理。
// 前端可传入 chatBaseUrl/chatApiKey，也兼容 baseUrl/apiKey；上游按 OpenAI-compatible /v1/chat/completions 调用。

import { readJsonBody, sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { assertAllowedUpstreamUrl, buildChatPayload, callUpstream, resolveChatCompletionsUrl } from '../services/upstream.js';

export async function handleChat(req, res) {
  const started = Date.now();
  let body = {};
  try {
    body = await readJsonBody(req);
    const apiKey = String(body.chatApiKey || body.apiKey || '').trim();
    if (!apiKey) throw new Error('API key is required.');

    const targetUrl = resolveChatCompletionsUrl(body.chatBaseUrl || body.baseUrl);
    await assertAllowedUpstreamUrl(targetUrl);
    const payload = buildChatPayload(body);

    logger.info('chat.completion.request', {
      targetUrl,
      model: payload.model,
      profileName: body.name,
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
    return sendJson(res, 400, { error: error.message || String(error) });
  }
}
