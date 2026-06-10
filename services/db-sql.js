// Small SQL helpers shared by SQLite repository modules.

export function escapeSqlLike(value) {
  return String(value || '').replace(/[\\%_]/g, (char) => `\\${char}`);
}
