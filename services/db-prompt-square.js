// Prompt Square SQLite repository.
//
// Search/filter SQL and CRUD logic live here to keep services/db.js focused on
// connection setup, schema migrations, and repository wiring.

import { randomUUID } from 'node:crypto';
import { escapeSqlLike } from './db-sql.js';

function normalizePromptSquareListOptions(input = {}) {
  const options = typeof input === 'number' ? { limit: input } : (input || {});
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 200)));
  const search = String(options.search || '').trim().toLowerCase().slice(0, 200);
  const tag = String(options.tag || '').trim();
  return {
    limit,
    search,
    tag: tag && tag !== 'all' ? tag.slice(0, 64) : '',
    mine: options.mine === true,
    userId: String(options.userId || '').trim()
  };
}

function quoteFtsPhrase(value) {
  const phrase = String(value || '').trim().replace(/\s+/g, ' ');
  if (phrase.length < 3) return '';
  return `"${phrase.replace(/"/g, '""')}"`;
}

function promptSquareSearchClause(search) {
  const like = `%${escapeSqlLike(search)}%`;
  const phrase = quoteFtsPhrase(search);
  if (phrase) {
    return {
      clause: `(
        p.id IN (
          SELECT id
          FROM prompt_square_fts
          WHERE prompt_square_fts MATCH ?
        ) OR
        lower(COALESCE(u.username, '')) LIKE ? ESCAPE '\\'
      )`,
      params: [phrase, like]
    };
  }
  return {
    clause: `(
      p.id IN (
        SELECT id
        FROM prompt_square_fts
        WHERE title LIKE ? ESCAPE '\\' OR
              prompt LIKE ? ESCAPE '\\' OR
              tags LIKE ? ESCAPE '\\' OR
              source LIKE ? ESCAPE '\\'
      ) OR
      lower(COALESCE(u.username, '')) LIKE ? ESCAPE '\\'
    )`,
    params: [like, like, like, like, like]
  };
}

function promptSquareFilterSql(options = {}) {
  const filters = normalizePromptSquareListOptions(options);
  const clauses = [];
  const params = [];

  if (filters.mine) {
    clauses.push('p.user_id = ?');
    params.push(filters.userId || '');
  }
  if (filters.tag) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM json_each(CASE WHEN json_valid(p.tags) THEN p.tags ELSE '[]' END) AS tag
      WHERE tag.type = 'text' AND tag.value = ?
    )`);
    params.push(filters.tag);
  }
  if (filters.search) {
    const search = promptSquareSearchClause(filters.search);
    clauses.push(search.clause);
    params.push(...search.params);
  }

  return {
    filters,
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export function createPromptSquareRepository({ open, nowIso }) {
  const repo = {
    findById(id) {
      return open().prepare(`
        SELECT
          p.*,
          u.username AS owner_username,
          u.avatar_url AS owner_avatar_url
        FROM prompt_square p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
      `).get(id) || null;
    },
    findByUserSourcePrompt(userId, sourcePromptId) {
      if (!sourcePromptId) return null;
      return open().prepare(`
        SELECT
          p.*,
          u.username AS owner_username,
          u.avatar_url AS owner_avatar_url
        FROM prompt_square p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.user_id = ? AND p.source_prompt_id = ?
        ORDER BY p.updated_at DESC
        LIMIT 1
      `).get(userId, sourcePromptId) || null;
    },
    findBySourcePrompt(sourcePromptId) {
      if (!sourcePromptId) return null;
      return open().prepare(`
        SELECT
          p.*,
          u.username AS owner_username,
          u.avatar_url AS owner_avatar_url
        FROM prompt_square p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.source_prompt_id = ?
        ORDER BY p.updated_at DESC
        LIMIT 1
      `).get(sourcePromptId) || null;
    },
    count(options = {}) {
      const { where, params } = promptSquareFilterSql(options);
      const row = open().prepare(`
        SELECT COUNT(*) AS count
        FROM prompt_square p
        LEFT JOIN users u ON u.id = p.user_id
        ${where}
      `).get(...params);
      return Number(row?.count) || 0;
    },
    list(options = 200) {
      const { filters, where, params } = promptSquareFilterSql(options);
      return open().prepare(`
        SELECT
          p.*,
          u.username AS owner_username,
          u.avatar_url AS owner_avatar_url
        FROM prompt_square p
        LEFT JOIN users u ON u.id = p.user_id
        ${where}
        ORDER BY p.published_at DESC
        LIMIT ?
      `).all(...params, filters.limit);
    },
    upsert({ userId, sourcePromptId, title, prompt, tagsJson, source, metaJson }) {
      const db = open();
      const now = nowIso();
      const existing = userId
        ? repo.findByUserSourcePrompt(userId, sourcePromptId)
        : repo.findBySourcePrompt(sourcePromptId);
      if (existing) {
        db.prepare(`
          UPDATE prompt_square
          SET title = ?, prompt = ?, tags = ?, source = ?, meta = ?, updated_at = ?, published_at = ?
          WHERE id = ?
        `).run(
          title,
          prompt,
          tagsJson || '[]',
          source || 'manual',
          metaJson || '{}',
          now,
          now,
          existing.id
        );
        return repo.findById(existing.id);
      }

      const id = randomUUID();
      db.prepare(`
        INSERT INTO prompt_square
        (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        id,
        userId,
        sourcePromptId || null,
        title,
        prompt,
        tagsJson || '[]',
        source || 'manual',
        metaJson || '{}',
        now,
        now,
        now
      );
      return repo.findById(id);
    },
    deleteById(id) {
      return open().prepare('DELETE FROM prompt_square WHERE id = ?').run(id).changes;
    },
    bumpUseCount(id) {
      open().prepare('UPDATE prompt_square SET use_count = use_count + 1 WHERE id = ?').run(id);
      return repo.findById(id);
    }
  };
  return repo;
}
