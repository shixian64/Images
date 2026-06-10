// SQLite repositories for small system-level tables.

export function createSystemSettingsRepository({ open, nowIso }) {
  return {
    get(key) {
      const row = open().prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    },
    set(key, value, updatedBy) {
      const db = open();
      const json = JSON.stringify(value);
      const cur = db.prepare('SELECT key FROM system_settings WHERE key = ?').get(key);
      if (cur) {
        db.prepare(
          'UPDATE system_settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?'
        ).run(json, nowIso(), updatedBy || null, key);
      } else {
        db.prepare(
          'INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
        ).run(key, json, nowIso(), updatedBy || null);
      }
    },
    delete(key) {
      return open().prepare('DELETE FROM system_settings WHERE key = ?').run(key).changes || 0;
    }
  };
}

export function createSchemaMigrationRepository({ open }) {
  return {
    list() {
      return open().prepare(`
        SELECT version, name, applied_at
        FROM schema_migrations
        ORDER BY version ASC
      `).all();
    }
  };
}
