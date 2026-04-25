// Cookie 解析与 session cookie 设置/清除。零依赖。

const COOKIE_NAME = 'sid';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const COOKIE_KEY = COOKIE_NAME;

export function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function isSecure() {
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(res, sid) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sid)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`
  ];
  if (isSecure()) parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

export function clearSessionCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0'
  ];
  if (isSecure()) parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

function appendSetCookie(res, value) {
  const existing = res.getHeader('set-cookie');
  if (!existing) {
    res.setHeader('set-cookie', value);
  } else if (Array.isArray(existing)) {
    res.setHeader('set-cookie', [...existing, value]);
  } else {
    res.setHeader('set-cookie', [existing, value]);
  }
}
