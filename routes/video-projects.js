// /api/video-projects —— 视频项目的保存、列表、详情、参考图上传与删除。

import {
  readJsonBody,
  readMultipartFormData,
  routeErrorStatus,
  sendJson,
  sendMethodNotAllowed
} from '../utils/http.js';
import {
  addVideoProjectReferences,
  deleteVideoProject,
  getVideoProjectDetail,
  listVideoProjects,
  updateVideoProject,
  upsertVideoProject
} from '../services/video-projects.js';

const VIDEO_PROJECT_ERROR_STATUSES = {
  unauthorized: 401,
  forbidden: 403,
  'video project not found': 404,
  'video project id required': 400
};

function routeError(err) {
  return routeErrorStatus(err, VIDEO_PROJECT_ERROR_STATUSES);
}

function parseLimit(url) {
  return Math.min(500, Math.max(1, Number(url?.searchParams?.get('limit')) || 200));
}

export async function handleVideoProjectsRoute(req, res, pathname, url) {
  const user = req.session?.user;
  if (!user) return sendJson(res, 401, { error: 'unauthorized' });

  if (pathname === '/api/video-projects' || pathname === '/api/video-projects/') {
    if (req.method === 'GET') {
      try {
        return sendJson(res, 200, listVideoProjects({ userId: user.id, limit: parseLimit(url) }));
      } catch (err) {
        return sendJson(res, routeError(err), { error: err.message || String(err), code: err.code });
      }
    }
    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const project = upsertVideoProject(body, { userId: user.id });
        return sendJson(res, 201, { project });
      } catch (err) {
        return sendJson(res, routeError(err), { error: err.message || String(err), code: err.code });
      }
    }
    return sendMethodNotAllowed(res, ['GET', 'POST']);
  }

  const refMatch = pathname.match(/^\/api\/video-projects\/([^/]+)\/references\/?$/);
  if (refMatch) {
    if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
    try {
      const form = await readMultipartFormData(req);
      const result = await addVideoProjectReferences(decodeURIComponent(refMatch[1]), form.files || [], {
        userId: user.id,
        isAdmin: user.role === 'admin'
      });
      return sendJson(res, 201, result);
    } catch (err) {
      return sendJson(res, routeError(err), {
        error: err.message || String(err),
        code: err.code,
        failed: err.failed || undefined
      });
    }
  }

  const detailMatch = pathname.match(/^\/api\/video-projects\/([^/]+)\/?$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    if (req.method === 'GET') {
      try {
        return sendJson(res, 200, await getVideoProjectDetail(id, {
          userId: user.id,
          isAdmin: user.role === 'admin'
        }));
      } catch (err) {
        return sendJson(res, routeError(err), { error: err.message || String(err), code: err.code });
      }
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req);
        const project = updateVideoProject(id, body, {
          userId: user.id,
          isAdmin: user.role === 'admin'
        });
        return sendJson(res, 200, { project });
      } catch (err) {
        return sendJson(res, routeError(err), { error: err.message || String(err), code: err.code });
      }
    }
    if (req.method === 'DELETE') {
      try {
        return sendJson(res, 200, await deleteVideoProject(id, {
          userId: user.id,
          isAdmin: user.role === 'admin'
        }));
      } catch (err) {
        return sendJson(res, routeError(err), {
          error: err.message || String(err),
          code: err.code,
          failed: err.failed || undefined
        });
      }
    }
    return sendMethodNotAllowed(res, ['GET', 'PUT', 'PATCH', 'DELETE']);
  }

  return sendJson(res, 404, { error: 'not found' });
}

