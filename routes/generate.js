// POST /api/generate —— 前端直接把完整 profile + 生成参数打过来，
// 我们负责校验、脱敏记日志、调用上游。
// 当前仍是同步代理；异步队列（§6.3）是 Beta 阶段的事。

import { readJsonBody, sendJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { maskApiKey } from '../utils/mask.js';
import { buildImagePayload, callUpstream, resolveApiUrl } from '../services/upstream.js';
import { saveGeneratedImages } from '../services/gallery-store.js';
import {
  assertCanGenerate,
  recordSuccess,
  recordFailure
} from '../services/quota.js';

export async function handleGenerate(req, res) {
  const started = Date.now();
  // 防御性鉴权（server.js 也会拦）：未登录直接 401
  if (!req.session?.user) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
    const apiKey = String(body.imageApiKey || body.apiKey || '').trim();
    if (!apiKey) throw new Error('API key is required.');

    const targetUrl = resolveApiUrl(body.imageBaseUrl || body.baseUrl);
    const payload = buildImagePayload(body);

    // 配额拦截：管理员豁免，其他用户按 daily/monthly/storage 检查。
    const userInfo = req.session.user;
    if (userInfo.role !== 'admin') {
      const check = assertCanGenerate(userInfo.id, { n: payload.n || 1 });
      if (!check.ok) {
        logger.warn('image.generate.quota_exceeded', {
          userId: userInfo.id,
          code: check.code,
          model: payload.model
        });
        return sendJson(res, 429, { error: check.message, code: check.code });
      }
    }

    logger.info('image.generate.request', {
      targetUrl,
      model: payload.model,
      profileName: body.name,
      apiKey: maskApiKey(apiKey)
    });

    const { ok, status, data, durationMs } = await callUpstream({ targetUrl, apiKey, payload });

    if (!ok) {
      const errMsg = data?.error?.message || data?.message || `Request failed with ${status}`;
      logger.error('image.generate.failed', {
        status, durationMs, model: payload.model, error: errMsg
      });
      recordFailure(userInfo.id);
      return sendJson(res, status, { error: errMsg, details: data });
    }

    const imageItems = Array.isArray(data?.data) ? data.data : [];
    let saved = [];
    try {
      const saveResult = await saveGeneratedImages(
        imageItems,
        {
          prompt: payload.prompt,
          model: payload.model,
          size: body.size || '',
          quality: body.quality || '',
          outputFormat: body.output_format || '',
          profileName: body.name || ''
        },
        { userId: req.session.user.id }
      );
      saved = saveResult.saved;
      if (Array.isArray(data?.data)) data.data = saveResult.items;
    } catch (saveError) {
      logger.warn('image.generate.save_failed', {
        model: payload.model,
        imageCount: imageItems.length,
        error: saveError.message || String(saveError)
      });
    }

    // 用量记账：成功调用计 1 次 + 实际入库的图数 / 字节数
    const savedBytes = saved.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    recordSuccess(userInfo.id, {
      calls: 1,
      images: saved.length || imageItems.length || 0,
      bytes: savedBytes
    });

    logger.info('image.generate.success', {
      status, durationMs,
      model: payload.model,
      imageCount: imageItems.length,
      savedCount: saved.length
    });
    return sendJson(res, 200, { ...data, saved });
  } catch (error) {
    logger.warn('image.generate.rejected', {
      durationMs: Date.now() - started,
      model: body?.model,
      baseUrl: body?.imageBaseUrl || body?.baseUrl,
      error: error.message || String(error)
    });
    return sendJson(res, 400, { error: error.message || String(error) });
  }
}
