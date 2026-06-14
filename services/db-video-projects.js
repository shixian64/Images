// SQLite repository for video project rows.

import { randomUUID } from 'node:crypto';

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function parseVideoProject(row) {
  if (!row) return null;
  return {
    ...row,
    keyframe_count: Number(row.keyframe_count) || 0,
    use_references: Number(row.use_references) ? 1 : 0,
    config: parseJson(row.config_json, {}),
    storyboard: parseJson(row.storyboard_json, {}),
    references: parseJson(row.reference_json, []),
    image_count: Number(row.image_count) || 0,
    thumbnail_path: row.thumbnail_path || null
  };
}

const KEYFRAME_IMAGE_COUNT_WHERE = `
  i.video_project_id = p.id
  AND (
    COALESCE(i.video_frame_kind, '') = 'keyframe'
    OR (COALESCE(i.video_frame_kind, '') = '' AND i.video_frame_index IS NOT NULL)
  )
`;

export function createVideoProjectRepository({ open, nowIso }) {
  const repo = {
    upsert(meta = {}) {
      const db = open();
      const now = nowIso();
      const id = meta.id || randomUUID();
      const existing = repo.findById(id);
      const values = {
        userId: meta.userId,
        title: String(meta.title || '').trim() || '未命名视频',
        prompt: String(meta.prompt || ''),
        keyframeCount: Math.max(0, Math.floor(Number(meta.keyframeCount) || 0)),
        chatModel: meta.chatModel || null,
        imageModel: meta.imageModel || null,
        size: meta.size || null,
        quality: meta.quality || null,
        outputFormat: meta.outputFormat || null,
        useReferences: meta.useReferences === false ? 0 : 1,
        status: meta.status || 'draft',
        configJson: JSON.stringify(meta.config && typeof meta.config === 'object' ? meta.config : {}),
        storyboardJson: JSON.stringify(meta.storyboard && typeof meta.storyboard === 'object' ? meta.storyboard : {}),
        referenceJson: JSON.stringify(Array.isArray(meta.references) ? meta.references : [])
      };
      if (!values.userId) throw new Error('video project requires userId');

      if (existing) {
        db.prepare(`
          UPDATE video_projects
          SET title = ?, prompt = ?, keyframe_count = ?,
              chat_model = ?, image_model = ?, size = ?, quality = ?, output_format = ?,
              use_references = ?, status = ?, config_json = ?, storyboard_json = ?,
              reference_json = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(
          values.title,
          values.prompt,
          values.keyframeCount,
          values.chatModel,
          values.imageModel,
          values.size,
          values.quality,
          values.outputFormat,
          values.useReferences,
          values.status,
          values.configJson,
          values.storyboardJson,
          values.referenceJson,
          now,
          id,
          values.userId
        );
        return repo.findById(id);
      }

      db.prepare(`
        INSERT INTO video_projects
        (id, user_id, title, prompt, keyframe_count,
         chat_model, image_model, size, quality, output_format, use_references,
         status, config_json, storyboard_json, reference_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        values.userId,
        values.title,
        values.prompt,
        values.keyframeCount,
        values.chatModel,
        values.imageModel,
        values.size,
        values.quality,
        values.outputFormat,
        values.useReferences,
        values.status,
        values.configJson,
        values.storyboardJson,
        values.referenceJson,
        now,
        now
      );
      return repo.findById(id);
    },
    findById(id) {
      return parseVideoProject(open().prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM images i
            WHERE ${KEYFRAME_IMAGE_COUNT_WHERE}) AS image_count,
          (SELECT i.path FROM images i
            WHERE i.video_project_id = p.id AND COALESCE(i.video_frame_kind, '') != 'reference'
            ORDER BY
              CASE COALESCE(i.video_frame_kind, '')
                WHEN 'keyframe' THEN 0
                WHEN 'between' THEN 1
                ELSE 2
              END,
              COALESCE(i.video_frame_index, i.video_from_index, i.image_index, 999999) ASC,
              i.created_at ASC
            LIMIT 1) AS thumbnail_path
        FROM video_projects p
        WHERE p.id = ?
      `).get(id));
    },
    listByUser(userId, limit = 200) {
      return open().prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM images i
            WHERE ${KEYFRAME_IMAGE_COUNT_WHERE}) AS image_count,
          (SELECT i.path FROM images i
            WHERE i.video_project_id = p.id AND COALESCE(i.video_frame_kind, '') != 'reference'
            ORDER BY
              CASE COALESCE(i.video_frame_kind, '')
                WHEN 'keyframe' THEN 0
                WHEN 'between' THEN 1
                ELSE 2
              END,
              COALESCE(i.video_frame_index, i.video_from_index, i.image_index, 999999) ASC,
              i.created_at ASC
            LIMIT 1) AS thumbnail_path
        FROM video_projects p
        WHERE p.user_id = ?
        ORDER BY p.updated_at DESC
        LIMIT ?
      `).all(userId, Math.max(1, Math.floor(Number(limit) || 200))).map(parseVideoProject);
    },
    countByUser(userId) {
      return open().prepare('SELECT COUNT(*) AS n FROM video_projects WHERE user_id = ?').get(userId)?.n || 0;
    },
    deleteById(id) {
      return open().prepare('DELETE FROM video_projects WHERE id = ?').run(id).changes || 0;
    },
    touch(id, { status = null } = {}) {
      if (!id) return null;
      if (status) {
        open().prepare('UPDATE video_projects SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
      } else {
        open().prepare('UPDATE video_projects SET updated_at = ? WHERE id = ?').run(nowIso(), id);
      }
      return repo.findById(id);
    }
  };
  return repo;
}
