import { compactJsonValueForBudget } from '../utils/json-budget.js';

export const QUEUE_EVENT_PAYLOAD_MAX_JSON_CHARS = 100_000;

function toEventId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
}

function eventPayloadJson(payload = {}) {
  const json = JSON.stringify(payload || {});
  if (!json || json.length <= QUEUE_EVENT_PAYLOAD_MAX_JSON_CHARS) return json || '{}';
  return JSON.stringify(compactJsonValueForBudget(json, {
    maxJsonChars: QUEUE_EVENT_PAYLOAD_MAX_JSON_CHARS,
    alreadyJson: true
  }));
}

function parseQueueEvent(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch {
    payload = {};
  }
  return {
    id: Number(row.id) || 0,
    scope: row.scope || '',
    event: row.event || 'message',
    userId: row.user_id || '',
    jobId: row.job_id || '',
    payload,
    createdAt: Number(row.created_at) || null
  };
}

export function createQueueEventRepository({ open }) {
  const repo = {
    create({ scope = 'global', event = 'message', userId = '', jobId = '', payload = {}, createdAt = Date.now() } = {}) {
      const db = open();
      const result = db.prepare(`
        INSERT INTO queue_events (scope, event, user_id, job_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(scope || 'global'),
        String(event || 'message'),
        userId || null,
        jobId || null,
        eventPayloadJson(payload),
        Math.max(0, Math.floor(Number(createdAt) || Date.now()))
      );
      return repo.findById(Number(result.lastInsertRowid) || 0);
    },
    findById(id) {
      const row = open().prepare('SELECT * FROM queue_events WHERE id = ?').get(toEventId(id));
      return parseQueueEvent(row);
    },
    latestId() {
      return Number(open().prepare('SELECT MAX(id) AS id FROM queue_events').get()?.id) || 0;
    },
    listForUser(userId, { afterId = 0, limit = 200 } = {}) {
      return open().prepare(`
        SELECT *
        FROM queue_events
        WHERE id > ?
          AND (
            (scope = 'user' AND user_id = ?)
            OR scope = 'global'
          )
        ORDER BY id ASC
        LIMIT ?
      `).all(
        toEventId(afterId),
        String(userId || ''),
        Math.max(1, Math.floor(Number(limit) || 200))
      ).map(parseQueueEvent);
    },
    listForJob(jobId, { afterId = 0, limit = 200 } = {}) {
      return open().prepare(`
        SELECT *
        FROM queue_events
        WHERE id > ?
          AND scope = 'user'
          AND job_id = ?
        ORDER BY id ASC
        LIMIT ?
      `).all(
        toEventId(afterId),
        String(jobId || ''),
        Math.max(1, Math.floor(Number(limit) || 200))
      ).map(parseQueueEvent);
    },
    listForAdmin({ afterId = 0, limit = 200 } = {}) {
      return open().prepare(`
        SELECT *
        FROM queue_events
        WHERE id > ?
          AND scope IN ('admin', 'global')
        ORDER BY id ASC
        LIMIT ?
      `).all(
        toEventId(afterId),
        Math.max(1, Math.floor(Number(limit) || 200))
      ).map(parseQueueEvent);
    },
    pruneToMaxRows(maxRows = 5000) {
      const max = Math.max(1, Math.floor(Number(maxRows) || 5000));
      const cutoff = open().prepare(`
        SELECT id
        FROM queue_events
        ORDER BY id DESC
        LIMIT 1 OFFSET ?
      `).get(max)?.id;
      if (!cutoff) return 0;
      return open().prepare('DELETE FROM queue_events WHERE id <= ?').run(Number(cutoff)).changes || 0;
    }
  };
  return repo;
}
