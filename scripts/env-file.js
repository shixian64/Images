import { readFileSync } from 'node:fs';

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
      quote = quote === ch ? null : (quote || ch);
      continue;
    }
    if (ch === '#' && !quote && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trimEnd();
}

function unquoteValue(value) {
  const trimmed = stripInlineComment(value.trim());
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;
  const inner = trimmed.slice(1, -1);
  if (quote === "'") return inner;
  return inner.replace(/\\([nrt"\\])/g, (_, ch) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return ch;
  });
}

export function parseEnvFile(text) {
  const parsed = new Map();
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const name = normalized.slice(0, eq).trim();
    if (!ENV_NAME_RE.test(name)) continue;
    parsed.set(name, unquoteValue(normalized.slice(eq + 1)));
  }
  return parsed;
}

export function loadEnvFile(filePath = '.env', { env = process.env, override = false } = {}) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { loaded: false, count: 0 };
    throw err;
  }
  const parsed = parseEnvFile(text);
  let count = 0;
  for (const [name, value] of parsed.entries()) {
    if (!override && env[name] !== undefined) continue;
    env[name] = value;
    count += 1;
  }
  return { loaded: true, count };
}
