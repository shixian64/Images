import { getTraceId } from './request-context.js';
import { redactSecrets } from './mask.js';

const MAX_STACK_CHARS = 4000;
const MAX_META_DEPTH = 6;
const SENSITIVE_META_KEY_RE = /(?:api[-_ ]?key|authorization|bearer|token|password|passwd|secret|credential)/i;

function nowIso() {
  return new Date().toISOString();
}

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name || 'Error',
    message: redactSecrets(error.message || String(error)),
    stack: error.stack ? redactSecrets(String(error.stack)).slice(0, MAX_STACK_CHARS) : ''
  };
}

function normalizeMetaValue(key, value, depth = 0) {
  if (SENSITIVE_META_KEY_RE.test(String(key || ''))) return '[redacted]';
  if (value instanceof Error) return serializeError(value);
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (depth >= MAX_META_DEPTH) return '[max-depth]';
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMetaValue('', item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = Object.create(null);
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = normalizeMetaValue(childKey, childValue, depth + 1);
    }
    return out;
  }
  return redactSecrets(String(value));
}

function normalizeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { meta: normalizeMetaValue('meta', meta) };
  }
  const out = Object.create(null);
  for (const [key, value] of Object.entries(meta)) {
    out[key] = normalizeMetaValue(key, value);
  }
  return out;
}

function write(level, message, meta) {
  const normalized = normalizeMeta(meta);
  const traceId = normalized.traceId || getTraceId();
  const line = {
    ts: nowIso(),
    level,
    message,
    ...(traceId ? { traceId } : {}),
    ...normalized
  };
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(JSON.stringify(line));
}

export const logger = {
  debug: (message, meta = {}) => write('debug', message, meta),
  info: (message, meta = {}) => write('info', message, meta),
  warn: (message, meta = {}) => write('warn', message, meta),
  error: (message, meta = {}) => write('error', message, meta)
};
