// 内存滑动窗口限流。重启失效，本地工具够用。

const store = new Map();

export function hit(key, max, windowMs) {
  const now = Date.now();
  const arr = store.get(key) || [];
  const fresh = arr.filter((ts) => now - ts < windowMs);
  if (fresh.length >= max) {
    store.set(key, fresh);
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - fresh[0]) };
  }
  fresh.push(now);
  store.set(key, fresh);
  return { allowed: true, remaining: max - fresh.length, retryAfterMs: 0 };
}

export function reset(key) {
  store.delete(key);
}

export function clear() {
  store.clear();
}
