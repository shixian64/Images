// 前端认证客户端：统一 fetch 包装（带 CSRF 头 + cookie）、当前用户缓存。
// 其他 modules 的所有 fetch 都应该通过 apiFetch，避免漏挂 X-Requested-With。

let currentUser = null;

// why：集中处理 credentials/CSRF header/JSON 编码，避免每处 fetch 都手写。
export async function apiFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = new Headers(opts.headers || {});

  // 非 GET/HEAD 必须带 CSRF 标记，后端 requireCsrf 校验。
  if (method !== 'GET' && method !== 'HEAD') {
    if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'fetch');
  }

  let body = opts.body;
  const isPlainObject = body && typeof body === 'object'
    && !(body instanceof FormData)
    && !(body instanceof Blob)
    && !(body instanceof ArrayBuffer)
    && !(body instanceof URLSearchParams)
    && !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
  if (isPlainObject) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  return fetch(url, {
    ...opts,
    method,
    headers,
    body,
    credentials: opts.credentials || 'include'
  });
}

export async function getMe() {
  try {
    const resp = await apiFetch('/api/auth/me');
    if (resp.status === 401) return null;
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    const user = data?.user || null;
    if (user) setCurrentUser(user);
    return user;
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // 失败也跳转，避免卡在中间态。
  }
  currentUser = null;
  location.href = '/login.html';
}

export function setCurrentUser(user) {
  currentUser = user || null;
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserId() {
  return currentUser?.id || null;
}
