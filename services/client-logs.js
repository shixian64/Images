// Client/browser log intake for admin debugging.
// Frontend logs remain in localStorage for the user, and are mirrored here so
// admins can inspect failures without asking users to export JSON manually.

import { randomUUID } from 'node:crypto';
import { clientLogs } from './db.js';
import { clientIp, userAgent } from '../utils/request.js';
import { redactSecrets } from '../utils/mask.js';

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const MAX_BATCH = 100;
const MAX_MESSAGE_CHARS = 1200;
const MAX_META_JSON_CHARS = 20_000;
const MAX_TEXT_CHARS = 4000;
const MAX_DEPTH = 6;
const REDACTED = '[redacted]';
const SENSITIVE_KEY_RE = /(?:api[-_ ]?key|authorization|bearer|token|password|passwd|secret|credential)/i;

function clampLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function truncate(value, max = MAX_TEXT_CHARS) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function safeText(value, max = MAX_TEXT_CHARS) {
  return truncate(redactSecrets(value), max);
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY_RE.test(String(key || ''));
}

function redactMeta(value, depth = 0) {
  if (depth > MAX_DEPTH) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return safeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => redactMeta(item, depth + 1));
  if (typeof value !== 'object') return truncate(value);

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[truncate(key, 120)] = isSensitiveKey(key) ? REDACTED : redactMeta(item, depth + 1);
  }
  return out;
}

function compactMeta(meta) {
  if (meta === undefined) return null;
  const redacted = redactMeta(meta);
  const json = JSON.stringify(redacted);
  if (json.length <= MAX_META_JSON_CHARS) return redacted;
  return {
    truncated: true,
    preview: truncate(json, MAX_META_JSON_CHARS)
  };
}

function normalizeLevel(level) {
  const value = String(level || '').toLowerCase();
  return VALID_LEVELS.has(value) ? value : 'info';
}

function normalizeClientTs(value) {
  const text = truncate(value, 80);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function normalizeTraceId(value) {
  const text = safeText(value || '', 160);
  if (!text) return '';
  return /^[A-Za-z0-9._:-]{1,128}$/.test(text) ? text : '';
}

function metaWithTraceId(meta, traceId) {
  if (!traceId) return meta;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...meta, traceId };
  }
  if (meta === undefined || meta === null || meta === '') {
    return { traceId };
  }
  return { value: meta, traceId };
}

function normalizeLogItem(raw = {}) {
  const context = raw.context && typeof raw.context === 'object' ? raw.context : {};
  const clientId = safeText(raw.clientId || raw.id || '', 160) || null;
  const traceId = normalizeTraceId(raw.traceId || context.traceId);
  return {
    id: randomUUID(),
    clientId,
    clientTs: normalizeClientTs(raw.clientTs || raw.ts || raw.createdAt),
    receivedAt: new Date().toISOString(),
    level: normalizeLevel(raw.level),
    message: safeText(raw.message || raw.msg || '', MAX_MESSAGE_CHARS),
    meta: compactMeta(metaWithTraceId(raw.meta, traceId)),
    pageUrl: safeText(raw.pageUrl || raw.url || context.pageUrl || context.url || '', 1200) || null,
    userAgent: safeText(context.userAgent || '', 1200) || null
  };
}

function normalizeBody(body = {}) {
  const source = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.logs)
      ? body.logs
      : [body];
  return source
    .slice(0, MAX_BATCH)
    .filter((item) => item && typeof item === 'object')
    .map(normalizeLogItem)
    .filter((item) => item.message || item.meta);
}

export function recordClientLogs(req, body = {}) {
  const userId = req?.session?.user?.id;
  if (!userId) {
    const err = new Error('unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const items = normalizeBody(body);
  if (!items.length) return { inserted: 0, ignored: 0, accepted: 0 };
  const result = clientLogs.insertMany(userId, items, {
    ip: clientIp(req),
    userAgent: userAgent(req)
  });
  return { ...result, accepted: items.length };
}

export function listClientLogsForUser(userId, { limit = 100, level = '', search = '' } = {}) {
  return clientLogs.listByUser(userId, {
    limit: clampLimit(limit, 100, 500),
    level: VALID_LEVELS.has(String(level || '').toLowerCase()) ? String(level).toLowerCase() : '',
    search: truncate(search || '', 200)
  });
}

export function listClientLogsForAdmin({ limit = 300, userId = '', level = '', search = '' } = {}) {
  return clientLogs.listAll({
    limit: clampLimit(limit, 300, 1000),
    userId: truncate(userId || '', 160),
    level: VALID_LEVELS.has(String(level || '').toLowerCase()) ? String(level).toLowerCase() : '',
    search: truncate(search || '', 200)
  });
}
