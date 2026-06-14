// 视频项目：保存提示词、全局配置、关键帧规划、参考图和项目内图片集合。

import { generationJobs, images as imagesTable, videoProjects } from './db.js';
import { galleryFileUrl, listVideoProjectImages, removeImage, saveUploadedVideoReference } from './gallery-store.js';
import { cancelJob } from './job-queue.js';
import {
  FAILED_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  isActiveJobStatus
} from './queue-status.js';
import {
  VIDEO_KEYFRAME_LIMITS,
  clampVideoKeyframeCount,
  normalizeVideoStoryboard
} from '../shared/video-workflow.js';
import { truncateJsonText } from '../utils/json-budget.js';

export const VIDEO_PROJECT_LIST_PROMPT_MAX_CHARS = 800;
export const VIDEO_PROJECT_LIST_STORYBOARD_MAX_KEYFRAMES = 6;

const VIDEO_PROJECT_STATUSES = new Set([
  'draft',
  'storyboard',
  'generating',
  'completed',
  'stopped',
  'failed'
]);

function cleanString(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanModel(value) {
  return cleanString(value, 120);
}

function cleanStatus(value) {
  const status = cleanString(value, 40) || 'draft';
  if (!VIDEO_PROJECT_STATUSES.has(status)) {
    const err = new Error('invalid video project status');
    err.code = 'invalid_status';
    throw err;
  }
  return status;
}

function rawKeyframes(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  if (Array.isArray(value.keyframes)) return value.keyframes;
  if (Array.isArray(value.keyframe_plan)) return value.keyframe_plan;
  return [];
}

function cleanReferences(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => ({
      id: cleanString(item?.id ?? item?.galleryId, 120),
      label: cleanString(item?.label ?? item?.filename ?? `参考图 ${index + 1}`, 120),
      url: cleanString(item?.url ?? item?.previewUrl ?? item?.thumbnailUrl, 500),
      thumbnailUrl: cleanString(item?.thumbnailUrl ?? item?.previewUrl ?? item?.url, 500),
      source: cleanString(item?.source ?? 'upload', 40)
    }))
    .filter((item) => item.id);
}

function cleanConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    style: cleanString(source.style, 2000),
    motion: cleanString(source.motion, 2000),
    negative: cleanString(source.negative, 2000),
    notes: cleanString(source.notes, 2000)
  };
}

function cleanStoryboard(value, { prompt = '', keyframeCount = 0, referenceCount = 0 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const keys = rawKeyframes(value);
  if (!keys.length) return {};
  return normalizeVideoStoryboard(value, {
    prompt,
    keyframeLimit: keyframeCount || keys.length,
    maxReferenceCount: referenceCount
  });
}

function projectTitle(body = {}) {
  const explicit = cleanString(body.title, 120);
  if (explicit) return explicit;
  const storyboardTitle = cleanString(body.storyboard?.title, 120);
  if (storyboardTitle) return storyboardTitle;
  const prompt = cleanString(body.prompt, 120);
  return prompt ? prompt.slice(0, 40) : '未命名视频';
}

function normalizeProjectInput(body = {}, { userId, id = '', existingReferences = [] } = {}) {
  const prompt = cleanString(body.prompt, 20000);
  const references = body.references === undefined
    ? cleanReferences(existingReferences)
    : cleanReferences(body.references);
  const rawCount = Math.floor(Number(body.keyframeCount ?? body.keyframeLimit ?? rawKeyframes(body.storyboard).length) || 0);
  const keyframeLimit = rawCount ? clampVideoKeyframeCount(rawCount) : 0;
  const storyboard = cleanStoryboard(body.storyboard, {
    prompt,
    keyframeCount: keyframeLimit || rawKeyframes(body.storyboard).length || VIDEO_KEYFRAME_LIMITS.default,
    referenceCount: references.length
  });
  const keyframeCount = Array.isArray(storyboard.keyframes)
    ? storyboard.keyframes.length
    : Math.max(0, keyframeLimit);

  return {
    id: cleanString(id || body.id, 80) || undefined,
    userId,
    title: projectTitle({ ...body, storyboard }),
    prompt,
    keyframeCount,
    chatModel: cleanModel(body.chatModel),
    imageModel: cleanModel(body.imageModel),
    size: cleanString(body.size, 80),
    quality: cleanString(body.quality, 80),
    outputFormat: cleanString(body.outputFormat ?? body.output_format, 80),
    useReferences: body.useReferences !== false,
    status: cleanStatus(body.status),
    config: cleanConfig(body.config),
    storyboard,
    references
  };
}

function textPreview(value, maxChars) {
  const text = String(value ?? '');
  return {
    value: truncateJsonText(text, maxChars),
    length: text.length,
    truncated: text.length > maxChars
  };
}

function summarizeStoryboardForList(storyboard = {}) {
  if (!storyboard || typeof storyboard !== 'object' || Array.isArray(storyboard)) {
    return { storyboard: {}, storyboardLength: 2, storyboardTruncated: false, storyboardKeyframeCount: 0 };
  }
  const keyframes = Array.isArray(storyboard.keyframes) ? storyboard.keyframes : [];
  const sourceJson = JSON.stringify(storyboard);
  const summarizedKeyframes = keyframes
    .slice(0, VIDEO_PROJECT_LIST_STORYBOARD_MAX_KEYFRAMES)
    .map((frame = {}) => ({
      beat: truncateJsonText(frame.beat ?? '', 180),
      imagePrompt: truncateJsonText(frame.imagePrompt ?? frame.image_prompt ?? '', 180),
      referenceIndexes: Array.isArray(frame.referenceIndexes) ? frame.referenceIndexes.slice(0, 8) : []
    }));
  const summary = {
    title: truncateJsonText(storyboard.title ?? '', 120),
    keyframeCount: Number(storyboard.keyframeCount ?? storyboard.keyframe_count) || keyframes.length,
    keyframes: summarizedKeyframes
  };
  return {
    storyboard: summary,
    storyboardLength: sourceJson.length,
    storyboardTruncated: keyframes.length > summarizedKeyframes.length || JSON.stringify(summary).length < sourceJson.length,
    storyboardKeyframeCount: keyframes.length
  };
}

function countJobsByStatus(jobs = []) {
  const byStatus = {};
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const status = String(job?.status || '');
    if (!status) continue;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return byStatus;
}

function videoImageKeyframeIndex(image = {}) {
  if (image.videoFrameKind && image.videoFrameKind !== 'keyframe') return null;
  const n = Number(image.videoFrameIndex ?? image.video_frame_index);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function uniqueCompletedKeyframeCount(images = [], fallback = 0) {
  if (!Array.isArray(images) || !images.length) return Math.max(0, Number(fallback) || 0);
  const keys = new Set();
  let unindexed = 0;
  for (const image of images) {
    if ((image.videoFrameKind ?? image.video_frame_kind) === 'reference') continue;
    if ((image.videoFrameKind ?? image.video_frame_kind) === 'between') continue;
    const index = videoImageKeyframeIndex(image);
    if (index) keys.add(index);
    else unindexed += 1;
  }
  return keys.size + unindexed;
}

function summarizeVideoProjectProgress(project = {}, { images = null, jobs = [] } = {}) {
  const total = Math.max(0, Number(project.keyframeCount ?? project.keyframe_count) || 0);
  const imageFallback = Number(project.imageCount ?? project.image_count) || 0;
  const keyframeImages = images ? images.filter((item) => item.videoFrameKind !== 'reference' && item.videoFrameKind !== 'between') : null;
  const completed = Math.min(
    total || Number.MAX_SAFE_INTEGER,
    keyframeImages ? uniqueCompletedKeyframeCount(keyframeImages, imageFallback) : imageFallback
  );
  const byStatus = countJobsByStatus(jobs);
  const queued = Number(byStatus.queued) || 0;
  const running = Number(byStatus.running) || 0;
  const active = queued + running;
  const failed = [...FAILED_JOB_STATUSES].reduce((sum, status) => sum + (Number(byStatus[status]) || 0), 0);
  const cancelled = Number(byStatus.cancelled) || 0;
  const terminalJobs = [...TERMINAL_JOB_STATUSES].reduce((sum, status) => sum + (Number(byStatus[status]) || 0), 0);
  const pending = Math.max(0, total - completed - active);
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : null;
  const computedStatus = active
    ? 'generating'
    : (failed && completed < total
      ? 'failed'
      : (cancelled && completed < total
        ? 'stopped'
        : (total && completed >= total ? 'completed' : (project.status || 'draft'))));
  return { total, completed, pending, queued, running, active, failed, cancelled, terminalJobs, byStatus, percent, computedStatus };
}

function projectToItem(row = {}, { jobs = [], list = false } = {}) {
  const thumbnailUrl = row.thumbnail_path ? galleryFileUrl(row.thumbnail_path) : '';
  const fullPrompt = row.prompt || '';
  const prompt = list
    ? textPreview(fullPrompt, VIDEO_PROJECT_LIST_PROMPT_MAX_CHARS)
    : { value: fullPrompt, length: fullPrompt.length, truncated: false };
  const storyboardResponse = list
    ? summarizeStoryboardForList(row.storyboard)
    : {
        storyboard: row.storyboard || {},
        storyboardLength: JSON.stringify(row.storyboard || {}).length,
        storyboardTruncated: false,
        storyboardKeyframeCount: Array.isArray(row.storyboard?.keyframes) ? row.storyboard.keyframes.length : 0
      };
  const item = {
    id: row.id,
    userId: row.user_id,
    title: row.title || '未命名视频',
    prompt: prompt.value,
    promptLength: prompt.length,
    promptTruncated: prompt.truncated,
    keyframeCount: Number(row.storyboard?.keyframeCount) || Number(row.keyframe_count) || 0,
    chatModel: row.chat_model || '',
    imageModel: row.image_model || '',
    size: row.size || '',
    quality: row.quality || '',
    outputFormat: row.output_format || '',
    useReferences: Boolean(row.use_references),
    status: row.status || 'draft',
    config: row.config || {},
    references: cleanReferences(row.references),
    storyboard: storyboardResponse.storyboard,
    storyboardLength: storyboardResponse.storyboardLength,
    storyboardTruncated: storyboardResponse.storyboardTruncated,
    storyboardKeyframeCount: storyboardResponse.storyboardKeyframeCount,
    imageCount: Number(row.image_count) || 0,
    thumbnailUrl,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
  item.progress = summarizeVideoProjectProgress(item, { jobs });
  return item;
}

function jobVideoMeta(job = {}) {
  const payload = job.payload || {};
  return {
    videoProjectId: payload.videoProjectId || '',
    videoFrameKind: payload.videoFrameKind || '',
    videoFrameIndex: Number(payload.videoFrameIndex) || null,
    videoFromIndex: Number(payload.videoFromIndex) || null,
    videoToIndex: Number(payload.videoToIndex) || null
  };
}

function projectJobToItem(job = {}) {
  return {
    id: job.id,
    status: job.status || '',
    model: job.model || '',
    promptPreview: job.prompt_preview || '',
    payload: job.payload || {},
    result: job.result || null,
    error: job.error_message || '',
    progress: job.progress || null,
    ...jobVideoMeta(job),
    createdAt: Number(job.created_at) || null,
    startedAt: Number(job.started_at) || null,
    finishedAt: Number(job.finished_at) || null,
    updatedAt: Number(job.updated_at) || null,
    cancelRequested: Boolean(job.cancel_requested)
  };
}

function listProjectJobs(project, { limit = 1000 } = {}) {
  if (!project?.id || !project?.user_id) return [];
  return generationJobs
    .listByVideoProject(project.user_id, project.id, { limit })
    .map(projectJobToItem);
}

function listProjectJobsByIdForUser(userId, projectIds = []) {
  const wanted = new Set(projectIds.filter(Boolean));
  if (!userId || !wanted.size) return new Map();
  const out = new Map([...wanted].map((id) => [id, []]));
  const jobs = generationJobs.listByUser(userId, { activeLimit: 1000, recentLimit: 1000 });
  for (const job of jobs) {
    const projectId = String(job?.payload?.videoProjectId || '');
    if (!wanted.has(projectId)) continue;
    out.get(projectId).push(projectJobToItem(job));
  }
  return out;
}

function assertProjectAccess(project, { userId, isAdmin = false } = {}) {
  if (!project) throw new Error('video project not found');
  if (!isAdmin && project.user_id !== userId) throw new Error('forbidden');
}

export function syncVideoProjectStatus(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = videoProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const jobs = listProjectJobs(project);
  const images = imagesTable.listByVideoProject(id, { limit: 5000, includeReferences: false });
  const item = projectToItem(project, { jobs });
  item.progress = summarizeVideoProjectProgress(item, { images, jobs });
  const previousStatus = project.status || 'draft';
  const nextStatus = item.progress.computedStatus || previousStatus;
  const shouldPersist = VIDEO_PROJECT_STATUSES.has(nextStatus) && nextStatus !== previousStatus;
  const updated = shouldPersist ? videoProjects.touch(id, { status: nextStatus }) : project;
  const projectItem = projectToItem(updated, { jobs });
  projectItem.progress = item.progress;
  return { project: projectItem, progress: item.progress, previousStatus, nextStatus, changed: shouldPersist };
}

export function upsertVideoProject(body = {}, { userId } = {}) {
  if (!userId) throw new Error('unauthorized');
  const existing = body.id ? videoProjects.findById(cleanString(body.id, 80)) : null;
  if (existing) assertProjectAccess(existing, { userId });
  const input = normalizeProjectInput(body, {
    userId,
    id: body.id,
    existingReferences: existing?.references || []
  });
  return projectToItem(videoProjects.upsert(input));
}

export function updateVideoProject(id, body = {}, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const existing = videoProjects.findById(id);
  assertProjectAccess(existing, { userId, isAdmin });
  const input = normalizeProjectInput(body, {
    userId: existing.user_id,
    id,
    existingReferences: existing.references || []
  });
  return projectToItem(videoProjects.upsert(input));
}

export function listVideoProjects({ userId, limit = 200 } = {}) {
  if (!userId) throw new Error('unauthorized');
  const rows = videoProjects.listByUser(userId, limit);
  const jobsByProject = listProjectJobsByIdForUser(userId, rows.map((row) => row.id));
  return {
    items: rows.map((row) => projectToItem(row, { jobs: jobsByProject.get(row.id) || [], list: true })),
    count: videoProjects.countByUser(userId)
  };
}

export async function getVideoProjectDetail(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = videoProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const allImages = await listVideoProjectImages({ projectId: id, userId, isAdmin, limit: 5000, includeReferences: true });
  const references = allImages.filter((item) => item.videoFrameKind === 'reference');
  const images = allImages.filter((item) => item.videoFrameKind !== 'reference');
  const jobs = listProjectJobs(project);
  const item = projectToItem(project, { jobs });
  item.references = references.map((ref, index) => ({
    id: ref.id,
    label: ref.filename || `参考图 ${index + 1}`,
    url: ref.url,
    thumbnailUrl: ref.thumbnailUrl,
    source: 'upload'
  }));
  item.progress = summarizeVideoProjectProgress(item, { images, jobs });
  return { project: item, references, images, jobs, progress: item.progress };
}

export async function addVideoProjectReferences(id, files = [], { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = videoProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const saved = [];
  for (const file of Array.isArray(files) ? files : []) {
    const item = await saveUploadedVideoReference(file, { userId: project.user_id, projectId: id });
    if (item) saved.push(item);
  }
  const references = [
    ...cleanReferences(project.references || []),
    ...saved.map((item, index) => ({
      id: item.id,
      label: item.filename || `参考图 ${index + 1}`,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      source: 'upload'
    }))
  ];
  const updated = videoProjects.upsert({
    ...projectToItem(project),
    userId: project.user_id,
    references,
    status: project.status || 'draft'
  });
  return { project: projectToItem(updated), references, saved };
}

export async function deleteVideoProject(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = videoProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const jobs = listProjectJobs(project);
  const cancelledJobs = [];
  for (const job of jobs) {
    if (!isActiveJobStatus(job.status)) continue;
    try {
      cancelledJobs.push(cancelJob(job.id, { id: project.user_id }, { admin: true }));
    } catch (err) {
      cancelledJobs.push({ id: job.id, status: job.status, error: err.message || String(err) });
    }
  }
  const rows = imagesTable.listByVideoProject(id, { limit: 5000, includeReferences: true });
  const removed = [];
  const failed = [];
  for (const row of rows) {
    try {
      removed.push(await removeImage(row.id, { userId: project.user_id, isAdmin: true }));
    } catch (err) {
      failed.push({ id: row.id, error: err.message || String(err) });
    }
  }
  if (failed.length) {
    const err = new Error('failed to delete some project images');
    err.failed = failed;
    throw err;
  }
  videoProjects.deleteById(id);
  return { id, removed, cancelledJobs };
}
