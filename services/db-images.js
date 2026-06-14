// SQLite repository for generated image rows.

import { escapeSqlLike } from './db-sql.js';

function nextUtcDayStart(day, fallbackNowIso) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fallbackNowIso();
  const [, year, month, date] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(date) + 1)).toISOString();
}

function normalizeImageAdminListOptions(input = {}) {
  const options = input || {};
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize ?? options.size) || 50)));
  const sort = options.sort === 'bytes' ? 'bytes' : 'createdAt';
  const order = options.order === 'asc' ? 'asc' : 'desc';
  return {
    userId: String(options.userId || '').trim(),
    model: String(options.model || '').trim(),
    profileName: String(options.profileName || '').trim(),
    search: String(options.search || '').trim().toLowerCase().slice(0, 200),
    from: String(options.from || '').trim(),
    to: String(options.to || '').trim(),
    minBytes: Math.max(0, Number(options.minBytes) || 0),
    maxBytes: Math.max(0, Number(options.maxBytes) || 0),
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sort,
    order
  };
}

function imageAdminFilterSql(options = {}) {
  const filters = normalizeImageAdminListOptions(options);
  const clauses = [];
  const params = [];

  if (filters.userId) {
    clauses.push('user_id = ?');
    params.push(filters.userId);
  }
  if (filters.model) {
    clauses.push('COALESCE(model, \'\') = ?');
    params.push(filters.model);
  }
  if (filters.profileName) {
    clauses.push('COALESCE(profile_name, \'\') = ?');
    params.push(filters.profileName);
  }
  if (filters.from) {
    clauses.push('created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('created_at <= ?');
    params.push(filters.to);
  }
  if (filters.minBytes) {
    clauses.push('COALESCE(bytes, 0) >= ?');
    params.push(filters.minBytes);
  }
  if (filters.maxBytes) {
    clauses.push('COALESCE(bytes, 0) <= ?');
    params.push(filters.maxBytes);
  }
  if (filters.search) {
    const like = `%${escapeSqlLike(filters.search)}%`;
    clauses.push(`(
      lower(COALESCE(prompt, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(revised_prompt, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(filename, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(model, '')) LIKE ? ESCAPE '\\' OR
      lower(COALESCE(profile_name, '')) LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like, like, like);
  }

  return {
    filters,
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export function createImageRepository({ open, nowIso }) {
  const repo = {
    insert(meta) {
      const db = open();
      db.prepare(`
        INSERT INTO images
        (id, user_id, created_at, filename, path, mime_type, bytes,
         is_public, published_at,
         prompt, revised_prompt, model, size, quality, output_format,
         profile_name, source_type, thumbnail_path, preview_path,
         image_index, comic_project_id, comic_panel_index,
         video_project_id, video_frame_kind, video_frame_index, video_from_index, video_to_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.id,
        meta.userId,
        meta.createdAt,
        meta.filename,
        meta.path,
        meta.mimeType,
        meta.bytes,
        meta.isPublic ? 1 : 0,
        meta.isPublic ? (meta.publishedAt || meta.createdAt || nowIso()) : null,
        meta.prompt || null,
        meta.revisedPrompt || null,
        meta.model || null,
        meta.size || null,
        meta.quality || null,
        meta.outputFormat || null,
        meta.profileName || null,
        meta.sourceType || null,
        meta.thumbnailPath || null,
        meta.previewPath || null,
        Number.isFinite(meta.index) ? meta.index : null,
        meta.comicProjectId || null,
        Number.isFinite(meta.comicPageIndex)
          ? meta.comicPageIndex
          : (Number.isFinite(meta.comicPanelIndex) ? meta.comicPanelIndex : null),
        meta.videoProjectId || null,
        meta.videoFrameKind || null,
        Number.isFinite(meta.videoFrameIndex) ? meta.videoFrameIndex : null,
        Number.isFinite(meta.videoFromIndex) ? meta.videoFromIndex : null,
        Number.isFinite(meta.videoToIndex) ? meta.videoToIndex : null
      );
      return repo.findById(meta.id);
    },
    findById(id) {
      return open().prepare('SELECT * FROM images WHERE id = ?').get(id) || null;
    },
    findByPath(path) {
      return open().prepare('SELECT * FROM images WHERE path = ?').get(path) || null;
    },
    findByServedPath(path) {
      return open().prepare(`
        SELECT * FROM images
        WHERE path = ? OR thumbnail_path = ? OR preview_path = ?
        LIMIT 1
      `).get(path, path, path) || null;
    },
    listByUser(userId, limit = 500) {
      return open().prepare(`
        SELECT * FROM images
        WHERE user_id = ?
          AND (comic_project_id IS NULL OR comic_project_id = '')
          AND (video_project_id IS NULL OR video_project_id = '')
        ORDER BY created_at DESC LIMIT ?
      `).all(userId, limit);
    },
    listPublic(limit = 500) {
      return open().prepare(`
        SELECT i.*, u.username AS owner_username
        FROM images i
        LEFT JOIN users u ON u.id = i.user_id
        WHERE i.is_public = 1
        ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.created_at DESC
        LIMIT ?
      `).all(limit);
    },
    listAll(limit = 500) {
      return open().prepare(`
        SELECT * FROM images
        ORDER BY created_at DESC LIMIT ?
      `).all(limit);
    },
    listAllForMaintenance({ limit = 500, offset = 0 } = {}) {
      const safeLimit = Math.max(1, Math.floor(Number(limit) || 500));
      const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
      return open().prepare(`
        SELECT * FROM images
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(safeLimit, safeOffset);
    },
    listByComicProject(projectId, { limit = 500 } = {}) {
      return open().prepare(`
        SELECT * FROM images
        WHERE comic_project_id = ?
        ORDER BY COALESCE(comic_panel_index, image_index, 999999) ASC, created_at ASC
        LIMIT ?
      `).all(projectId, Math.max(1, Math.floor(Number(limit) || 500)));
    },
    listByVideoProject(projectId, { limit = 500, includeReferences = true } = {}) {
      const refSql = includeReferences ? '' : "AND COALESCE(video_frame_kind, '') != 'reference'";
      return open().prepare(`
        SELECT * FROM images
        WHERE video_project_id = ?
        ${refSql}
        ORDER BY
          CASE COALESCE(video_frame_kind, '')
            WHEN 'reference' THEN 0
            WHEN 'keyframe' THEN 1
            WHEN 'between' THEN 2
            ELSE 3
          END,
          COALESCE(video_frame_index, video_from_index, image_index, 999999) ASC,
          COALESCE(video_to_index, 999999) ASC,
          created_at ASC
        LIMIT ?
      `).all(projectId, Math.max(1, Math.floor(Number(limit) || 500)));
    },
    adminStats(today) {
      const db = open();
      const start = `${today}T00:00:00.000Z`;
      const end = nextUtcDayStart(today, nowIso);
      const summary = db.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(bytes), 0) AS totalBytes
        FROM images
      `).get();
      const todaySummary = db.prepare(`
        SELECT COUNT(*) AS savedToday
        FROM images
        WHERE created_at >= ? AND created_at < ?
      `).get(start, end);
      const topUsers = db.prepare(`
        SELECT
          COALESCE(user_id, 'unknown') AS userId,
          COUNT(*) AS count,
          COALESCE(SUM(bytes), 0) AS bytes
        FROM images
        GROUP BY COALESCE(user_id, 'unknown')
        ORDER BY bytes DESC
        LIMIT 10
      `).all();
      const topModels = db.prepare(`
        SELECT
          COALESCE(NULLIF(model, ''), 'unknown') AS model,
          COUNT(*) AS count
        FROM images
        GROUP BY COALESCE(NULLIF(model, ''), 'unknown')
        ORDER BY count DESC
        LIMIT 10
      `).all();
      return {
        total: Number(summary?.total) || 0,
        totalBytes: Number(summary?.totalBytes) || 0,
        savedToday: Number(todaySummary?.savedToday) || 0,
        topUsers: topUsers.map((row) => ({
          userId: row.userId,
          count: Number(row.count) || 0,
          bytes: Number(row.bytes) || 0
        })),
        topModels: topModels.map((row) => ({
          model: row.model,
          count: Number(row.count) || 0
        }))
      };
    },
    countAdmin(options = {}) {
      const { where, params } = imageAdminFilterSql(options);
      const row = open().prepare(`
        SELECT COUNT(*) AS n
        FROM images
        ${where}
      `).get(...params);
      return Number(row?.n) || 0;
    },
    listAdmin(options = {}) {
      const { filters, where, params } = imageAdminFilterSql(options);
      const sortColumn = filters.sort === 'bytes' ? 'bytes' : 'created_at';
      const sortDirection = filters.order === 'asc' ? 'ASC' : 'DESC';
      return open().prepare(`
        SELECT * FROM images
        ${where}
        ORDER BY ${sortColumn} ${sortDirection}, created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, filters.pageSize, filters.offset);
    },
    countByUser(userId) {
      return open().prepare(`
        SELECT COUNT(*) AS n FROM images
        WHERE user_id = ?
          AND (comic_project_id IS NULL OR comic_project_id = '')
          AND (video_project_id IS NULL OR video_project_id = '')
      `).get(userId)?.n || 0;
    },
    countPublic() {
      return open().prepare('SELECT COUNT(*) AS n FROM images WHERE is_public = 1').get()?.n || 0;
    },
    countPublicByUser(userId) {
      return open().prepare('SELECT COUNT(*) AS n FROM images WHERE user_id = ? AND is_public = 1').get(userId)?.n || 0;
    },
    setPublic(id, isPublic, publishedAt = null) {
      open().prepare(`
        UPDATE images
        SET is_public = ?, published_at = ?
        WHERE id = ?
      `).run(isPublic ? 1 : 0, isPublic ? (publishedAt || nowIso()) : null, id);
      return repo.findById(id);
    },
    deleteByUser(userId) {
      open().prepare('DELETE FROM images WHERE user_id = ?').run(userId);
    },
    deleteById(id) {
      open().prepare('DELETE FROM images WHERE id = ?').run(id);
    },
    statsByUser(userId) {
      return open().prepare(`
        SELECT
          COUNT(*)        AS count,
          COALESCE(SUM(bytes), 0) AS bytes,
          MAX(created_at) AS last_at
        FROM images WHERE user_id = ?
      `).get(userId) || { count: 0, bytes: 0, last_at: null };
    }
  };
  return repo;
}
