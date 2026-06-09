// 请求来源工具：统一获取客户端 IP / UA，并避免默认信任可伪造的转发头。

import { isIP } from 'node:net';

const DEFAULT_TRUSTED_PROXY_IPS = Object.freeze(['127.0.0.1', '::1']);

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

function trustedProxyRules() {
  const raw = process.env.TRUST_PROXY_ALLOWED_IPS;
  if (raw === undefined || raw === '') return [...DEFAULT_TRUSTED_PROXY_IPS];
  return String(raw)
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip) {
  const parts = String(ip || '').split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = ((out << 8) | n) >>> 0;
  }
  return out >>> 0;
}

function matchesIpv4Cidr(ip, rule) {
  const match = String(rule || '').match(/^([^/]+)\/(\d{1,2})$/);
  if (!match) return false;
  const [, baseRaw, prefixRaw] = match;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const normalizedBase = normalizeIp(baseRaw);
  if (isIP(ip) !== 4 || isIP(normalizedBase) !== 4) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(normalizedBase);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function matchesProxyRule(ip, rule) {
  const text = String(rule || '').trim();
  if (!text) return false;
  if (text === '*') return true;
  if (text.includes('/')) return matchesIpv4Cidr(ip, text);
  return normalizeIp(text) === ip;
}

export function shouldTrustForwardedHeaders(req) {
  if (!isTrustProxyEnabled()) return false;
  const direct = normalizeIp(req?.socket?.remoteAddress || 'unknown');
  return trustedProxyRules().some((rule) => matchesProxyRule(direct, rule));
}

export function clientIp(req) {
  const direct = normalizeIp(req?.socket?.remoteAddress || 'unknown');
  if (!shouldTrustForwardedHeaders(req)) return direct;

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
