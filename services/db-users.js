// SQLite-backed user repository.
//
// This keeps user list filtering and CRUD operations out of the central db.js
// module while preserving the exported repository contract.

import { randomUUID } from 'node:crypto';
import { escapeSqlLike } from './db-sql.js';

function normalizeUserListOptions(input = {}) {
  const options = input || {};
  const hasPaging = options.page !== undefined
    || options.pageSize !== undefined
    || options.size !== undefined
    || options.limit !== undefined
    || options.offset !== undefined;
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(options.pageSize ?? options.size ?? options.limit) || 50)));
  const offset = options.offset === undefined
    ? (page - 1) * pageSize
    : Math.max(0, Math.floor(Number(options.offset) || 0));
  const role = String(options.role || '').trim();
  const status = String(options.status || '').trim();
  return {
    search: String(options.search || '').trim().toLowerCase().slice(0, 200),
    role: role === 'admin' || role === 'user' ? role : '',
    status: status === 'active' || status === 'disabled' ? status : '',
    page,
    pageSize,
    offset,
    hasPaging
  };
}

function userListFilterSql(options = {}) {
  const filters = normalizeUserListOptions(options);
  const clauses = [];
  const params = [];

  if (filters.role) {
    clauses.push('role = ?');
    params.push(filters.role);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    const like = `%${escapeSqlLike(filters.search)}%`;
    clauses.push(`(
      lower(username) LIKE ? ESCAPE '\\' OR
      lower(email) LIKE ? ESCAPE '\\' OR
      lower(id) LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like);
  }

  return {
    filters,
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export function createUserRepository({ open, nowIso }) {
  const repo = {
    count(options = {}) {
      const { where, params } = userListFilterSql(options);
      return open().prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...params).n;
    },
    create({ username, email, passwordHash, passwordSalt, role = 'user', signupIp = null, signupUserAgent = null }) {
      const db = open();
      const id = randomUUID();
      const now = nowIso();
      db.prepare(`
        INSERT INTO users
        (id, username, email, password_hash, password_salt, role, status, signup_ip, signup_user_agent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `).run(id, username, email, passwordHash, passwordSalt, role, signupIp || null, signupUserAgent || null, now, now);
      return repo.findById(id);
    },
    findById(id) {
      return open().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    },
    findByLogin(login) {
      return open().prepare(
        'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1'
      ).get(login, login) || null;
    },
    list(options = {}) {
      const { filters, where, params } = userListFilterSql(options);
      const pagingSql = filters.hasPaging ? 'LIMIT ? OFFSET ?' : '';
      const pagingParams = filters.hasPaging ? [filters.pageSize, filters.offset] : [];
      return open().prepare(`
        SELECT
          id, username, email, role, status, password_reset_required, avatar_url,
          signup_ip, signup_user_agent, created_at, updated_at, last_login_at
        FROM users
        ${where}
        ORDER BY created_at ASC
        ${pagingSql}
      `).all(...params, ...pagingParams);
    },
    countAdmins() {
      return open().prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"
      ).get().n;
    },
    updateRole(id, role) {
      open().prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), id);
      return repo.findById(id);
    },
    updateStatus(id, status) {
      open().prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
      return repo.findById(id);
    },
    updatePassword(id, passwordHash, passwordSalt, { resetRequired = false } = {}) {
      open().prepare(
        'UPDATE users SET password_hash = ?, password_salt = ?, password_reset_required = ?, updated_at = ? WHERE id = ?'
      ).run(passwordHash, passwordSalt, resetRequired ? 1 : 0, nowIso(), id);
    },
    updateProfile(id, { username, email, avatarUrl }) {
      const cur = repo.findById(id);
      if (!cur) return null;
      open().prepare(`
        UPDATE users SET username = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?
      `).run(
        username ?? cur.username,
        email ?? cur.email,
        avatarUrl ?? cur.avatar_url,
        nowIso(),
        id
      );
      return repo.findById(id);
    },
    touchLogin(id) {
      open().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), id);
    },
    delete(id) {
      open().prepare('DELETE FROM users WHERE id = ?').run(id);
    }
  };
  return repo;
}
