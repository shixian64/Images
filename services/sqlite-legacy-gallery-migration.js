// Migration helper for importing legacy generated/gallery.json rows.

import { existsSync, readFileSync, renameSync } from 'node:fs';
import { logger } from '../utils/logger.js';

export function migrateLegacyGallery(db, { legacyGallery, legacyGalleryDone, nowIso }) {
  if (!existsSync(legacyGallery)) return;
  const adminRow = db.prepare(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
  ).get();
  if (!adminRow) {
    logger.info('migration.deferred', { reason: 'no admin yet, gallery.json kept' });
    return;
  }
  let parsed;
  try {
    const raw = readFileSync(legacyGallery, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn('migration.gallery.read_failed', { error: err.message });
    return;
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO images
    (id, user_id, created_at, filename, path, mime_type, bytes,
     is_public, published_at,
     prompt, revised_prompt, model, size, quality, output_format,
     profile_name, source_type, image_index, comic_project_id, comic_panel_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const it of items) {
    if (!it?.id || !it?.path) continue;
    const res = stmt.run(
      it.id,
      adminRow.id,
      it.createdAt || nowIso(),
      it.filename || '',
      it.path,
      it.mimeType || 'application/octet-stream',
      Number(it.bytes) || 0,
      it.isPublic || it.public ? 1 : 0,
      it.isPublic || it.public ? (it.publishedAt || it.createdAt || nowIso()) : null,
      it.prompt || null,
      it.revisedPrompt || null,
      it.model || null,
      it.size || null,
      it.quality || null,
      it.outputFormat || null,
      it.profileName || null,
      it.sourceType || null,
      Number.isFinite(it.index) ? it.index : null,
      null,
      null
    );
    if (res.changes) inserted += 1;
  }
  try {
    renameSync(legacyGallery, legacyGalleryDone);
  } catch (err) {
    logger.warn('migration.gallery.rename_failed', { error: err.message });
  }
  logger.info('migration.gallery.done', { items: items.length, inserted });
}