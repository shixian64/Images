import { generationJobs } from './db.js';
import { httpError } from '../utils/http.js';

export function checkQueueCapacity(userInfo, settings) {
  const pendingStatuses = ['queued', 'running'];
  const userPending = Number(generationJobs.countQueued({ userId: userInfo.id, statuses: pendingStatuses })) || 0;
  const globalPending = Number(generationJobs.countQueued({ statuses: pendingStatuses })) || 0;
  if (settings.max_pending_per_user && userPending >= settings.max_pending_per_user) {
    throw httpError(429, `你的待处理任务已达上限（${userPending}/${settings.max_pending_per_user}）`, 'user_queue_full');
  }
  if (settings.max_pending_global && globalPending >= settings.max_pending_global) {
    throw httpError(429, `全局待处理生成任务已满（${globalPending}/${settings.max_pending_global}）`, 'global_queue_full');
  }
}
