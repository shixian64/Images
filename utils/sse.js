const DEFAULT_HEARTBEAT_MS = 25_000;

function responseClosed(res) {
  return !res || res.destroyed || res.writableEnded;
}

export function writeSse(res, event, data = {}) {
  if (responseClosed(res) || typeof res.write !== 'function') return false;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function writeSseComment(res, message) {
  if (responseClosed(res) || typeof res.write !== 'function') return false;
  try {
    res.write(`: ${message}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function openSse(res, { comment = 'connected', headers = {} } = {}) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
    ...headers
  });
  res.flushHeaders?.();
  if (comment !== false) writeSseComment(res, comment);
}

export function createSseSession(res, {
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  onHeartbeat = null,
  onClose = null
} = {}) {
  let closed = false;
  let cleanupCalled = false;
  let heartbeat = null;

  const session = {
    isClosed() {
      return closed || responseClosed(res);
    },
    cleanup() {
      if (cleanupCalled) return;
      cleanupCalled = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      try {
        onClose?.();
      } catch {
        // Subscriber cleanup must be best-effort and must not crash the close path.
      }
    },
    close() {
      closed = true;
      session.cleanup();
    },
    end() {
      session.close();
      if (!responseClosed(res) && typeof res.end === 'function') res.end();
    }
  };

  const interval = Math.max(0, Math.floor(Number(heartbeatMs) || 0));
  if (interval > 0) {
    heartbeat = setInterval(() => {
      if (session.isClosed()) return;
      try {
        if (typeof onHeartbeat === 'function') onHeartbeat(session);
        else writeSseComment(res, `heartbeat ${Date.now()}`);
      } catch {
        session.close();
      }
    }, interval);
    heartbeat.unref?.();
  }

  res.on?.('close', session.close);
  return session;
}
