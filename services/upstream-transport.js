import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { assertAllowedUpstreamUrl } from './upstream-url-policy.js';

export function createAbortError() {
  return new DOMException('This operation was aborted.', 'AbortError');
}

function normalizeHeaders(headers = {}) {
  const out = {};
  const source = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers || {});
  for (const [key, value] of source) {
    if (value === undefined || value === null) continue;
    const lower = String(key).toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function headersFromIncoming(raw = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, String(item));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function fetchWithPinnedDns(policy, options = {}) {
  const parsed = policy.parsed || new URL(policy.url || '');
  const requestImpl = parsed.protocol === 'http:' ? httpRequest : httpsRequest;
  const method = String(options.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(options.headers || {});
  const body = options.body;
  const bodyBuffer = body === undefined || body === null
    ? null
    : Buffer.isBuffer(body)
      ? body
      : body instanceof Uint8Array
        ? Buffer.from(body)
        : Buffer.from(String(body));
  if (bodyBuffer && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['content-length'] = String(bodyBuffer.length);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = requestImpl({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      method,
      headers,
      lookup: policy.lookup || undefined,
      servername: parsed.hostname
    }, (incoming) => {
      settled = true;
      const status = incoming.statusCode || 0;
      const responseHeaders = headersFromIncoming(incoming.headers);
      const bodyStream = status === 204 || status === 304 ? null : Readable.toWeb(incoming);
      resolve(new Response(bodyStream, {
        status,
        statusText: incoming.statusMessage || '',
        headers: responseHeaders
      }));
    });

    const onAbort = () => {
      req.destroy(createAbortError());
    };
    req.on('error', (err) => {
      options.signal?.removeEventListener?.('abort', onAbort);
      if (!settled) reject(err);
    });
    req.on('close', () => {
      options.signal?.removeEventListener?.('abort', onAbort);
    });
    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(createAbortError());
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

function withTimeoutSignal(options = {}, timeoutMs = null) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return { options, cleanup: () => {} };
  }

  const controller = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), Math.floor(ms));
  timeoutId.unref?.();

  return {
    options: { ...options, signal: controller.signal },
    cleanup: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener?.('abort', abortFromCaller);
    }
  };
}

export async function guardedFetch(
  url,
  options = {},
  { lookupImpl = dnsLookup, fetchImpl = null, timeoutMs = null } = {}
) {
  // Unit tests pass explicit fetchImpl stubs; production code should use the
  // pinned transport below so the socket connects to the already-vetted DNS
  // answer instead of re-resolving after the SSRF check.
  const timed = withTimeoutSignal(options, timeoutMs);
  try {
    if (fetchImpl && fetchImpl !== fetch) {
      return await fetchImpl(url, timed.options);
    }
    const policy = await assertAllowedUpstreamUrl(url, { lookupImpl });
    return await fetchWithPinnedDns(policy, timed.options);
  } finally {
    timed.cleanup();
  }
}
