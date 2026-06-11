import { positiveIntFromEnv } from '../utils/config.js';
import { createAbortError } from './upstream-transport.js';

const DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES = 40 * 1024 * 1024;

export function getMaxUpstreamResponseBytes() {
  return positiveIntFromEnv('MAX_UPSTREAM_RESPONSE_BYTES', DEFAULT_MAX_UPSTREAM_RESPONSE_BYTES);
}

function upstreamHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertContentLengthWithinLimit(response, limitBytes) {
  const raw = response.headers?.get?.('content-length');
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > limitBytes) {
    throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

export async function readResponseTextLimited(
  response,
  limitBytes = getMaxUpstreamResponseBytes(),
  { signal } = {}
) {
  throwIfAborted(signal);
  assertContentLengthWithinLimit(response, limitBytes);

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    throwIfAborted(signal);
    if (buffer.length > limitBytes) {
      throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
    }
    return buffer.toString('utf8');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf8');
  const chunks = [];
  let total = 0;
  const onAbort = () => {
    try { reader.cancel?.(createAbortError()); } catch { /* ignore */ }
  };
  try {
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > limitBytes) {
        await reader.cancel?.();
        throw upstreamHttpError(502, `Upstream response too large (max ${limitBytes} bytes).`);
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    reader.releaseLock?.();
  }
  const tail = decoder.decode();
  if (tail) chunks.push(tail);
  return chunks.join('');
}
