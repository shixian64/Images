import { positiveIntFromEnv } from './config.js';

export const SECURITY_HEADERS = Object.freeze({
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
});

export function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...(headers || {}) };
}

export function sendJson(res, status, payload) {
  res.writeHead(status, withSecurityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }));
  res.end(JSON.stringify(payload));
}

export function sendMethodNotAllowed(res, allow, payload = { error: 'method not allowed' }) {
  const allowValue = Array.isArray(allow) ? allow.join(', ') : String(allow || '');
  res.writeHead(405, withSecurityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    allow: allowValue
  }));
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res, status = 204) {
  res.writeHead(status, withSecurityHeaders({
    'cache-control': 'no-store'
  }));
  res.end();
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_MULTIPART_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export function getJsonBodyLimitBytes() {
  return positiveIntFromEnv('MAX_JSON_BODY_BYTES', DEFAULT_JSON_BODY_LIMIT_BYTES);
}

export function getMultipartBodyLimitBytes() {
  return positiveIntFromEnv('MAX_MULTIPART_BODY_BYTES', DEFAULT_MULTIPART_BODY_LIMIT_BYTES);
}

export const HTTP_ERROR_CODES = Object.freeze({
  INVALID_JSON: 'invalid_json',
  REQUEST_BODY_TOO_LARGE: 'request_body_too_large',
  MULTIPART_BOUNDARY_REQUIRED: 'multipart_boundary_required',
  INVALID_MULTIPART_BODY: 'invalid_multipart_body',
  MULTIPART_FIELD_NAME_REQUIRED: 'multipart_field_name_required',
  INTERNAL_ERROR: 'internal_error'
});

export function createHttpError(statusCode, message, code) {
  const status = Number(statusCode) || 500;
  const err = new Error(message);
  err.statusCode = status;
  err.status = status;
  if (code) err.code = code;
  return err;
}

export function httpError(statusCode, message, code) {
  return createHttpError(statusCode, message, code);
}

export function errorStatus(error, fallback = 500) {
  return Number(error?.statusCode || error?.status) || fallback;
}

export function bodyErrorStatus(error) {
  return errorStatus(error, 400);
}

function assertContentLengthWithinLimit(req, limitBytes) {
  const raw = req.headers?.['content-length'] || req.headers?.['Content-Length'];
  if (raw === undefined) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > limitBytes) {
    throw createHttpError(413, `request body too large (max ${limitBytes} bytes)`, HTTP_ERROR_CODES.REQUEST_BODY_TOO_LARGE);
  }
}

const COMMON_ROUTE_ERROR_STATUSES = Object.freeze({
  unauthorized: 401,
  forbidden: 403,
  'self-modify forbidden': 403,
  'user not found': 404,
  'image not found': 404,
  'username already taken': 409,
  'email already taken': 409,
  'cannot remove last active admin': 409
});

function normalizeRouteErrorStatusOptions(options = {}) {
  if (
    options.messages ||
    options.startsWith ||
    options.includes ||
    options.fallback !== undefined
  ) {
    return options;
  }
  return { messages: options };
}

function mappedStatus(message, mappings = {}) {
  if (!message) return 0;
  if (Object.hasOwn(mappings, message)) return Number(mappings[message]) || 0;
  return 0;
}

export function routeErrorStatus(error, options = {}, fallback = 400) {
  const explicit = errorStatus(error, 0);
  if (explicit) return explicit;

  const normalized = normalizeRouteErrorStatusOptions(options);
  const finalFallback = Number(normalized.fallback ?? fallback) || 400;
  const message = typeof error === 'string' ? error : error?.message || String(error || '');
  const messages = { ...COMMON_ROUTE_ERROR_STATUSES, ...(normalized.messages || {}) };
  const exact = mappedStatus(message, messages);
  if (exact) return exact;

  for (const [prefix, status] of Object.entries(normalized.startsWith || {})) {
    if (message.startsWith(prefix)) return Number(status) || finalFallback;
  }
  for (const [needle, status] of Object.entries(normalized.includes || {})) {
    if (message.includes(needle)) return Number(status) || finalFallback;
  }
  return finalFallback;
}

export async function readJsonBody(req, { limitBytes = getJsonBodyLimitBytes() } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw createHttpError(413, `request body too large (max ${limitBytes} bytes)`, HTTP_ERROR_CODES.REQUEST_BODY_TOO_LARGE);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError(400, 'invalid json', HTTP_ERROR_CODES.INVALID_JSON);
  }
}

function multipartBoundary(contentType) {
  const raw = String(contentType || '');
  const match = raw.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || '').trim();
  if (!boundary) throw createHttpError(400, 'multipart boundary is required', HTTP_ERROR_CODES.MULTIPART_BOUNDARY_REQUIRED);
  return boundary;
}

function parseHeaderParams(value = '') {
  const out = Object.create(null);
  const parts = String(value).split(';');
  out.type = String(parts.shift() || '').trim().toLowerCase();
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    let val = part.slice(index + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    out[key] = val;
  }
  return out;
}

function parsePartHeaders(raw) {
  const headers = Object.create(null);
  for (const line of String(raw || '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

function assignField(fields, name, value) {
  if (fields[name] === undefined) {
    fields[name] = value;
  } else if (Array.isArray(fields[name])) {
    fields[name].push(value);
  } else {
    fields[name] = [fields[name], value];
  }
}

function parseDelimiterAt(buffer, pos, delimiter) {
  if (pos < 0 || pos + delimiter.length > buffer.length) return null;
  if (!buffer.subarray(pos, pos + delimiter.length).equals(delimiter)) return null;

  let next = pos + delimiter.length;
  let closing = false;
  if (buffer[next] === 0x2d && buffer[next + 1] === 0x2d) {
    closing = true;
    next += 2;
  }

  if (next === buffer.length) return { closing, nextPos: next };
  if (buffer[next] === 0x0d && buffer[next + 1] === 0x0a) {
    return { closing, nextPos: next + 2 };
  }
  return null;
}

function findFirstDelimiter(buffer, delimiter) {
  let pos = buffer.indexOf(delimiter);
  while (pos !== -1) {
    const atLineStart = pos === 0 || (pos >= 2 && buffer[pos - 2] === 0x0d && buffer[pos - 1] === 0x0a);
    if (atLineStart) {
      const delimiterInfo = parseDelimiterAt(buffer, pos, delimiter);
      if (delimiterInfo) return { delimiterPos: pos, ...delimiterInfo };
    }
    pos = buffer.indexOf(delimiter, pos + 1);
  }
  return null;
}

const MULTIPART_STREAM_CHUNK_BYTES = 64 * 1024;
const MULTIPART_HEADER_LIMIT_BYTES = 64 * 1024;

export async function readMultipartFormData(req, {
  limitBytes = getMultipartBodyLimitBytes()
} = {}) {
  assertContentLengthWithinLimit(req, limitBytes);
  const boundary = multipartBoundary(req.headers?.['content-type'] || req.headers?.['Content-Type']);
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiterMarker = Buffer.from(`\r\n--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');
  const contentTailBytes = nextDelimiterMarker.length + 4;

  const fields = Object.create(null);
  const files = [];

  let pending = Buffer.alloc(0);
  let total = 0;
  let state = 'start';
  let part = null;
  let closed = false;

  function invalidMultipart(message = 'invalid multipart body') {
    throw createHttpError(400, message, HTTP_ERROR_CODES.INVALID_MULTIPART_BODY);
  }

  function appendPending(chunk) {
    if (!chunk.length) return;
    pending = pending.length ? Buffer.concat([pending, chunk], pending.length + chunk.length) : Buffer.from(chunk);
  }

  function appendPartContent(buffer) {
    if (!buffer.length) return;
    part.chunks.push(buffer);
    part.size += buffer.length;
  }

  function finishPart() {
    const content = Buffer.concat(part.chunks, part.size);
    if (part.disposition.filename !== undefined) {
      files.push({
        fieldName: part.name,
        filename: part.disposition.filename || 'upload',
        contentType: part.headers['content-type'] || 'application/octet-stream',
        buffer: content
      });
    } else {
      assignField(fields, part.name, content.toString('utf8'));
    }
    part = null;
  }

  function processPending(atEnd = false) {
    while (!closed) {
      if (state === 'start') {
        const current = findFirstDelimiter(pending, delimiter);
        if (!current) {
          if (atEnd) invalidMultipart();
          const keep = Math.min(pending.length, delimiter.length + 4);
          if (pending.length > keep) pending = pending.subarray(pending.length - keep);
          return;
        }
        if (!atEnd && current.nextPos === current.delimiterPos + delimiter.length) {
          pending = pending.subarray(current.delimiterPos);
          return;
        }
        pending = pending.subarray(current.nextPos);
        if (current.closing) {
          closed = true;
          return;
        }
        state = 'headers';
        continue;
      }

      if (state === 'headers') {
        const headerEnd = pending.indexOf(headerEndMarker);
        if (headerEnd === -1) {
          if (atEnd) invalidMultipart('invalid multipart part');
          if (pending.length > MULTIPART_HEADER_LIMIT_BYTES) invalidMultipart('invalid multipart headers');
          return;
        }
        const headers = parsePartHeaders(pending.slice(0, headerEnd).toString('utf8'));
        const disposition = parseHeaderParams(headers['content-disposition'] || '');
        const name = disposition.name;
        if (!name) throw createHttpError(400, 'multipart field name is required', HTTP_ERROR_CODES.MULTIPART_FIELD_NAME_REQUIRED);
        part = { headers, disposition, name, chunks: [], size: 0 };
        pending = pending.subarray(headerEnd + headerEndMarker.length);
        state = 'content';
        continue;
      }

      let searchFrom = 0;
      let markerPos = pending.indexOf(nextDelimiterMarker, searchFrom);
      while (markerPos !== -1) {
        const afterMarker = markerPos + nextDelimiterMarker.length;
        if (!atEnd && afterMarker + 2 > pending.length) {
          appendPartContent(pending.subarray(0, markerPos));
          pending = pending.subarray(markerPos);
          return;
        }
        const next = parseDelimiterAt(pending, markerPos + 2, delimiter);
        if (next) {
          appendPartContent(pending.subarray(0, markerPos));
          finishPart();
          pending = pending.subarray(next.nextPos);
          if (next.closing) {
            closed = true;
            return;
          }
          state = 'headers';
          break;
        }
        searchFrom = markerPos + 1;
        markerPos = pending.indexOf(nextDelimiterMarker, searchFrom);
      }
      if (state === 'headers') continue;
      if (markerPos === -1) {
        if (atEnd) invalidMultipart('invalid multipart boundary');
        const keep = Math.min(pending.length, contentTailBytes);
        const flushEnd = pending.length - keep;
        if (flushEnd > 0) {
          appendPartContent(pending.subarray(0, flushEnd));
          pending = pending.subarray(flushEnd);
        }
        return;
      }
    }
  }

  for await (const rawChunk of req) {
    const chunk = Buffer.from(rawChunk);
    for (let offset = 0; offset < chunk.length; offset += MULTIPART_STREAM_CHUNK_BYTES) {
      const piece = chunk.subarray(offset, Math.min(chunk.length, offset + MULTIPART_STREAM_CHUNK_BYTES));
      total += piece.length;
      if (total > limitBytes) {
        throw createHttpError(413, `request body too large (max ${limitBytes} bytes)`, HTTP_ERROR_CODES.REQUEST_BODY_TOO_LARGE);
      }
      appendPending(piece);
      processPending(false);
    }
  }
  processPending(true);
  if (!closed) invalidMultipart();

  return { fields, files };
}
