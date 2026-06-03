// /api/comic-storyboards —— 异步生成漫画页分镜并在服务端保存项目。

import { readJsonBody, sendJson, bodyErrorStatus } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { enqueueComicStoryboard } from '../services/job-queue.js';

function statusFromError(error) {
  return error?.statusCode || bodyErrorStatus(error);
}

export async function handleComicStoryboardsRoute(req, res, pathname) {
  if (pathname !== '/api/comic-storyboards') return sendJson(res, 404, { error: 'not found' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  if (!req.session?.user) return sendJson(res, 401, { error: 'unauthorized' });

  const started = Date.now();
  let body = {};
  try {
    body = await readJsonBody(req);
    const job = await enqueueComicStoryboard(body, req.session.user);
    return sendJson(res, 202, {
      jobId: job.id,
      status: job.status,
      position: job.position,
      job
    });
  } catch (error) {
    logger.warn('comic.storyboard.enqueue_rejected', {
      durationMs: Date.now() - started,
      model: body?.model || body?.chatModel,
      code: error?.code,
      error: error.message || String(error)
    });
    return sendJson(res, statusFromError(error), {
      error: error.message || String(error),
      code: error?.code
    });
  }
}

export default handleComicStoryboardsRoute;
