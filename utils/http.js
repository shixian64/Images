// 极小的 HTTP 辅助层。未来替换成 Fastify / Next.js Route Handler 时只需改这里。

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_MULTIPART_BODY_LIMIT_BYTES = 100 * 1024 * 1024;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getJsonBodyLimitBytes() {
  return parsePositiveInt(process.env.MAX_JSON_BODY_BYTES, DEFAULT_JSON_BODY_LIMIT_BYTES);
}

export function getMultipartBodyLimitBytes() {
  return parsePositiveInt(process.env.MAX_MULTIPART_BODY_BYTES, DEFAULT_MULTIPART_BODY_LIMIT_BYTES);
}

export function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function bodyErrorStatus(error) {
  return Number(error?.statusCode) || 400;
}

export async function readJsonBody(req, { limitBytes = getJsonBodyLimitBytes() } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw httpError(413, `request body too large (max ${limitBytes} bytes)`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, 'invalid json');
  }
}

async function readBodyBuffer(req, { limitBytes }) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw httpError(413, `request body too large (max ${limitBytes} bytes)`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

function multipartBoundary(contentType) {
  const raw = String(contentType || '');
  const match = raw.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || '').trim();
  if (!boundary) throw httpError(400, 'multipart boundary is required');
  return boundary;
}

function parseHeaderParams(value = '') {
  const out = {};
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
  const headers = {};
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

export async function readMultipartFormData(req, {
  limitBytes = getMultipartBodyLimitBytes()
} = {}) {
  const boundary = multipartBoundary(req.headers?.['content-type'] || req.headers?.['Content-Type']);
  const buffer = await readBodyBuffer(req, { limitBytes });
  const delimiter = Buffer.from(`--${boundary}`);
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');

  const fields = {};
  const files = [];
  let pos = buffer.indexOf(delimiter);
  if (pos === -1) throw httpError(400, 'invalid multipart body');

  while (pos !== -1) {
    pos += delimiter.length;
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break; // "--"
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;

    const headerEnd = buffer.indexOf(headerEndMarker, pos);
    if (headerEnd === -1) throw httpError(400, 'invalid multipart part');
    const headers = parsePartHeaders(buffer.slice(pos, headerEnd).toString('utf8'));
    const disposition = parseHeaderParams(headers['content-disposition'] || '');
    const name = disposition.name;
    if (!name) throw httpError(400, 'multipart field name is required');

    const contentStart = headerEnd + headerEndMarker.length;
    const contentEnd = buffer.indexOf(nextDelimiter, contentStart);
    if (contentEnd === -1) throw httpError(400, 'invalid multipart boundary');
    const content = buffer.slice(contentStart, contentEnd);

    if (disposition.filename !== undefined) {
      files.push({
        fieldName: name,
        filename: disposition.filename || 'upload',
        contentType: headers['content-type'] || 'application/octet-stream',
        buffer: content
      });
    } else {
      assignField(fields, name, content.toString('utf8'));
    }

    pos = contentEnd + 2; // skip CRLF before the next boundary
    if (buffer.indexOf(delimiter, pos) !== pos) {
      pos = buffer.indexOf(delimiter, pos);
    }
  }

  return { fields, files };
}
