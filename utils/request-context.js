import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACE_ID_HEADER = 'x-trace-id';

const requestContext = new AsyncLocalStorage();

function firstHeader(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function normalizeTraceId(value) {
  const traceId = String(firstHeader(value) || '').trim();
  if (!traceId) return '';
  if (traceId.length > 128) return '';
  return /^[A-Za-z0-9._:-]+$/.test(traceId) ? traceId : '';
}

export function traceIdFromRequest(req) {
  const headers = req?.headers || {};
  return normalizeTraceId(headers[REQUEST_ID_HEADER] || headers[TRACE_ID_HEADER]) || randomUUID();
}

export function attachTraceId(req, res) {
  const traceId = traceIdFromRequest(req);
  req.traceId = traceId;
  if (!res.headersSent && typeof res.setHeader === 'function' && !res.getHeader?.(REQUEST_ID_HEADER)) {
    res.setHeader(REQUEST_ID_HEADER, traceId);
  }
  return traceId;
}

export function runWithRequestContext(context, fn) {
  return requestContext.run(context || {}, fn);
}

export function getRequestContext() {
  return requestContext.getStore() || {};
}

export function getTraceId() {
  return getRequestContext().traceId || '';
}
