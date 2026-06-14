// Async video keyframe storyboard queue primitives.

import { videoProjects } from './db.js';
import { getSystemEndpoint } from './interface-defaults.js';
import { recordFailure, recordSuccess } from './quota.js';
import { assertAllowedUpstreamUrl, buildChatPayload, callUpstream, resolveChatCompletionsUrl } from './upstream.js';
import { maskApiKey, redactSecrets } from '../utils/mask.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_CHAT_MODEL } from '../shared/constants.js';
import {
  VIDEO_KEYFRAME_LIMITS,
  buildVideoStoryboardMessages,
  buildVideoStoryboardRepairMessages,
  clampVideoKeyframeCount,
  parseVideoStoryboardResponse
} from '../shared/video-workflow.js';

export const VIDEO_STORYBOARD_JOB_TYPE = 'video_storyboard';

const DEFAULT_CHAT_MAX_MESSAGES = 12;
const DEFAULT_CHAT_MAX_INPUT_CHARS = 12_000;
const DEFAULT_CHAT_MAX_COMPLETION_TOKENS = 1_200;
const DEFAULT_CHAT_COMPLETION_TOKEN_CEILING = 6_000;
const DEFAULT_CHAT_COMPLETION_TIMEOUT_MS = 180_000;
const STORYBOARD_MAX_COMPLETION_TOKENS = 4_200;
const PROMPT_PREVIEW_MAX = 160;

function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const text = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'none', 'null', 'disabled'].includes(text)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function chatLimitSnapshot() {
  return {
    maxMessages: envPositiveInt('CHAT_MAX_MESSAGES', DEFAULT_CHAT_MAX_MESSAGES),
    maxInputChars: envPositiveInt('CHAT_MAX_INPUT_CHARS', DEFAULT_CHAT_MAX_INPUT_CHARS),
    defaultMaxCompletionTokens: envPositiveInt('CHAT_DEFAULT_MAX_COMPLETION_TOKENS', DEFAULT_CHAT_MAX_COMPLETION_TOKENS),
    maxCompletionTokens: envPositiveInt('CHAT_MAX_COMPLETION_TOKENS', DEFAULT_CHAT_COMPLETION_TOKEN_CEILING),
    timeoutMs: envPositiveInt('CHAT_COMPLETION_TIMEOUT_MS', DEFAULT_CHAT_COMPLETION_TIMEOUT_MS)
  };
}

export function getVideoStoryboardTimeoutMs() {
  return chatLimitSnapshot().timeoutMs;
}

function httpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function cleanString(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanModel(value) {
  return cleanString(value, 120);
}

function promptPreview(prompt = '') {
  const text = cleanString(prompt, PROMPT_PREVIEW_MAX + 1).replace(/\s+/g, ' ');
  return text.length > PROMPT_PREVIEW_MAX ? `${text.slice(0, PROMPT_PREVIEW_MAX)}…` : text;
}

function shouldUseSystemDefault(body = {}) {
  return body.useSystemDefault === true || body.interfaceMode === 'system';
}

function resolveStoryboardChatRequest(body = {}, transientSecret = null) {
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

  const apiKey = String(transientSecret?.apiKey || transientSecret?.chatApiKey || body.chatApiKey || body.apiKey || '').trim();
  const baseUrl = String(transientSecret?.chatBaseUrl || transientSecret?.baseUrl || body.chatBaseUrl || body.baseUrl || '').trim();
  if (!apiKey) {
    throw httpError(400, '个人对话接口密钥只保存在当前进程内存中；请重新提交视频关键帧规划。', 'transient_secret_missing');
  }
  return {
    apiKey,
    targetUrl: resolveChatCompletionsUrl(baseUrl),
    profileName: body.name || body.profileName || '',
    bodyForPayload: body,
    usingSystemDefault: false
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
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, 'invalid max completion tokens', 'invalid_chat_limit');
  return Math.min(Math.floor(n), limit);
}

function prepareStoryboardChatBody(body = {}) {
  const limits = chatLimitSnapshot();
  const messageCount = countMessages(body);
  if (limits.maxMessages && messageCount > limits.maxMessages) {
    throw httpError(400, `too many chat messages (max ${limits.maxMessages})`, 'chat_messages_too_many');
  }
  const inputChars = estimateInputChars(body);
  if (limits.maxInputChars && inputChars > limits.maxInputChars) {
    throw httpError(400, `chat input too large (max ${limits.maxInputChars} characters)`, 'chat_input_too_large');
  }
  const next = { ...body };
  next.max_completion_tokens = clampCompletionTokens(
    next.max_completion_tokens,
    limits.maxCompletionTokens,
    Math.min(STORYBOARD_MAX_COMPLETION_TOKENS, limits.defaultMaxCompletionTokens || STORYBOARD_MAX_COMPLETION_TOKENS)
  );
  return next;
}

function buildStoryboardChatPayload({ prompt, keyframeLimit, model, references = [], config = {}, repair = null }) {
  const referenceLabels = references.map((item, index) => item.label || item.filename || `参考图 ${index + 1}`);
  const messages = repair
    ? buildVideoStoryboardRepairMessages({
      prompt,
      keyframeLimit,
      referenceCount: references.length,
      referenceLabels,
      config,
      badResponse: repair.badResponse,
      parseError: repair.parseError
    })
    : buildVideoStoryboardMessages({
      prompt,
      keyframeLimit,
      referenceCount: references.length,
      referenceLabels,
      config
    });
  return buildChatPayload(prepareStoryboardChatBody({
    model,
    messages,
    response_format: { type: 'json_object' },
    max_completion_tokens: STORYBOARD_MAX_COMPLETION_TOKENS,
    ...(repair ? { temperature: 0 } : {})
  }));
}

function extractChatText(data = {}) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content ?? data?.choices?.[0]?.text ?? data?.output_text ?? data?.content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : (part?.text || part?.content || ''))).join('');
  }
  return String(content || '');
}

function assertProjectForUser(projectId, userId) {
  const id = cleanString(projectId, 80);
  if (!id) return '';
  const project = videoProjects.findById(id);
  if (!project || project.user_id !== userId) throw httpError(404, 'video project not found');
  return id;
}

function projectPayloadFromStoryboard(payload = {}, storyboard = {}) {
  const keyframeCount = Array.isArray(storyboard.keyframes)
    ? storyboard.keyframes.length
    : (payload.keyframeLimit ?? payload.keyframeCount);
  return {
    id: payload.projectId || undefined,
    title: storyboard.title || cleanString(payload.prompt, 40) || '未命名视频',
    prompt: payload.prompt,
    keyframeCount,
    chatModel: payload.model || DEFAULT_CHAT_MODEL,
    imageModel: payload.imageModel || '',
    size: payload.size || 'auto',
    quality: payload.quality || 'auto',
    outputFormat: payload.outputFormat || payload.output_format || 'auto',
    useReferences: payload.useReferences !== false,
    status: 'storyboard',
    config: payload.config || {},
    references: payload.references || [],
    storyboard
  };
}

async function saveStoryboardProject(payload = {}, storyboard = {}, userInfo = {}) {
  const { upsertVideoProject, updateVideoProject } = await import('./video-projects.js');
  const body = projectPayloadFromStoryboard(payload, storyboard);
  return payload.projectId
    ? updateVideoProject(payload.projectId, body, { userId: userInfo?.id })
    : upsertVideoProject(body, { userId: userInfo?.id });
}

function recordStoryboardSuccess(userInfo, usingSystemDefault) {
  if (usingSystemDefault) recordSuccess(userInfo?.id, { calls: 1, images: 0, bytes: 0 });
}

function recordStoryboardFailure(userInfo, usingSystemDefault) {
  if (usingSystemDefault) recordFailure(userInfo?.id, { calls: 1 });
}

function errorMessageFromUpstream(data, status, apiKey) {
  return redactSecrets(data?.error?.message || data?.message || `Request failed with ${status}`, [apiKey]);
}

export function isVideoStoryboardPayload(payload = {}) {
  return payload?.jobType === VIDEO_STORYBOARD_JOB_TYPE;
}

export async function prepareVideoStoryboardJob(body = {}, { userInfo = null } = {}) {
  if (!userInfo?.id) throw httpError(401, 'unauthorized');
  const prompt = cleanString(body.prompt, 20_000);
  if (!prompt) throw httpError(400, 'Prompt is required.', 'prompt_required');
  const projectId = assertProjectForUser(body.projectId || body.videoProjectId || '', userInfo.id);
  const keyframeLimit = clampVideoKeyframeCount(body.keyframeLimit ?? body.keyframeCount ?? VIDEO_KEYFRAME_LIMITS.default);
  const references = Array.isArray(body.references) ? body.references : [];
  const requestConfig = resolveStoryboardChatRequest({ ...body, prompt, keyframeLimit });
  const model = cleanModel(body.model || body.chatModel || requestConfig.bodyForPayload.model || DEFAULT_CHAT_MODEL);
  const config = body.config && typeof body.config === 'object' ? body.config : {};
  const chatPayload = buildStoryboardChatPayload({ prompt, keyframeLimit, model, references, config });
  await assertAllowedUpstreamUrl(requestConfig.targetUrl);

  const payload = {
    jobType: VIDEO_STORYBOARD_JOB_TYPE,
    prompt,
    keyframeLimit,
    keyframeCount: keyframeLimit,
    model: chatPayload.model,
    projectId: projectId || undefined,
    videoProjectId: projectId || undefined,
    imageModel: cleanModel(body.imageModel),
    size: cleanString(body.size, 80) || 'auto',
    quality: cleanString(body.quality, 80) || 'auto',
    outputFormat: cleanString(body.outputFormat ?? body.output_format, 80) || 'auto',
    useReferences: body.useReferences !== false,
    config,
    references,
    useSystemDefault: requestConfig.usingSystemDefault,
    interfaceMode: requestConfig.usingSystemDefault ? 'system' : 'custom',
    profileName: requestConfig.profileName || cleanString(body.name, 120) || ''
  };

  const transientSecret = requestConfig.usingSystemDefault ? null : {
    apiKey: requestConfig.apiKey,
    chatApiKey: requestConfig.apiKey,
    baseUrl: body.chatBaseUrl || body.baseUrl || '',
    chatBaseUrl: body.chatBaseUrl || body.baseUrl || ''
  };

  return {
    payload,
    requestedCalls: 1,
    model: chatPayload.model,
    promptPreview: promptPreview(prompt),
    profileName: payload.profileName,
    usingSystemDefault: requestConfig.usingSystemDefault,
    transientSecret
  };
}

export async function runVideoStoryboardJob(payload = {}, userInfo = {}, {
  transientSecret = null,
  signal = null,
  timeoutMs = null,
  fetchImpl = fetch,
  onProgress = null
} = {}) {
  const started = Date.now();
  let usingSystemDefault = Boolean(payload.useSystemDefault || payload.interfaceMode === 'system');
  let quotaRecorded = false;
  try {
    const prompt = cleanString(payload.prompt, 20_000);
    if (!prompt) throw httpError(400, 'Prompt is required.', 'prompt_required');
    if (payload.projectId) assertProjectForUser(payload.projectId, userInfo?.id);
    const keyframeLimit = clampVideoKeyframeCount(payload.keyframeLimit ?? payload.keyframeCount);
    const references = Array.isArray(payload.references) ? payload.references : [];
    const requestConfig = resolveStoryboardChatRequest(payload, transientSecret);
    usingSystemDefault = requestConfig.usingSystemDefault;
    const model = cleanModel(payload.model || requestConfig.bodyForPayload.model || DEFAULT_CHAT_MODEL);
    await assertAllowedUpstreamUrl(requestConfig.targetUrl);
    const chatPayload = buildStoryboardChatPayload({
      prompt,
      keyframeLimit,
      model,
      references,
      config: payload.config && typeof payload.config === 'object' ? payload.config : {}
    });
    const upstreamTimeoutMs = timeoutMs || getVideoStoryboardTimeoutMs();

    logger.info('video.storyboard.request', {
      userId: userInfo?.id,
      targetUrl: requestConfig.targetUrl,
      model: chatPayload.model,
      profileName: requestConfig.profileName || payload.profileName,
      usingSystemDefault,
      referenceCount: references.length,
      apiKey: maskApiKey(requestConfig.apiKey)
    });
    onProgress?.({
      stage: 'upstream',
      message: `正在调用 ${chatPayload.model} 规划视频关键帧，任务会在后台继续运行…`,
      elapsedMs: Date.now() - started
    });

    const resp = await callUpstream({
      targetUrl: requestConfig.targetUrl,
      apiKey: requestConfig.apiKey,
      payload: chatPayload,
      timeoutMs: upstreamTimeoutMs,
      timeoutMessage: 'Upstream video storyboard completion timed out.',
      signal,
      fetchImpl
    });
    if (!resp.ok) {
      const errMsg = errorMessageFromUpstream(resp.data, resp.status, requestConfig.apiKey);
      recordStoryboardFailure(userInfo, usingSystemDefault);
      quotaRecorded = true;
      logger.error('video.storyboard.failed', {
        userId: userInfo?.id,
        status: resp.status,
        durationMs: resp.durationMs,
        model: chatPayload.model,
        error: errMsg
      });
      return { status: resp.status, body: { error: errMsg } };
    }

    const storyboardOptions = {
      prompt,
      keyframeLimit,
      maxReferenceCount: references.length
    };
    const storyboardText = extractChatText(resp.data);
    let storyboard;
    let repaired = false;
    try {
      storyboard = parseVideoStoryboardResponse(storyboardText, storyboardOptions);
    } catch (parseErr) {
      repaired = true;
      const parseMessage = parseErr?.message || String(parseErr);
      logger.warn('video.storyboard.repairing', {
        userId: userInfo?.id,
        model: chatPayload.model,
        durationMs: Date.now() - started,
        error: parseMessage
      });
      onProgress?.({
        stage: 'repairing',
        message: '视频关键帧规划 JSON 不完整，正在后台自动修复一次…',
        elapsedMs: Date.now() - started
      });

      const repairPayload = buildStoryboardChatPayload({
        prompt,
        keyframeLimit,
        model,
        references,
        config: payload.config && typeof payload.config === 'object' ? payload.config : {},
        repair: { badResponse: storyboardText, parseError: parseMessage }
      });
      const repairedResp = await callUpstream({
        targetUrl: requestConfig.targetUrl,
        apiKey: requestConfig.apiKey,
        payload: repairPayload,
        timeoutMs: upstreamTimeoutMs,
        timeoutMessage: 'Upstream video storyboard repair timed out.',
        signal,
        fetchImpl
      });
      if (!repairedResp.ok) {
        const errMsg = errorMessageFromUpstream(repairedResp.data, repairedResp.status, requestConfig.apiKey);
        recordStoryboardFailure(userInfo, usingSystemDefault);
        quotaRecorded = true;
        logger.error('video.storyboard.repair_failed', {
          userId: userInfo?.id,
          status: repairedResp.status,
          durationMs: repairedResp.durationMs,
          model: repairPayload.model,
          error: errMsg
        });
        return { status: repairedResp.status, body: { error: errMsg } };
      }
      storyboard = parseVideoStoryboardResponse(extractChatText(repairedResp.data), storyboardOptions);
    }
    onProgress?.({
      stage: 'saving',
      message: '视频关键帧规划已生成，正在保存视频项目…',
      elapsedMs: Date.now() - started
    });
    const project = await saveStoryboardProject({ ...payload, prompt, keyframeLimit, model }, storyboard, userInfo);
    recordStoryboardSuccess(userInfo, usingSystemDefault);
    quotaRecorded = true;
    logger.info('video.storyboard.succeeded', {
      userId: userInfo?.id,
      model: chatPayload.model,
      projectId: project.id,
      durationMs: Date.now() - started,
      keyframeCount: project.storyboard?.keyframes?.length || keyframeLimit,
      keyframeLimit,
      repaired
    });
    return {
      status: 200,
      body: {
        storyboard: project.storyboard,
        project,
        model: chatPayload.model,
        durationMs: Date.now() - started,
        repaired
      }
    };
  } catch (err) {
    if (!quotaRecorded) recordStoryboardFailure(userInfo, usingSystemDefault);
    throw err;
  }
}
