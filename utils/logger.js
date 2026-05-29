import { getTraceId } from './request-context.js';
import { redactSecrets } from './mask.js';

const MAX_STACK_CHARS = 4000;

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

function normalizeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { meta };
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = serializeError(value);
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
