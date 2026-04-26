// 极小的 HTTP 辅助层。未来替换成 Fastify / Next.js Route Handler 时只需改这里。

export function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getJsonBodyLimitBytes() {
  return parsePositiveInt(process.env.MAX_JSON_BODY_BYTES, DEFAULT_JSON_BODY_LIMIT_BYTES);
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
