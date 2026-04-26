// /api/prompt-square —— 共享提示词广场。
// 用户从自己的历史提示词中选择公开；公开后所有登录用户可浏览、复制、使用。

import { promptSquare } from '../services/db.js';
import { record as auditRecord } from '../services/audit.js';
import { bodyErrorStatus, readJsonBody, sendJson } from '../utils/http.js';

const VALID_SOURCES = new Set(['builder', 'studio', 'manual', 'square']);
const MAX_TITLE_LEN = 120;
const MAX_PROMPT_LEN = 12_000;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 32;
const STYLE_REFERENCE_RE = /\s*风格参考\s*[:：]\s*--sref\s+[\w-]+\s*$/i;

function trimText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function stripStyleReference(value) {
  return String(value || '').replace(STYLE_REFERENCE_RE, '').trim();
}

function deriveTitle(prompt) {
  const firstLine = String(prompt || '').trim().split(/\n+/)[0] || '未命名提示词';
  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
}

function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '').split(/[，,\n#]+/);
  return Array.from(new Set(
    raw
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, MAX_TAG_LEN))
  )).slice(0, MAX_TAGS);
}

function sanitizeParts(parts) {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return null;
  const allowed = ['subject', 'style', 'composition', 'lighting', 'palette', 'text', 'negative'];
  const out = {};
  for (const key of allowed) {
    const value = trimText(parts[key], 2000);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeMeta(input, parts) {
  const meta = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of ['model', 'size', 'quality', 'outputFormat']) {
    const value = trimText(src[key], 120);
    if (value) meta[key] = value;
  }
  for (const key of ['sref', 'sourceName']) {
    const value = trimText(src[key], 120);
    if (value) meta[key] = value;
  }
  const sourceHot = Number(src.sourceHot);
  if (Number.isFinite(sourceHot) && sourceHot > 0) meta.sourceHot = Math.floor(sourceHot);
  const sourceUrl = trimText(src.sourceUrl, 500);
  if (/^https?:\/\//i.test(sourceUrl)) meta.sourceUrl = sourceUrl;
  const previewImages = Array.isArray(src.previewImages) ? src.previewImages : [];
  const cleanPreviewImages = previewImages
    .map((url) => trimText(url, 500))
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 4);
  if (cleanPreviewImages.length) meta.previewImages = cleanPreviewImages;
  const cleanParts = sanitizeParts(parts || src.parts);
  if (cleanParts) meta.parts = cleanParts;
  return meta;
}

function parseJsonField(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function mapSquareRow(row, viewerId) {
  if (!row) return null;
  const meta = parseJsonField(row.meta, {});
  const tags = parseJsonField(row.tags, []);
  return {
    id: row.id,
    sourcePromptId: row.source_prompt_id || '',
    title: row.title,
    prompt: stripStyleReference(row.prompt),
    tags: Array.isArray(tags) ? tags : [],
    source: row.source || 'manual',
    meta,
    parts: meta?.parts || null,
    useCount: Number(row.use_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    owner: {
      id: row.user_id || 'system',
      username: row.owner_username || '系统精选',
      avatarUrl: row.owner_avatar_url || ''
    },
    isMine: Boolean(row.user_id && row.user_id === viewerId)
  };
}

function validatePublishPayload(body) {
  const prompt = stripStyleReference(trimText(body?.prompt, MAX_PROMPT_LEN + 1));
  if (!prompt) throw new Error('prompt is required');
  if (prompt.length > MAX_PROMPT_LEN) throw new Error(`prompt too long (max ${MAX_PROMPT_LEN} characters)`);

  const title = trimText(body?.title, MAX_TITLE_LEN) || deriveTitle(prompt);
  const sourcePromptId = trimText(body?.sourcePromptId, 160) || null;
  const source = VALID_SOURCES.has(body?.source) ? body.source : 'manual';
  const tags = normalizeTags(body?.tags);
  const meta = sanitizeMeta(body?.meta, body?.parts);

  return {
    sourcePromptId,
    title,
    prompt,
    tagsJson: JSON.stringify(tags),
    source,
    metaJson: JSON.stringify(meta)
  };
}

function matchesFilters(item, { search, tag, mine }) {
  if (mine && !item.isMine) return false;
  if (tag && tag !== 'all' && !item.tags.includes(tag)) return false;
  if (!search) return true;
  const hay = [
    item.title,
    item.prompt,
    item.tags.join(' '),
    item.owner?.username || '',
    item.source || ''
  ].join('\n').toLowerCase();
  return hay.includes(search);
}

async function handleCollection(req, res, urlObj) {
  const user = req.session.user;

  if (req.method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(urlObj.searchParams.get('limit') || 200)));
    const search = String(urlObj.searchParams.get('search') || '').trim().toLowerCase();
    const tag = String(urlObj.searchParams.get('tag') || 'all').trim();
    const mine = urlObj.searchParams.get('mine') === '1';
    const all = promptSquare
      .list(limit)
      .map((row) => mapSquareRow(row, user.id));
    const items = all.filter((item) => matchesFilters(item, { search, tag, mine }));
    return sendJson(res, 200, { items, total: all.length, filtered: items.length });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    }

    try {
      const payload = validatePublishPayload(body || {});
      const row = promptSquare.upsert({ userId: user.id, ...payload });
      const item = mapSquareRow(row, user.id);
      auditRecord(req, 'prompt_square.publish', { type: 'prompt_square', id: item.id }, {
        sourcePromptId: item.sourcePromptId,
        title: item.title
      });
      return sendJson(res, 200, { item });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'publish failed' });
    }
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

async function handleUse(req, res, id) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  const row = promptSquare.findById(id);
  if (!row) return sendJson(res, 404, { error: 'prompt not found' });
  const updated = promptSquare.bumpUseCount(id);
  return sendJson(res, 200, { item: mapSquareRow(updated, req.session.user.id) });
}

async function handleDetail(req, res, id) {
  const user = req.session.user;
  const row = promptSquare.findById(id);
  if (!row) return sendJson(res, 404, { error: 'prompt not found' });

  if (req.method === 'GET') {
    return sendJson(res, 200, { item: mapSquareRow(row, user.id) });
  }

  if (req.method === 'DELETE') {
    if (row.user_id !== user.id && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    promptSquare.deleteById(id);
    auditRecord(req, 'prompt_square.unpublish', { type: 'prompt_square', id }, {
      sourcePromptId: row.source_prompt_id,
      title: row.title,
      userId: row.user_id
    });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

export async function handlePromptSquareRoute(req, res, pathname, urlObj) {
  if (pathname === '/api/prompt-square' || pathname === '/api/prompt-square/') {
    return handleCollection(req, res, urlObj);
  }

  const use = pathname.match(/^\/api\/prompt-square\/([^/]+)\/use\/?$/);
  if (use) return handleUse(req, res, decodeURIComponent(use[1]));

  const detail = pathname.match(/^\/api\/prompt-square\/([^/]+)\/?$/);
  if (detail) return handleDetail(req, res, decodeURIComponent(detail[1]));

  return sendJson(res, 404, { error: 'not found' });
}

export default handlePromptSquareRoute;
