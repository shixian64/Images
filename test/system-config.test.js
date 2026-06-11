import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  exportSystemConfig,
  importSystemConfig,
  SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS
} from '../scripts/system-config.js';

const SYSTEM_SETTINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
`;

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'image-studio-system-config-'));
}

function seedSettings(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(SYSTEM_SETTINGS_SCHEMA);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run('interfaces.default', JSON.stringify({
      enabled: true,
      image: { apiKey: 'sk-image-secret-123456', baseUrl: 'https://api.example.com' },
      chat: { apiKey: 'sk-chat-secret-123456', baseUrl: 'https://api.example.com' }
    }), '2026-06-09T00:00:00.000Z', 'admin');
    stmt.run('queue.settings', JSON.stringify({
      enabled: true,
      max_pending_global: 20,
      max_pending_per_user: 3
    }), '2026-06-09T00:01:00.000Z', 'admin');
  } finally {
    db.close();
  }
}

function readSetting(dbPath, key) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  } finally {
    db.close();
  }
}

test('system config export redacts secrets by default and is audit-readable', () => {
  const root = tempRoot();
  try {
    const dbPath = join(root, 'generated', 'app.db');
    seedSettings(dbPath);

    const result = exportSystemConfig({ dbPath, output: join(root, 'exports'), name: 'redacted.json' });

    assert.ok(existsSync(result.path));
    assert.equal(result.manifest.includeSecrets, false);
    assert.equal(result.manifest.entryCount, 2);
    const interfaces = result.manifest.entries.find((entry) => entry.key === 'interfaces.default');
    assert.equal(interfaces.value.image.apiKey, 'sk-i****3456');
    assert.equal(interfaces.value.chat.apiKey, 'sk-c****3456');
    assert.equal(interfaces.value.image.baseUrl, 'https://api.example.com');
    assert.throws(
      () => importSystemConfig({ dbPath: join(root, 'target-redacted.db'), input: result.path, yes: true }),
      /redacted system config export/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('system config import restores an unredacted export with confirmation', () => {
  const root = tempRoot();
  try {
    const dbPath = join(root, 'generated', 'app.db');
    const targetDb = join(root, 'target', 'app.db');
    seedSettings(dbPath);
    seedSettings(targetDb);

    const sourceDb = new DatabaseSync(targetDb);
    try {
      sourceDb.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
      `).run('old.only', JSON.stringify({ keep: false }), '2026-06-08T00:00:00.000Z', 'old');
    } finally {
      sourceDb.close();
    }

    const exported = exportSystemConfig({
      dbPath,
      output: join(root, 'exports', 'full.json'),
      includeSecrets: true
    });

    assert.throws(
      () => importSystemConfig({ dbPath: targetDb, input: exported.path }),
      /--yes/
    );

    const imported = importSystemConfig({ dbPath: targetDb, input: exported.path, yes: true, replace: true });

    assert.equal(imported.imported, 2);
    assert.equal(imported.replaced, true);
    const interfaces = readSetting(targetDb, 'interfaces.default');
    assert.equal(interfaces.image.apiKey, 'sk-image-secret-123456');
    assert.equal(interfaces.chat.apiKey, 'sk-chat-secret-123456');
    assert.equal(readSetting(targetDb, 'old.only'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('redacted system config export caps oversized values without touching restorable exports', () => {
  const root = tempRoot();
  try {
    const dbPath = join(root, 'generated', 'app.db');
    seedSettings(dbPath);

    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
      `).run('large.review.only', JSON.stringify({
        apiKey: 'sk-large-secret-123456',
        prompt: `large-start ${'x'.repeat(SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS + 5000)} large-end`
      }), '2026-06-09T00:02:00.000Z', 'admin');
    } finally {
      db.close();
    }

    const redacted = exportSystemConfig({ dbPath, output: join(root, 'exports'), name: 'redacted-large.json' });
    const large = redacted.manifest.entries.find((entry) => entry.key === 'large.review.only');
    assert.equal(large.valueTruncated, true);
    assert.equal(large.value.truncated, true);
    assert.ok(large.value.originalJsonChars > SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS);
    assert.ok(JSON.stringify(large.value).length <= SYSTEM_CONFIG_REDACTED_VALUE_MAX_JSON_CHARS);
    assert.doesNotMatch(JSON.stringify(large.value), /sk-large-secret-123456/);
    assert.doesNotMatch(readFileSync(redacted.path, 'utf8'), /large-end/);

    const full = exportSystemConfig({
      dbPath,
      output: join(root, 'exports'),
      name: 'full-large.json',
      includeSecrets: true
    });
    const fullLarge = full.manifest.entries.find((entry) => entry.key === 'large.review.only');
    assert.equal(fullLarge.valueTruncated, undefined);
    assert.match(fullLarge.value.prompt, /large-end$/);
    assert.equal(fullLarge.value.apiKey, 'sk-large-secret-123456');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
