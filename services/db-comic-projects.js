// SQLite repository for comic project rows.

import { randomUUID } from 'node:crypto';

function parseJsonObject(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseComicProject(row) {
  if (!row) return null;
  return {
    ...row,
    panel_count: Number(row.panel_count) || 0,
    use_context: Number(row.use_context) ? 1 : 0,
    storyboard: parseJsonObject(row.storyboard_json, {}),
    image_count: Number(row.image_count) || 0,
    thumbnail_path: row.thumbnail_path || null
  };
}

export function createComicProjectRepository({ open, nowIso }) {
  const repo = {
    upsert(meta = {}) {
      const db = open();
      const now = nowIso();
      const id = meta.id || randomUUID();
      const existing = repo.findById(id);
      const storyboardJson = JSON.stringify(
        meta.storyboard && typeof meta.storyboard === 'object' ? meta.storyboard : {}
      );
      const values = {
        userId: meta.userId,
        title: String(meta.title || '').trim() || '未命名漫画',
        story: String(meta.story || ''),
        styleId: meta.styleId || null,
        styleLabel: meta.styleLabel || null,
        panelCount: Math.max(0, Math.floor(Number(meta.panelCount) || 0)),
        chatModel: meta.chatModel || null,
        imageModel: meta.imageModel || null,
        size: meta.size || null,
        quality: meta.quality || null,
        outputFormat: meta.outputFormat || null,
        useContext: meta.useContext === false ? 0 : 1,
        status: meta.status || 'draft',
        storyboardJson
      };
      if (!values.userId) throw new Error('comic project requires userId');

      if (existing) {
        db.prepare(`
          UPDATE comic_projects
          SET title = ?, story = ?, style_id = ?, style_label = ?, panel_count = ?,
              chat_model = ?, image_model = ?, size = ?, quality = ?, output_format = ?,
              use_context = ?, status = ?, storyboard_json = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(
          values.title,
          values.story,
          values.styleId,
          values.styleLabel,
          values.panelCount,
          values.chatModel,
          values.imageModel,
          values.size,
          values.quality,
          values.outputFormat,
          values.useContext,
          values.status,
          values.storyboardJson,
          now,
          id,
          values.userId
        );
        return repo.findById(id);
      }

      db.prepare(`
        INSERT INTO comic_projects
        (id, user_id, title, story, style_id, style_label, panel_count,
         chat_model, image_model, size, quality, output_format, use_context,
         status, storyboard_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        values.userId,
        values.title,
        values.story,
        values.styleId,
        values.styleLabel,
        values.panelCount,
        values.chatModel,
        values.imageModel,
        values.size,
        values.quality,
        values.outputFormat,
        values.useContext,
        values.status,
        values.storyboardJson,
        now,
        now
      );
      return repo.findById(id);
    },
    findById(id) {
      return parseComicProject(open().prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM images i WHERE i.comic_project_id = p.id) AS image_count,
          (SELECT i.path FROM images i WHERE i.comic_project_id = p.id
            ORDER BY COALESCE(i.comic_panel_index, i.image_index, 999999) ASC, i.created_at ASC LIMIT 1) AS thumbnail_path
        FROM comic_projects p
        WHERE p.id = ?
      `).get(id));
    },
    listByUser(userId, limit = 200) {
      return open().prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM images i WHERE i.comic_project_id = p.id) AS image_count,
          (SELECT i.path FROM images i WHERE i.comic_project_id = p.id
            ORDER BY COALESCE(i.comic_panel_index, i.image_index, 999999) ASC, i.created_at ASC LIMIT 1) AS thumbnail_path
        FROM comic_projects p
        WHERE p.user_id = ?
        ORDER BY p.updated_at DESC
        LIMIT ?
      `).all(userId, Math.max(1, Math.floor(Number(limit) || 200))).map(parseComicProject);
    },
    countByUser(userId) {
      return open().prepare('SELECT COUNT(*) AS n FROM comic_projects WHERE user_id = ?').get(userId)?.n || 0;
    },
    deleteById(id) {
      return open().prepare('DELETE FROM comic_projects WHERE id = ?').run(id).changes || 0;
    },
    touch(id, { status = null } = {}) {
      if (!id) return null;
      if (status) {
        open().prepare('UPDATE comic_projects SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
      } else {
        open().prepare('UPDATE comic_projects SET updated_at = ? WHERE id = ?').run(nowIso(), id);
      }
      return repo.findById(id);
    }
  };
  return repo;
}
