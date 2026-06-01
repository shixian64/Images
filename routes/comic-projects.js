// /api/comic-projects —— 漫画项目的保存、列表、详情与删除。

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import {
  deleteComicProject,
  getComicProjectDetail,
  listComicProjects,
  updateComicProject,
  upsertComicProject
} from '../services/comic-projects.js';
import { record as auditRecord } from '../services/audit.js';

function statusForError(err) {
  const map = {
    unauthorized: 401,
    forbidden: 403,
    'comic project not found': 404,
    'failed to delete some project images': 500
  };
  return err.status || err.statusCode || map[err.message] || 400;
}

async function readBody(req, res) {
  try {
    return await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return undefined;
  }
}

export async function handleComicProjectsRoute(req, res, pathname, url) {
  const user = req.session?.user;
  if (!user) return sendJson(res, 401, { error: 'unauthorized' });
  const isAdmin = user.role === 'admin';

  if (pathname === '/api/comic-projects') {
    if (req.method === 'GET') {
      const limit = Math.min(500, Math.max(1, Number(url?.searchParams?.get('limit') || 200)));
      return sendJson(res, 200, listComicProjects({ userId: user.id, limit }));
    }
    if (req.method === 'POST') {
      const body = await readBody(req, res);
      if (body === undefined) return;
      try {
        const project = upsertComicProject(body || {}, { userId: user.id });
        auditRecord(req, 'comic_project.save', { type: 'comic_project', id: project.id }, {
          title: project.title,
          panelCount: project.panelCount
        });
        return sendJson(res, 200, { ok: true, project });
      } catch (err) {
        return sendJson(res, statusForError(err), { error: err.message || String(err), code: err.code });
      }
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  const detail = pathname.match(/^\/api\/comic-projects\/([^/]+)\/?$/);
  if (detail) {
    const id = decodeURIComponent(detail[1]);
    if (req.method === 'GET') {
      try {
        return sendJson(res, 200, await getComicProjectDetail(id, { userId: user.id, isAdmin }));
      } catch (err) {
        return sendJson(res, statusForError(err), { error: err.message || String(err), code: err.code });
      }
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readBody(req, res);
      if (body === undefined) return;
      try {
        const project = updateComicProject(id, body || {}, { userId: user.id, isAdmin });
        auditRecord(req, 'comic_project.update', { type: 'comic_project', id: project.id }, {
          title: project.title,
          panelCount: project.panelCount
        });
        return sendJson(res, 200, { ok: true, project });
      } catch (err) {
        return sendJson(res, statusForError(err), { error: err.message || String(err), code: err.code });
      }
    }
    if (req.method === 'DELETE') {
      try {
        const removed = await deleteComicProject(id, { userId: user.id, isAdmin });
        auditRecord(req, 'comic_project.delete', { type: 'comic_project', id }, {
          removedImages: removed.removed.length
        });
        return sendJson(res, 200, { ok: true, removed });
      } catch (err) {
        return sendJson(res, statusForError(err), {
          error: err.message || String(err),
          code: err.code,
          failed: err.failed || undefined
        });
      }
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  return sendJson(res, 404, { error: 'not found' });
}
