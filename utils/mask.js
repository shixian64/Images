// API Key 脱敏工具。任何出现在日志 / 错误体 / 响应里的密钥都必须经过这里。
// 对应 docs/PRODUCT_DESIGN.md §8.6 SRE：不把 API Key 写进日志。

export function maskApiKey(key) {
  const value = String(key || '');
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function redactAuthorizationHeader(value) {
  return value.replace(
    /\b((?:authorization|proxy-authorization)\s*[:=]\s*)(Bearer\s+)?([A-Za-z0-9._~+/=*-]{4,})/gi,
    (_match, prefix, bearer = '', token) => `${prefix}${bearer}${maskApiKey(token)}`
  );
}

function redactNamedApiKeys(value) {
  return value.replace(
    /\b((?:api[-_ ]?key|x-api-key)\s*[:=]\s*)([A-Za-z0-9._~+/=*-]{4,})/gi,
    (_match, prefix, token) => `${prefix}${maskApiKey(token)}`
  );
}

function redactBearerTokens(value) {
  return value.replace(
    /\b(Bearer\s+)([A-Za-z0-9._~+/=*-]{4,})/gi,
    (_match, prefix, token) => `${prefix}${maskApiKey(token)}`
  );
}

function redactOpenAiStyleKeys(value) {
  return value.replace(
    /\bsk-[A-Za-z0-9._-]{6,}\b/g,
    (token) => maskApiKey(token)
  );
}

export function redactSecrets(value, secrets = []) {
  let out = String(value ?? '');

  out = redactAuthorizationHeader(out);
  out = redactNamedApiKeys(out);
  out = redactBearerTokens(out);
  out = redactOpenAiStyleKeys(out);

  const explicit = Array.isArray(secrets) ? secrets : [secrets];
  for (const secret of explicit) {
    const token = String(secret || '');
    if (token.length < 4) continue;
    out = out.split(token).join(maskApiKey(token));
  }
  return out;
}
