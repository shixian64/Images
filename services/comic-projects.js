// 漫画项目：保存故事、参数、分镜，以及项目内图片集合。

import { comicProjects, images as imagesTable } from './db.js';
import { galleryFileUrl, listComicProjectImages, removeImage } from './gallery-store.js';

function cleanString(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanModel(value) {
  return cleanString(value, 120);
}

function cleanStoryboard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
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
  const storyboard = cleanStoryboard(body.storyboard);
  const panelCount = Math.max(
    0,
    Math.floor(Number(body.panelCount ?? storyboard.panels?.length ?? 0) || 0)
  );
  return {
    id: cleanString(id || body.id, 80) || undefined,
    userId,
    title: projectTitle({ ...body, storyboard }),
    story: cleanString(body.story, 20000),
    styleId: cleanString(body.styleId ?? storyboard.styleId, 80),
    styleLabel: cleanString(body.styleLabel ?? storyboard.styleLabel, 80),
    panelCount,
    chatModel: cleanModel(body.chatModel),
    imageModel: cleanModel(body.imageModel),
    size: cleanString(body.size, 80),
    quality: cleanString(body.quality, 80),
    outputFormat: cleanString(body.outputFormat ?? body.output_format, 80),
    useContext: body.useContext !== false,
    status: cleanString(body.status, 40) || 'draft',
    storyboard
  };
}

function projectToItem(row = {}) {
  const thumbnailUrl = row.thumbnail_path ? galleryFileUrl(row.thumbnail_path) : '';
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title || '未命名漫画',
    story: row.story || '',
    styleId: row.style_id || '',
    styleLabel: row.style_label || '',
    panelCount: Number(row.panel_count) || 0,
    chatModel: row.chat_model || '',
    imageModel: row.image_model || '',
    size: row.size || '',
    quality: row.quality || '',
    outputFormat: row.output_format || '',
    useContext: Boolean(row.use_context),
    status: row.status || 'draft',
    storyboard: row.storyboard || {},
    imageCount: Number(row.image_count) || 0,
    thumbnailUrl,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function assertProjectAccess(project, { userId, isAdmin = false } = {}) {
  if (!project) throw new Error('comic project not found');
  if (!isAdmin && project.user_id !== userId) throw new Error('forbidden');
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
  return {
    items: comicProjects.listByUser(userId, limit).map(projectToItem),
    count: comicProjects.countByUser(userId)
  };
}

export async function getComicProjectDetail(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
  const images = await listComicProjectImages({ projectId: id, userId, isAdmin });
  return {
    project: projectToItem(project),
    images
  };
}

export async function deleteComicProject(id, { userId, isAdmin = false } = {}) {
  if (!userId && !isAdmin) throw new Error('unauthorized');
  const project = comicProjects.findById(id);
  assertProjectAccess(project, { userId, isAdmin });
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
  return { id, removed };
}
