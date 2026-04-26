// 请求来源工具：统一获取客户端 IP / UA，并避免默认信任可伪造的转发头。

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function firstHeader(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function firstForwardedFor(value) {
  const text = firstHeader(value);
  if (!text) return '';
  return text.split(',')[0]?.trim() || '';
}

function parseForwarded(value) {
  const text = firstHeader(value);
  if (!text) return '';
  const first = text.split(',')[0] || '';
  const match = first.match(/(?:^|;)\s*for=(?:"?)([^;"]+)/i);
  if (!match) return '';
  return match[1].trim();
}

export function normalizeIp(raw) {
  let ip = String(raw || '').trim();
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  if (ip === '::1') return '127.0.0.1';
  // RFC 7239 IPv6 可能形如 [2001:db8::1]:1234，只剥掉括号和端口。
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  // IPv4:port
  const ipv4Port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4Port) ip = ipv4Port[1];
  return ip;
}

export function isTrustProxyEnabled() {
  return envBool('TRUST_PROXY') || envBool('TRUST_FORWARDED_HEADERS');
}

export function clientIp(req) {
  const direct = normalizeIp(req?.socket?.remoteAddress || 'unknown');
  if (!isTrustProxyEnabled()) return direct;

  const headers = req?.headers || {};
  const candidates = [
    firstHeader(headers['cf-connecting-ip']),
    firstHeader(headers['x-real-ip']),
    firstForwardedFor(headers['x-forwarded-for']),
    parseForwarded(headers.forwarded)
  ];
  const found = candidates.find((value) => value && String(value).trim());
  return normalizeIp(found || direct);
}

export function userAgent(req) {
  return firstHeader(req?.headers?.['user-agent']) || '';
}
