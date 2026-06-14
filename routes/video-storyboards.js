// /api/video-storyboards —— 异步生成视频关键帧规划并保存项目。

import { readJsonBody, routeErrorStatus, sendJson, sendMethodNotAllowed } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { enqueueVideoStoryboard } from '../services/job-queue.js';

export async function handleVideoStoryboardsRoute(req, res, pathname) {
  if (pathname !== '/api/video-storyboards') return sendJson(res, 404, { error: 'not found' });
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
  if (!req.session?.user) return sendJson(res, 401, { error: 'unauthorized' });

  const started = Date.now();
  let body = {};
  try {
    body = await readJsonBody(req);
    const job = await enqueueVideoStoryboard(body, req.session.user);
    return sendJson(res, 202, {
      jobId: job.id,
      status: job.status,
      position: job.position,
      job
    });
  } catch (error) {
    logger.warn('video.storyboard.enqueue_rejected', {
      durationMs: Date.now() - started,
      model: body?.model || body?.chatModel,
      code: error?.code,
      error: error.message || String(error)
    });
    return sendJson(res, routeErrorStatus(error), {
      error: error.message || String(error),
      code: error?.code
    });
  }
}

export default handleVideoStoryboardsRoute;
