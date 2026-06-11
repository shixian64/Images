import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_IPV4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32]
];

function normalizeHostname(hostname) {
  return String(hostname || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0) >>> 0;
}

function ipv4InCidr(ip, base, bits) {
  const value = ipv4ToInt(ip);
  const start = ipv4ToInt(base);
  if (value === null || start === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (start & mask);
}

function isBlockedIpv4(ip) {
  return BLOCKED_IPV4_CIDRS.some(([base, bits]) => ipv4InCidr(ip, base, bits));
}

function ipv6ToHextets(ip) {
  let value = normalizeHostname(ip).split('%')[0];

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const dotted = value.slice(lastColon + 1);
    const embedded = ipv4ToInt(dotted);
    if (lastColon < 0 || embedded === null) return null;
    value = `${value.slice(0, lastColon)}:${((embedded >>> 16) & 0xffff).toString(16)}:${(embedded & 0xffff).toString(16)}`;
  }

  const compressed = value.split('::');
  if (compressed.length > 2) return null;

  const left = compressed[0] ? compressed[0].split(':') : [];
  const right = compressed.length === 2 && compressed[1] ? compressed[1].split(':') : [];
  const zeroCount = compressed.length === 2 ? 8 - left.length - right.length : 0;
  if (zeroCount < 0) return null;

  const parts = compressed.length === 2
    ? [...left, ...Array(zeroCount).fill('0'), ...right]
    : left;
  if (parts.length !== 8) return null;

  const hextets = parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    return Number.parseInt(part, 16);
  });
  return hextets.some((part) => part === null) ? null : hextets;
}

function embeddedIpv4FromIpv6(ip) {
  const hextets = ipv6ToHextets(ip);
  if (!hextets) return null;

  const first80Zero = hextets.slice(0, 5).every((part) => part === 0);
  const first96Zero = first80Zero && hextets[5] === 0;
  const isMapped = first80Zero && hextets[5] === 0xffff;
  const isCompatible = first96Zero && (hextets[6] !== 0 || hextets[7] !== 0);
  if (!isMapped && !isCompatible) return null;

  return [
    (hextets[6] >>> 8) & 0xff,
    hextets[6] & 0xff,
    (hextets[7] >>> 8) & 0xff,
    hextets[7] & 0xff
  ].join('.');
}

function isBlockedIpv6(ip) {
  const value = normalizeHostname(ip);
  if (value === '::' || value === '::1') return true;
  const embeddedIpv4 = embeddedIpv4FromIpv6(value);
  if (embeddedIpv4) return isBlockedIpv4(embeddedIpv4);
  return /^(fc|fd)/.test(value)
    || /^fe[89ab]/.test(value)
    || value.startsWith('ff');
}

function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return false;
}

function normalizeLookupRecords(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      address: String(record?.address || '').trim(),
      family: Number(record?.family) || isIP(record?.address)
    }))
    .filter((record) => record.address && (record.family === 4 || record.family === 6));
}

function pinnedLookup(records) {
  const clean = normalizeLookupRecords(records);
  return function lookup(_hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!clean.length) {
      callback(new Error('No vetted upstream address is available.'));
      return;
    }
    if (options?.all) {
      callback(null, clean.map((record) => ({ ...record })));
      return;
    }
    callback(null, clean[0].address, clean[0].family);
  };
}

export async function assertAllowedUpstreamUrl(url, { lookupImpl = dnsLookup } = {}) {
  const parsed = new URL(url);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:') {
    if (protocol !== 'http:' || process.env.ALLOW_INSECURE_UPSTREAMS !== '1') {
      throw new Error('Upstream URL must use https.');
    }
  }
  if (parsed.username || parsed.password) {
    throw new Error('Upstream URL must not include credentials.');
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) throw new Error('Upstream host is required.');

  // Local/private upstreams are common in isolated development, but they are
  // also the SSRF boundary. Require an explicit opt-in in every environment so
  // running without a loaded .env still matches the documented secure default.
  const allowPrivateUpstreams = process.env.ALLOW_PRIVATE_UPSTREAMS === '1';
  if (allowPrivateUpstreams) {
    return { ok: true, parsed, host, records: null, lookup: null, privateUpstreamsAllowed: true };
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isBlockedAddress(host)) {
    throw new Error('Upstream host is not allowed.');
  }

  if (isIP(host)) {
    const record = { address: host, family: isIP(host) };
    return { ok: true, parsed, host, records: [record], lookup: pinnedLookup([record]) };
  }

  let records;
  try {
    records = await lookupImpl(host, { all: true, verbatim: false });
  } catch (err) {
    throw new Error(`Unable to resolve upstream host: ${err.message || String(err)}`);
  }
  records = normalizeLookupRecords(records);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Unable to resolve upstream host.');
  }
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('Upstream host resolves to a private address.');
    }
  }
  return { ok: true, parsed, host, records, lookup: pinnedLookup(records) };
}
