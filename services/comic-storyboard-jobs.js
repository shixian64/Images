// Async comic storyboard queue primitives.
// Keeps long-running chat/storyboard generation off the browser request path.

import { comicProjects } from './db.js';
import { getSystemEndpoint } from './interface-defaults.js';
import { recordFailure, recordSuccess } from './quota.js';
import { assertAllowedUpstreamUrl, buildChatPayload, callUpstream, resolveChatCompletionsUrl } from './upstream.js';
import { maskApiKey, redactSecrets } from '../utils/mask.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_CHAT_MODEL } from '../shared/constants.js';
import {
  buildComicStoryboardMessages,
  buildComicStoryboardRepairMessages,
  clampComicPageCount,
  getComicStyleTemplate,
  parseComicStoryboardResponse
} from '../shared/comic-workflow.js';

export const COMIC_STORYBOARD_JOB_TYPE = 'comic_storyboard';

const DEFAULT_CHAT_MAX_MESSAGES = 12;
const DEFAULT_CHAT_MAX_INPUT_CHARS = 12_000;
const DEFAULT_CHAT_MAX_COMPLETION_TOKENS = 1_200;
const DEFAULT_CHAT_COMPLETION_TOKEN_CEILING = 6_000;
const DEFAULT_CHAT_COMPLETION_TIMEOUT_MS = 180_000;
const STORYBOARD_MAX_COMPLETION_TOKENS = 5_200;
const STORY_PREVIEW_MAX = 160;

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

export function getComicStoryboardTimeoutMs() {
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

function storyPreview(story = '') {
  const text = cleanString(story, STORY_PREVIEW_MAX + 1).replace(/\s+/g, ' ');
  return text.length > STORY_PREVIEW_MAX ? `${text.slice(0, STORY_PREVIEW_MAX)}…` : text;
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
    throw httpError(
      400,
      '个人对话接口密钥只保存在当前进程内存中；服务重启或任务完成后该任务无法继续，请重新提交页分镜生成。',
      'transient_secret_missing'
    );
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

function buildStoryboardChatPayload({ story, styleId, pageLimit, model, repair = null }) {
  const messages = repair
    ? buildComicStoryboardRepairMessages({
      story,
      styleId,
      pageLimit,
      includePageStoryboards: true,
      badResponse: repair.badResponse,
      parseError: repair.parseError
    })
    : buildComicStoryboardMessages({ story, styleId, pageLimit, includePageStoryboards: true });
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
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('');
  }
  return String(content || '');
}

function assertProjectForUser(projectId, userId) {
  const id = cleanString(projectId, 80);
  if (!id) return '';
  const project = comicProjects.findById(id);
  if (!project || project.user_id !== userId) throw httpError(404, 'comic project not found');
  return id;
}

function projectPayloadFromStoryboard(payload = {}, storyboard = {}) {
  const style = getComicStyleTemplate(storyboard.styleId || payload.styleId);
  const pageCount = Array.isArray(storyboard.panels)
    ? storyboard.panels.length
    : (payload.pageLimit ?? payload.pageCount ?? payload.panelCount);
  return {
    id: payload.projectId || undefined,
    title: storyboard.title || cleanString(payload.story, 40) || '未命名漫画',
    story: payload.story,
    styleId: storyboard.styleId || payload.styleId,
    styleLabel: storyboard.styleLabel || style.label,
    pageCount,
    // Backward-compatible API/DB field; page-storyboard projects store page count here.
    panelCount: pageCount,
    chatModel: payload.model || DEFAULT_CHAT_MODEL,
    imageModel: payload.imageModel || '',
    size: payload.size || 'auto',
    quality: payload.quality || 'auto',
    outputFormat: payload.outputFormat || payload.output_format || 'auto',
    useContext: payload.useContext !== false,
    status: 'storyboard',
    storyboard
  };
}

async function saveStoryboardProject(payload = {}, storyboard = {}, userInfo = {}) {
  const { upsertComicProject, updateComicProject } = await import('./comic-projects.js');
  const body = projectPayloadFromStoryboard(payload, storyboard);
  return payload.projectId
    ? updateComicProject(payload.projectId, body, { userId: userInfo?.id })
    : upsertComicProject(body, { userId: userInfo?.id });
}

function recordStoryboardSuccess(userInfo, usingSystemDefault) {
  if (!usingSystemDefault) return;
  recordSuccess(userInfo?.id, { calls: 1, images: 0, bytes: 0 });
}

function recordStoryboardFailure(userInfo, usingSystemDefault) {
  if (!usingSystemDefault) return;
  recordFailure(userInfo?.id, { calls: 1 });
}

function errorMessageFromUpstream(data, status, apiKey) {
  return redactSecrets(data?.error?.message || data?.message || `Request failed with ${status}`, [apiKey]);
}

export function isComicStoryboardPayload(payload = {}) {
  return payload?.jobType === COMIC_STORYBOARD_JOB_TYPE;
}

export async function prepareComicStoryboardJob(body = {}, { userInfo = null } = {}) {
  if (!userInfo?.id) throw httpError(401, 'unauthorized');
  const story = cleanString(body.story, 20_000);
  if (!story) throw httpError(400, 'Story is required.', 'story_required');

  const projectId = assertProjectForUser(body.projectId || body.comicProjectId || '', userInfo.id);
  const styleId = cleanString(body.styleId, 80) || getComicStyleTemplate().id;
  const pageLimit = clampComicPageCount(body.pageLimit ?? body.pageCount ?? body.panelCount);
  const requestConfig = resolveStoryboardChatRequest({ ...body, story, styleId, pageLimit, panelCount: pageLimit });
  const model = cleanModel(body.model || body.chatModel || requestConfig.bodyForPayload.model || DEFAULT_CHAT_MODEL);

  const chatPayload = buildStoryboardChatPayload({ story, styleId, pageLimit, model });
  await assertAllowedUpstreamUrl(requestConfig.targetUrl);

  const payload = {
    jobType: COMIC_STORYBOARD_JOB_TYPE,
    story,
    styleId,
    pageLimit,
    // Backward-compatible name for older queue UI/API consumers.
    panelCount: pageLimit,
    model: chatPayload.model,
    projectId: projectId || undefined,
    comicProjectId: projectId || undefined,
    imageModel: cleanModel(body.imageModel),
    size: cleanString(body.size, 80) || 'auto',
    quality: cleanString(body.quality, 80) || 'auto',
    outputFormat: cleanString(body.outputFormat ?? body.output_format, 80) || 'auto',
    useContext: body.useContext !== false,
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
    promptPreview: storyPreview(story),
    profileName: payload.profileName,
    usingSystemDefault: requestConfig.usingSystemDefault,
    transientSecret
  };
}

export async function runComicStoryboardJob(payload = {}, userInfo = {}, {
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
    const story = cleanString(payload.story, 20_000);
    if (!story) throw httpError(400, 'Story is required.', 'story_required');
    if (payload.projectId) assertProjectForUser(payload.projectId, userInfo?.id);

    const pageLimit = clampComicPageCount(payload.pageLimit ?? payload.pageCount ?? payload.panelCount);
    const styleId = cleanString(payload.styleId, 80) || getComicStyleTemplate().id;
    const requestConfig = resolveStoryboardChatRequest(payload, transientSecret);
    usingSystemDefault = requestConfig.usingSystemDefault;
    const model = cleanModel(payload.model || requestConfig.bodyForPayload.model || DEFAULT_CHAT_MODEL);
    const targetUrl = requestConfig.targetUrl;
    await assertAllowedUpstreamUrl(targetUrl);

    const chatPayload = buildStoryboardChatPayload({ story, styleId, pageLimit, model });
    const upstreamTimeoutMs = timeoutMs || getComicStoryboardTimeoutMs();
    logger.info('comic.storyboard.request', {
      userId: userInfo?.id,
      targetUrl,
      model: chatPayload.model,
      profileName: requestConfig.profileName || payload.profileName,
      usingSystemDefault,
      apiKey: maskApiKey(requestConfig.apiKey)
    });
    onProgress?.({
      stage: 'upstream',
      message: `正在调用 ${chatPayload.model} 生成漫画页分镜，任务会在后台继续运行…`,
      elapsedMs: Date.now() - started
    });

    const first = await callUpstream({
      targetUrl,
      apiKey: requestConfig.apiKey,
      payload: chatPayload,
      timeoutMs: upstreamTimeoutMs,
      timeoutMessage: 'Upstream comic storyboard completion timed out.',
      signal,
      fetchImpl
    });

    if (!first.ok) {
      const errMsg = errorMessageFromUpstream(first.data, first.status, requestConfig.apiKey);
      recordStoryboardFailure(userInfo, usingSystemDefault);
      quotaRecorded = true;
      logger.error('comic.storyboard.failed', {
        userId: userInfo?.id,
        status: first.status,
        durationMs: first.durationMs,
        model: chatPayload.model,
        error: errMsg
      });
      return { status: first.status, body: { error: errMsg } };
    }

    const storyboardOptions = { story, styleId, pageLimit, panelCount: pageLimit, autoPageCount: true };
    const storyboardText = extractChatText(first.data);
    let storyboard;
    let repaired = false;
    try {
      storyboard = parseComicStoryboardResponse(storyboardText, storyboardOptions);
    } catch (parseErr) {
      repaired = true;
      const parseMessage = parseErr?.message || String(parseErr);
      logger.warn('comic.storyboard.repairing', {
        userId: userInfo?.id,
        model: chatPayload.model,
        durationMs: Date.now() - started,
        error: parseMessage
      });
      onProgress?.({
        stage: 'repairing',
        message: '页分镜 JSON 不完整，正在后台自动修复一次…',
        elapsedMs: Date.now() - started
      });

      const repairPayload = buildStoryboardChatPayload({
        story,
        styleId,
        pageLimit,
        model,
        repair: { badResponse: storyboardText, parseError: parseMessage }
      });
      const repairedResp = await callUpstream({
        targetUrl,
        apiKey: requestConfig.apiKey,
        payload: repairPayload,
        timeoutMs: upstreamTimeoutMs,
        timeoutMessage: 'Upstream comic storyboard repair timed out.',
        signal,
        fetchImpl
      });
      if (!repairedResp.ok) {
        const errMsg = errorMessageFromUpstream(repairedResp.data, repairedResp.status, requestConfig.apiKey);
        recordStoryboardFailure(userInfo, usingSystemDefault);
        quotaRecorded = true;
        logger.error('comic.storyboard.repair_failed', {
          userId: userInfo?.id,
          status: repairedResp.status,
          durationMs: repairedResp.durationMs,
          model: repairPayload.model,
          error: errMsg
        });
        return { status: repairedResp.status, body: { error: errMsg } };
      }
      storyboard = parseComicStoryboardResponse(extractChatText(repairedResp.data), storyboardOptions);
    }

    onProgress?.({
      stage: 'saving',
      message: '页分镜已生成，正在保存漫画项目…',
      elapsedMs: Date.now() - started
    });
    const project = await saveStoryboardProject({ ...payload, story, styleId, pageLimit, panelCount: pageLimit, model }, storyboard, userInfo);
    recordStoryboardSuccess(userInfo, usingSystemDefault);
    quotaRecorded = true;
    logger.info('comic.storyboard.succeeded', {
      userId: userInfo?.id,
      model: chatPayload.model,
      projectId: project.id,
      durationMs: Date.now() - started,
      pageCount: project.storyboard?.panels?.length || pageLimit,
      pageLimit,
      repaired
    });
    return {
      status: 200,
      body: {
        storyboard: project.storyboard,
        project,
        repaired,
        model: chatPayload.model,
        durationMs: Date.now() - started
      }
    };
  } catch (err) {
    if (!quotaRecorded) recordStoryboardFailure(userInfo, usingSystemDefault);
    throw err;
  }
}
