// 漫画项目：保存故事、参数、分镜，以及项目内图片集合。

import { comicProjects, generationJobs, images as imagesTable } from './db.js';
import { galleryFileUrl, listComicProjectImages, removeImage } from './gallery-store.js';
import { cancelJob } from './job-queue.js';
import {
  COMIC_PAGE_COUNT_LIMITS,
  normalizeComicPageStoryboard,
  normalizeComicStoryboard
} from '../shared/comic-workflow.js';

const COMIC_PROJECT_STATUSES = new Set([
  'draft',
  'storyboard',
  'generating',
  'completed',
  'stopped',
  'failed'
]);
const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);
const FAILED_JOB_STATUSES = new Set(['failed', 'timeout']);
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

function cleanString(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanModel(value) {
  return cleanString(value, 120);
}

function cleanStatus(value) {
  const status = cleanString(value, 40) || 'draft';
  if (!COMIC_PROJECT_STATUSES.has(status)) {
    const err = new Error('invalid comic project status');
    err.code = 'invalid_status';
    throw err;
  }
  return status;
}

function rawStoryboardPanels(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  if (Array.isArray(value.panel_plan)) return value.panel_plan;
  if (Array.isArray(value.panels)) return value.panels;
  return [];
}

function rawPageStoryboards(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  if (Array.isArray(value.page_storyboards)) return value.page_storyboards;
  if (Array.isArray(value.pageStoryboards)) return value.pageStoryboards;
  return [];
}

function storyboardHasPageStoryboards(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.pageStoryboardEnabled === true) return true;
  if (rawPageStoryboards(value).length) return true;
  return rawStoryboardPanels(value).some((panel) => (
    panel && typeof panel === 'object' && (
      panel.page_storyboard || panel.pageStoryboard || panel.page_layout || panel.pageLayout
    )
  ));
}

function fallbackPageStoryboardFromPanel(panel = {}, index = 0) {
  const content = [
    panel.beat,
    panel.setting ? `场景：${panel.setting}` : '',
    panel.action ? `动作：${panel.action}` : '',
    panel.emotion ? `情绪：${panel.emotion}` : '',
    panel.imagePrompt
  ].filter(Boolean).join('；') || `第 ${index + 1} 页分镜`;
  return normalizeComicPageStoryboard({
    layoutType: `第 ${index + 1} 页自动分镜`,
    layoutKeywords: ['manga page layout', 'editable page storyboard'],
    readingOrder: '按页面主要视觉动线顺序阅读',
    visualHierarchy: panel.composition || '主体清晰，关键动作和情绪优先',
    narrativeFunction: panel.beat || `推进第 ${index + 1} 页剧情`,
    content,
    panelCount: 1,
    subPanels: [
      {
        id: 'A',
        role: '主画格',
        area: '整页或主视觉区域',
        shot: panel.shot || '',
        camera: panel.camera || '',
        composition: panel.composition || '',
        content,
        transition: ''
      }
    ],
    designNotes: '服务端兜底生成，可在单页分镜编辑区继续细化。',
    aiPromptAddon: 'single page comic layout, clear readable panels'
  }, index);
}

function ensurePageStoryboards(storyboard = {}) {
  if (!Array.isArray(storyboard.panels)) return storyboard;
  storyboard.pageStoryboardEnabled = true;
  storyboard.pageCount = storyboard.panels.length;
  storyboard.panels = storyboard.panels.map((panel, index) => ({
    ...panel,
    pageStoryboard: normalizeComicPageStoryboard(panel.pageStoryboard ?? panel.page_storyboard, index)
      || fallbackPageStoryboardFromPanel(panel, index)
  }));
  return storyboard;
}

function cleanStoryboard(value, { story = '', styleId = '', pageCount = 0, panelCount = 0 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rawPanels = rawStoryboardPanels(value);
  if (!rawPanels.length) return {};
  const requestedCount = Math.min(
    COMIC_PAGE_COUNT_LIMITS.max,
    Math.max(1, Math.floor(Number(pageCount || panelCount || rawPanels.length) || rawPanels.length || 1))
  );
  const pageMode = storyboardHasPageStoryboards(value);
  const storyboard = normalizeComicStoryboard(value, {
    story,
    styleId,
    pageCount: requestedCount,
    panelCount: requestedCount,
    autoPageCount: pageMode || Number(value.page_count ?? value.pageCount) > 0
  });
  return pageMode ? ensurePageStoryboards(storyboard) : storyboard;
}

function projectTitle(body = {}) {
  const explicit = cleanString(body.title, 120);
  if (explicit) return explicit;
  const storyboardTitle = cleanString(body.storyboard?.title, 120);
  if (storyboardTitle) return storyboardTitle;
  const story = cleanString(body.story, 120);
  return story ? story.slice(0, 40) : '未命名漫画';
}

function normalizeProjectInput(body = {}, { userId, id = '' } = {}) {
  const story = cleanString(body.story, 20000);
  const rawPanels = rawStoryboardPanels(body.storyboard);
  const rawPanelCount = rawPanels.length;
  const requestedPageCount = Math.floor(Number(body.pageCount ?? body.pageLimit ?? body.panelCount ?? rawPanelCount) || rawPanelCount || 0);
  const initialStyleId = cleanString(body.styleId ?? body.storyboard?.styleId ?? body.storyboard?.style_id, 80);
  const storyboard = cleanStoryboard(body.storyboard, {
    story,
    styleId: initialStyleId,
    pageCount: requestedPageCount || rawPanelCount,
    panelCount: requestedPageCount || rawPanelCount
  });
  const pageCount = Array.isArray(storyboard.panels)
    ? storyboard.panels.length
    : Math.max(0, requestedPageCount);
  return {
    id: cleanString(id || body.id, 80) || undefined,
    userId,
    title: projectTitle({ ...body, storyboard }),
    story,
    styleId: cleanString(body.styleId ?? storyboard.styleId, 80),
    styleLabel: cleanString(body.styleLabel ?? storyboard.styleLabel, 80),
    // Persisted column/API compatibility: panelCount stores top-level page count
    // for page-storyboard projects.
    panelCount: pageCount,
    chatModel: cleanModel(body.chatModel),
    imageModel: cleanModel(body.imageModel),
    size: cleanString(body.size, 80),
    quality: cleanString(body.quality, 80),
    outputFormat: cleanString(body.outputFormat ?? body.output_format, 80),
    useContext: body.useContext !== false,
    status: cleanStatus(body.status),
    storyboard
  };
}

function comicImagePageIndex(image = {}) {
  const n = Number(image.comicPageIndex ?? image.comic_page_index ?? image.comicPanelIndex ?? image.comic_panel_index);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function uniqueCompletedPageCount(images = [], fallback = 0) {
  if (!Array.isArray(images) || !images.length) return Math.max(0, Number(fallback) || 0);
  const pages = new Set();
  let unindexed = 0;
  for (const image of images) {
    const pageIndex = comicImagePageIndex(image);
    if (pageIndex) pages.add(pageIndex);
    else unindexed += 1;
  }
  return pages.size + unindexed;
}

function pageCountForRow(row = {}) {
  const storyboard = row.storyboard || {};
  return Number(storyboard.pageCount) || Number(row.panel_count) || 0;
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

function summarizeComicProjectProgress(project = {}, { images = null, jobs = [] } = {}) {
  const total = Math.max(0, Number(project.pageCount ?? project.panelCount ?? project.panel_count) || 0);
  const imageFallback = Number(project.imageCount ?? project.image_count) || 0;
  const completed = Math.min(
    total || Number.MAX_SAFE_INTEGER,
    images ? uniqueCompletedPageCount(images, imageFallback) : imageFallback
  );
  const byStatus = countJobsByStatus(jobs);
  const queued = Number(byStatus.queued) || 0;
  const running = Number(byStatus.running) || 0;
  const active = queued + running;
  const failed = [...FAILED_JOB_STATUSES].reduce((sum, status) => sum + (Number(byStatus[status]) || 0), 0);
  const cancelled = Number(byStatus.cancelled) || 0;
  const jobSucceeded = Number(byStatus.succeeded) || 0;
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

  return {
    total,
    completed,
    pending,
    queued,
    running,
    active,
    failed,
    cancelled,
    jobSucceeded,
    terminalJobs,
    byStatus,
    percent,
    computedStatus
  };
}

function projectToItem(row = {}, { jobs = [] } = {}) {
  const thumbnailUrl = row.thumbnail_path ? galleryFileUrl(row.thumbnail_path) : '';
  const storyboard = row.storyboard || {};
  const storedCount = Number(row.panel_count) || 0;
  const pageCount = pageCountForRow(row);
  const item = {
    id: row.id,
    userId: row.user_id,
    title: row.title || '未命名漫画',
    story: row.story || '',
    styleId: row.style_id || '',
    styleLabel: row.style_label || '',
    // panelCount is kept for API compatibility; pageCount is the clearer
    // top-level unit for page-storyboard comic projects.
    panelCount: storedCount,
    pageCount,
    chatModel: row.chat_model || '',
    imageModel: row.image_model || '',
    size: row.size || '',
    quality: row.quality || '',
    outputFormat: row.output_format || '',
    useContext: Boolean(row.use_context),
    status: row.status || 'draft',
    storyboard,
    imageCount: Number(row.image_count) || 0,
    thumbnailUrl,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
  item.progress = summarizeComicProjectProgress(item, { jobs });
  return item;
}

function jobComicPageIndex(job = {}) {
  const n = Number(job.payload?.comicPageIndex ?? job.payload?.comicPanelIndex);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function projectJobToItem(job = {}) {
  const comicPageIndex = jobComicPageIndex(job);
  return {
    id: job.id,
    status: job.status || '',
    model: job.model || '',
    promptPreview: job.prompt_preview || '',
    payload: job.payload || {},
    result: job.result || null,
    error: job.error_message || '',
    progress: job.progress || null,
    comicProjectId: job.payload?.comicProjectId || '',
    comicPageIndex,
    // Backward-compatible alias for old front-end state.
    comicPanelIndex: comicPageIndex,
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
    .listByComicProject(project.user_id, project.id, { limit })
    .map(projectJobToItem);
}

function listProjectJobsByIdForUser(userId, projectIds = []) {
  const wanted = new Set(projectIds.filter(Boolean));
  if (!userId || !wanted.size) return new Map();
  const out = new Map([...wanted].map((id) => [id, []]));
  const jobs = generationJobs.listByUser(userId, { activeLimit: 1000, recentLimit: 1000 });
  for (const job of jobs) {
    const projectId = String(job?.payload?.comicProjectId || '');
    if (!wanted.has(projectId)) continue;
    out.get(projectId).push(projectJobToItem(job));
  }
  return out;
}

function assertProjectAccess(project, { userId, isAdmin = false } = {}) {
  if (!project) throw new Error('comic project not found');
  if (!isAdmin && project.user_id !== userId) throw new Error('forbidden');
}

export function syncComicProjectStatus(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const jobs = listProjectJobs(project);
  const images = imagesTable.listByComicProject(id, { limit: 5000 });
  const item = projectToItem(project, { jobs });
  item.progress = summarizeComicProjectProgress(item, { images, jobs });
  const previousStatus = project.status || 'draft';
  const nextStatus = item.progress.computedStatus || previousStatus;
  const shouldPersist = COMIC_PROJECT_STATUSES.has(nextStatus) && nextStatus !== previousStatus;
  const updated = shouldPersist
    ? comicProjects.touch(id, { status: nextStatus })
    : project;
  const projectItem = projectToItem(updated, { jobs });
  projectItem.progress = item.progress;
  return {
    project: projectItem,
    progress: item.progress,
    previousStatus,
    nextStatus,
    changed: shouldPersist
  };
}

export function upsertComicProject(body = {}, { userId } = {}) {
  if (!userId) throw new Error('unauthorized');
  const input = normalizeProjectInput(body, { userId, id: body.id });
  if (input.id) {
    const existing = comicProjects.findById(input.id);
    if (existing) assertProjectAccess(existing, { userId });
  }
  return projectToItem(comicProjects.upsert(input));
}

export function updateComicProject(id, body = {}, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const existing = comicProjects.findById(id);
  assertProjectAccess(existing, { userId, isAdmin });
  const input = normalizeProjectInput(body, { userId: existing.user_id, id });
  return projectToItem(comicProjects.upsert(input));
}

export function listComicProjects({ userId, limit = 200 } = {}) {
  if (!userId) throw new Error('unauthorized');
  const rows = comicProjects.listByUser(userId, limit);
  const jobsByProject = listProjectJobsByIdForUser(userId, rows.map((row) => row.id));
  return {
    items: rows.map((row) => projectToItem(row, { jobs: jobsByProject.get(row.id) || [] })),
    count: comicProjects.countByUser(userId)
  };
}

export async function getComicProjectDetail(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const images = await listComicProjectImages({ projectId: id, userId, isAdmin });
  const jobs = listProjectJobs(project);
  const item = projectToItem(project, { jobs });
  item.progress = summarizeComicProjectProgress(item, { images, jobs });
  return {
    project: item,
    images,
    jobs,
    progress: item.progress
  };
}

export async function deleteComicProject(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const jobs = listProjectJobs(project);
  const cancelledJobs = [];
  for (const job of jobs) {
    if (!ACTIVE_JOB_STATUSES.has(job.status)) continue;
    try {
      cancelledJobs.push(cancelJob(job.id, { id: project.user_id }, { admin: true }));
    } catch (err) {
      cancelledJobs.push({ id: job.id, status: job.status, error: err.message || String(err) });
    }
  }
  const rows = imagesTable.listByComicProject(id, { limit: 5000 });
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
  comicProjects.deleteById(id);
  return { id, removed, cancelledJobs };
}
