import { redactSecrets } from '../utils/mask.js';

export const AUDIT_META_MAX_JSON_CHARS = 20_000;
const AUDIT_META_MAX_TEXT_CHARS = 4_000;
const AUDIT_META_MAX_KEY_CHARS = 120;
const AUDIT_META_MAX_DEPTH = 6;
const AUDIT_META_MAX_ARRAY_ITEMS = 80;
const AUDIT_META_MAX_OBJECT_KEYS = 120;
const REDACTED = '[redacted]';
const SENSITIVE_KEY_RE = /(?:api[-_ ]?key|authorization|bearer|token|password|passwd|secret|credential)/i;

function truncateText(value, maxChars = AUDIT_META_MAX_TEXT_CHARS) {
  const text = String(value ?? '');
  const max = Math.max(0, Math.floor(Number(maxChars) || 0));
  if (text.length <= max) return text;
  if (max <= 3) return '.'.repeat(max);
  return `${text.slice(0, max - 3)}...`;
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY_RE.test(String(key || ''));
}

function normalizeValue(value, depth, seen) {
  if (depth > AUDIT_META_MAX_DEPTH) return '[max-depth]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return truncateText(redactSecrets(value));
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return truncateText(value);

  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
    }

    if (Array.isArray(value)) {
      const out = value
        .slice(0, AUDIT_META_MAX_ARRAY_ITEMS)
        .map((item) => normalizeValue(item, depth + 1, seen));
      if (value.length > AUDIT_META_MAX_ARRAY_ITEMS) {
        out.push({
          truncated: true,
          omittedItems: value.length - AUDIT_META_MAX_ARRAY_ITEMS
        });
      }
      return out;
    }

    const entries = Object.entries(value);
    const out = Object.create(null);
    for (const [key, item] of entries.slice(0, AUDIT_META_MAX_OBJECT_KEYS)) {
      const safeKey = truncateText(key, AUDIT_META_MAX_KEY_CHARS);
      out[safeKey] = isSensitiveKey(key) ? REDACTED : normalizeValue(item, depth + 1, seen);
    }
    if (entries.length > AUDIT_META_MAX_OBJECT_KEYS) {
      out.__truncated = {
        omittedKeys: entries.length - AUDIT_META_MAX_OBJECT_KEYS
      };
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function buildTruncatedMeta(json, maxChars) {
  const originalJsonChars = json.length;
  const out = {
    truncated: true,
    originalJsonChars,
    preview: ''
  };
  const overhead = JSON.stringify(out).length;
  out.preview = truncateText(json, Math.max(0, maxChars - overhead - 1));

  while (JSON.stringify(out).length > maxChars && out.preview.length > 0) {
    out.preview = truncateText(out.preview, Math.max(0, out.preview.length - 256));
  }
  return out;
}

export function normalizeAuditMeta(meta, { maxJsonChars = AUDIT_META_MAX_JSON_CHARS } = {}) {
  if (meta === undefined || meta === null) return null;
  const normalized = normalizeValue(meta, 0, new WeakSet());
  const json = JSON.stringify(normalized);
  if (json.length <= maxJsonChars) return normalized;
  return buildTruncatedMeta(json, maxJsonChars);
}
