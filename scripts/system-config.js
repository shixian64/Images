#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { maskApiKey, redactSecrets } from '../utils/mask.js';
import { compactJsonValueForBudget } from '../utils/json-budget.js';

const DEFAULT_DB = join('generated', 'app.db');
const DEFAULT_OUTPUT = join('backups', 'system-config');
const DEFAULT_EXPORT_PREFIX = 'image-studio-system-config';
const EXPORT_KIND = 'system-config-export';
export const SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS = 50_000;

const SYSTEM_SETTINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
`;

const SENSITIVE_CONFIG_KEY_RE = /(?:api[-_ ]?key|authorization|bearer|token|password|passwd|secret|credential)/i;

function timestampForName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function parseStoredValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return String(value ?? '');
  }
}

function redactConfigValue(value, key = '') {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return SENSITIVE_CONFIG_KEY_RE.test(key) ? maskApiKey(value) : redactSecrets(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactConfigValue(item, key));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redactConfigValue(childValue, childKey)])
    );
  }
  return value;
}

function redactedExportValue(value) {
  const redacted = redactConfigValue(value);
  const json = JSON.stringify(redacted);
  if (!json || json.length <= SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS) {
    return { value: redacted };
  }
  return {
    value: compactJsonValueForBudget(json, {
      maxJsonChars: SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS,
      alreadyJson: true
    }),
    valueTruncated: true
  };
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function resolveOutputPath(output = DEFAULT_OUTPUT, name = `${DEFAULT_EXPORT_PREFIX}-${timestampForName()}.json`) {
  const out = resolve(output);
  if (extname(out).toLowerCase() === '.json') return out;
  return join(out, name);
}

function validateExportManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('invalid system config export');
  if (manifest.version !== 1 || manifest.kind !== EXPORT_KIND) throw new Error('invalid system config export');
  if (!Array.isArray(manifest.entries)) throw new Error('invalid system config entries');
}

function validateEntry(entry) {
  const key = String(entry?.key || '').trim();
  if (!key) throw new Error('system config entry key is required');
  if (/[\u0000-\u001f]/.test(key)) throw new Error(`invalid system config key: ${key}`);
  return {
    key,
    value: entry.value,
    updatedAt: entry.updatedAt || new Date().toISOString(),
    updatedBy: entry.updatedBy || null
  };
}

export function exportSystemConfig({
  dbPath = DEFAULT_DB,
  output = DEFAULT_OUTPUT,
  name,
  includeSecrets = false
} = {}) {
  const sourceDb = resolve(dbPath);
  if (!existsSync(sourceDb)) throw new Error(`database file not found: ${sourceDb}`);

  const db = new DatabaseSync(sourceDb, { readOnly: true });
  try {
    const rows = tableExists(db, 'system_settings')
      ? db.prepare(`
          SELECT key, value, updated_at, updated_by
          FROM system_settings
          ORDER BY key ASC
        `).all()
      : [];
    const entries = rows.map((row) => {
      const value = parseStoredValue(row.value);
      const exported = includeSecrets ? { value } : redactedExportValue(value);
      return {
        key: row.key,
        ...exported,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by || null
      };
    });
    const manifest = {
      version: 1,
      app: 'image-studio',
      kind: EXPORT_KIND,
      createdAt: new Date().toISOString(),
      sourceDb,
      includeSecrets: Boolean(includeSecrets),
      entryCount: entries.length,
      entries
    };
    const outputPath = resolveOutputPath(output, name);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { path: outputPath, manifest };
  } finally {
    db.close();
  }
}

export function importSystemConfig({
  dbPath = DEFAULT_DB,
  input,
  yes = false,
  replace = false
} = {}) {
  if (!input) throw new Error('system config import requires an export file path');
  if (!yes) throw new Error('system config import requires explicit --yes confirmation');

  const inputPath = resolve(input);
  if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
    throw new Error(`system config export file not found: ${inputPath}`);
  }
  const manifest = JSON.parse(readFileSync(inputPath, 'utf8'));
  validateExportManifest(manifest);
  if (!manifest.includeSecrets) {
    throw new Error('refusing to import a redacted system config export; re-export with --include-secrets');
  }

  const targetDb = resolve(dbPath);
  mkdirSync(dirname(targetDb), { recursive: true });
  const db = new DatabaseSync(targetDb);
  try {
    db.exec(SYSTEM_SETTINGS_SCHEMA);
    db.exec('BEGIN');
    try {
      if (replace) db.prepare('DELETE FROM system_settings').run();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
      `);
      for (const rawEntry of manifest.entries) {
        const entry = validateEntry(rawEntry);
        stmt.run(entry.key, JSON.stringify(entry.value), entry.updatedAt, entry.updatedBy);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return {
      dbPath: targetDb,
      imported: manifest.entries.length,
      replaced: Boolean(replace),
      source: inputPath
    };
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command, _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (['help', 'yes', 'replace', 'include-secrets'].includes(key)) {
      opts[key] = true;
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    opts[key] = value;
    i += 1;
  }
  return opts;
}

function printHelp() {
  console.log(`Usage:
  node --experimental-sqlite scripts/system-config.js export [--db generated/app.db] [--output backups/system-config] [--name NAME] [--include-secrets]
  node --experimental-sqlite scripts/system-config.js import EXPORT.json --yes [--db generated/app.db] [--replace]

Export or import system_settings configuration. Exports are redacted by default for audit/review; use --include-secrets only for protected backups intended for restore/import.`);
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (!opts.command || opts.help) {
    printHelp();
    return;
  }
  if (opts.command === 'export') {
    const result = exportSystemConfig({
      dbPath: opts.db,
      output: opts.output,
      name: opts.name,
      includeSecrets: Boolean(opts['include-secrets'])
    });
    console.log(JSON.stringify({
      ok: true,
      path: result.path,
      entryCount: result.manifest.entryCount,
      includeSecrets: result.manifest.includeSecrets
    }, null, 2));
    return;
  }
  if (opts.command === 'import') {
    const result = importSystemConfig({
      dbPath: opts.db,
      input: opts.input || opts._[0],
      yes: Boolean(opts.yes),
      replace: Boolean(opts.replace)
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }
  throw new Error(`unknown command: ${opts.command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  }
}
