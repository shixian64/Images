// 图库面板：展示我的图片 / 公开图片，并处理公开、点赞、删除等操作。

import { $, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';
import { switchTab } from './nav.js';
import { copyText } from './clipboard.js';
import { createImagePreviewController } from './image-preview.js';
import {
  comicProjectCardsHtml,
  comicProjectDetailHtml,
  comicProjectImagesEmptyHtml,
  galleryErrorHtml,
  galleryImageCardsHtml,
  galleryLoadingHtml,
  galleryScopeEmptyHtml,
  getImagePrompt,
  previewSrcFromGalleryItem,
  videoProjectCardsHtml,
  videoProjectDetailHtml,
  videoProjectImagesEmptyHtml
} from './gallery-view.js';

let galleryItems = [];
let galleryScope = 'mine';
let galleryCounts = { mine: 0, myPublic: 0, public: 0, comicProjects: 0, videoProjects: 0 };
let likeQuota = { limit: 10, used: 0, remaining: 10 };
let comicProjects = [];
let activeComicProject = null;
let videoProjects = [];
let activeVideoProject = null;
let mounted = false;

let previewIndex = -1;
const previewController = createImagePreviewController({
  ariaLabel: '原图预览',
  closeLabel: '关闭原图预览',
  closeAttribute: 'data-preview-close',
  onClose: () => { previewIndex = -1; }
});

function openPreviewModal(item, trigger, index = -1) {
  const src = previewSrcFromGalleryItem(item);
  if (!src) return false;

  const prompt = item.prompt || item.revisedPrompt || '';
  const nextIndex = Number(index);
  previewIndex = Number.isInteger(nextIndex) && nextIndex >= 0
    ? nextIndex
    : galleryItems.findIndex((galleryItem) => galleryItem === item);
  return previewController.open({
    src,
    alt: prompt || '本地图库原图',
    trigger
  });
}

function closePreviewModal() {
  return previewController.close();
}

function findAdjacentPreviewIndex(direction) {
  if (!direction || !galleryItems.length) return -1;
  const currentIndex = previewIndex;
  if (!Number.isInteger(currentIndex) || currentIndex < 0) return -1;

  for (let index = currentIndex + direction; index >= 0 && index < galleryItems.length; index += direction) {
    if (previewSrcFromGalleryItem(galleryItems[index])) return index;
  }
  return -1;
}

function switchPreviewByKeyboard(direction) {
  if (!previewController.isOpen()) return false;
  const nextIndex = findAdjacentPreviewIndex(direction);
  if (nextIndex < 0) return false;

  const trigger = $('savedGallery')?.querySelector(`.image-preview-trigger[data-gallery-index="${nextIndex}"]`) || null;
  openPreviewModal(galleryItems[nextIndex], trigger, nextIndex);
  return true;
}

function renderScopeTabs() {
  const wrap = $('galleryScopeTabs');
  if (!wrap) return;
  wrap.querySelectorAll('[data-gallery-scope]').forEach((btn) => {
    const active = btn.dataset.galleryScope === galleryScope;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const mine = $('galleryMineCount');
  const pub = $('galleryPublicCount');
  const comic = $('galleryComicCount');
  const video = $('galleryVideoCount');
  if (mine) mine.textContent = String(galleryCounts.mine || 0);
  if (pub) pub.textContent = String(galleryCounts.public || 0);
  if (comic) comic.textContent = String(galleryCounts.comicProjects || 0);
  if (video) video.textContent = String(galleryCounts.videoProjects || 0);
}

function hideGallerySummary() {
  const summary = $('gallerySummary');
  if (!summary) return;
  summary.hidden = true;
  summary.innerHTML = '';
}

function renderSummary(data = {}) {
  galleryCounts = {
    ...galleryCounts,
    ...(data.counts || {})
  };
  likeQuota = {
    ...likeQuota,
    ...(data.likeQuota || {})
  };
  renderScopeTabs();
  hideGallerySummary();
}

function renderImageCards(items = galleryItems) {
  return galleryImageCardsHtml(items, {
    scope: galleryScope,
    totalCount: galleryItems.length,
    likeQuota
  });
}

function comicProjectDetailFromResponse(data = {}) {
  const progress = data.progress || data.project?.progress || null;
  return {
    project: data.project ? { ...data.project, progress } : data.project,
    images: Array.isArray(data.images) ? data.images : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    progress
  };
}

function videoProjectDetailFromResponse(data = {}) {
  const progress = data.progress || data.project?.progress || null;
  const references = Array.isArray(data.project?.references)
    ? data.project.references
    : (Array.isArray(data.references) ? data.references : []);
  return {
    project: data.project ? { ...data.project, references, progress } : data.project,
    references,
    images: Array.isArray(data.images) ? data.images : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    progress
  };
}

function renderComicProjects() {
  const list = $('savedGallery');
  activeComicProject = null;
  activeVideoProject = null;
  galleryItems = [];
  if (!comicProjects.length) {
    list.dataset.empty = 'true';
    list.innerHTML = galleryScopeEmptyHtml('comic');
    return;
  }
  list.dataset.empty = 'false';
  list.innerHTML = comicProjectCardsHtml(comicProjects);
}

function renderVideoProjects() {
  const list = $('savedGallery');
  activeVideoProject = null;
  activeComicProject = null;
  galleryItems = [];
  if (!videoProjects.length) {
    list.dataset.empty = 'true';
    list.innerHTML = galleryScopeEmptyHtml('video');
    return;
  }
  list.dataset.empty = 'false';
  list.innerHTML = videoProjectCardsHtml(videoProjects);
}

function renderComicProjectDetail() {
  const list = $('savedGallery');
  const project = activeComicProject?.project;
  if (!project) return renderComicProjects();
  const images = activeComicProject.images || [];
  galleryItems = images;
  list.dataset.empty = 'false';
  list.innerHTML = comicProjectDetailHtml(project, images, {
    imageCardsHtml: renderImageCards(images),
    emptyImagesHtml: comicProjectImagesEmptyHtml()
  });
}

function renderVideoProjectDetail() {
  const list = $('savedGallery');
  const project = activeVideoProject?.project;
  if (!project) return renderVideoProjects();
  const images = activeVideoProject.images || [];
  galleryItems = images;
  list.dataset.empty = 'false';
  list.innerHTML = videoProjectDetailHtml(project, images, {
    imageCardsHtml: renderImageCards(images),
    emptyImagesHtml: videoProjectImagesEmptyHtml()
  });
}

function renderGallery() {
  const list = $('savedGallery');
  if (galleryScope === 'comic') {
    if (activeComicProject) renderComicProjectDetail();
    else renderComicProjects();
    return;
  }
  if (galleryScope === 'video') {
    if (activeVideoProject) renderVideoProjectDetail();
    else renderVideoProjects();
    return;
  }
  if (!galleryItems.length) {
    list.dataset.empty = 'true';
    list.innerHTML = galleryScopeEmptyHtml(galleryScope);
    return;
  }

  list.dataset.empty = 'false';
  list.innerHTML = renderImageCards(galleryItems);
}

export async function refreshGalleryPanel({ silent = false } = {}) {
  if (!mounted) return;
  const list = $('savedGallery');
  try {
    if (!silent) {
      hideGallerySummary();
      list.dataset.empty = 'true';
      list.innerHTML = galleryLoadingHtml(galleryScope);
    }

    if (galleryScope === 'comic') {
      const resp = await apiFetch('/api/comic-projects?limit=500', { headers: { accept: 'application/json' } });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      comicProjects = Array.isArray(data.items) ? data.items : [];
      galleryCounts = { ...galleryCounts, comicProjects: Number(data.count ?? comicProjects.length) || 0 };
      renderScopeTabs();
      hideGallerySummary();
      activeComicProject = null;
      activeVideoProject = null;
      renderGallery();
      if (!silent) setStatus('漫画项目已刷新', 'ok', 1200);
      return;
    }

    if (galleryScope === 'video') {
      const resp = await apiFetch('/api/video-projects?limit=500', { headers: { accept: 'application/json' } });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      videoProjects = Array.isArray(data.items) ? data.items : [];
      galleryCounts = { ...galleryCounts, videoProjects: Number(data.count ?? videoProjects.length) || 0 };
      renderScopeTabs();
      hideGallerySummary();
      activeComicProject = null;
      activeVideoProject = null;
      renderGallery();
      if (!silent) setStatus('视频项目已刷新', 'ok', 1200);
      return;
    }

    const params = new URLSearchParams({ limit: '500', scope: galleryScope });
    const resp = await apiFetch(`/api/gallery?${params}`, { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    galleryItems = Array.isArray(data.items) ? data.items : [];
    renderSummary(data);
    renderGallery();
    if (!silent) setStatus('图库已刷新', 'ok', 1200);
  } catch (err) {
    const message = err.message || String(err);
    hideGallerySummary();
    list.dataset.empty = 'true';
    list.innerHTML = galleryErrorHtml(galleryScope, message);
    setStatus(`${galleryScope === 'comic' ? '漫画项目' : (galleryScope === 'video' ? '视频项目' : '图库')}加载失败`, 'err', 1800);
  }
}

async function handleDeleteFromCard(card) {
  const id = card?.dataset?.galleryId;
  if (!id) return;
  const ok = await dialog.confirm({
    title: '删除图片',
    message: '将从本地图库永久移除，且不可恢复。继续？',
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('图片已删除', 'ok', 1400);
    if (galleryScope === 'comic' && activeComicProject?.project?.id) {
      await openComicProject(activeComicProject.project.id, { silent: true });
    } else if (galleryScope === 'video' && activeVideoProject?.project?.id) {
      await openVideoProject(activeVideoProject.project.id, { silent: true });
    } else {
      await refreshGalleryPanel({ silent: true });
    }
  } catch (err) {
    setStatus(`删除失败：${err?.message || err}`, 'err', 2000);
  }
}

async function handleTogglePublic(card) {
  const id = card?.dataset?.galleryId;
  const index = Number(card?.dataset?.galleryIndex);
  const item = Number.isInteger(index) ? galleryItems[index] : null;
  if (!id || !item) return;
  const nextPublic = !item.isPublic;
  if (!nextPublic) {
    const ok = await dialog.confirm({
      title: '取消公开',
      message: '取消公开后，其他用户将无法在公开图库看到这张图片。继续？',
      confirmText: '取消公开'
    });
    if (!ok) return;
  }

  try {
    const resp = await apiFetch(`/api/gallery/${encodeURIComponent(id)}/visibility`, {
      method: 'POST',
      body: { isPublic: nextPublic }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus(nextPublic ? '图片已公开' : '已取消公开', 'ok', 1400);
    await refreshGalleryPanel({ silent: true });
  } catch (err) {
    setStatus(`操作失败：${err?.message || err}`, 'err', 2000);
  }
}

async function handleLikeFromCard(card) {
  const id = card?.dataset?.galleryId;
  const index = Number(card?.dataset?.galleryIndex);
  if (!id || !Number.isInteger(index)) return;

  try {
    const resp = await apiFetch(`/api/gallery/${encodeURIComponent(id)}/like`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    galleryItems[index] = {
      ...galleryItems[index],
      likeCount: data.likeCount,
      likedByMe: true
    };
    likeQuota = {
      ...likeQuota,
      ...(data.likeQuota || {})
    };
    renderSummary({ counts: galleryCounts, likeQuota, count: galleryItems.length });
    renderGallery();
    setStatus(data.alreadyLiked ? '你已经赞过这张图片' : '点赞成功', 'ok', 1200);
  } catch (err) {
    const message = err?.message || String(err);
    setStatus(message.includes('daily like limit') ? '今日点赞次数已用完' : `点赞失败：${message}`, 'err', 2000);
  }
}

async function handleCopyPromptFromCard(card) {
  const index = Number(card?.dataset?.galleryIndex);
  const prompt = Number.isInteger(index) ? getImagePrompt(galleryItems[index]) : '';
  try {
    const result = await copyText(prompt);
    setStatus(result.manual ? '请在弹出的文本框中手动复制提示词' : '提示词已复制', result.manual ? 'ready' : 'ok', 1800);
  } catch (err) {
    setStatus(`复制失败：${err?.message || err}`, 'err', 1800);
  }
}

function handleAddReferenceFromCard(card) {
  const index = Number(card?.dataset?.galleryIndex);
  const item = Number.isInteger(index) ? galleryItems[index] : null;
  if (!item?.id) return;
  window.dispatchEvent(new CustomEvent('studio-add-reference-image', {
    detail: { item, focusPrompt: false }
  }));
  setStatus('已加入 Studio 参考图', 'ok', 1400);
}

async function openComicProject(projectId, { silent = false } = {}) {
  if (!projectId) return;
  try {
    if (!silent) setStatus('正在打开漫画项目…', 'busy');
    const resp = await apiFetch(`/api/comic-projects/${encodeURIComponent(projectId)}`, {
      headers: { accept: 'application/json' }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    activeVideoProject = null;
    activeComicProject = comicProjectDetailFromResponse(data);
    renderGallery();
    if (!silent) setStatus('漫画项目已打开', 'ok', 1200);
  } catch (err) {
    setStatus(`打开漫画项目失败：${err?.message || err}`, 'err', 2200);
  }
}

async function loadComicProjectForImport(projectId) {
  if (activeComicProject?.project?.id === projectId) return activeComicProject;
  const resp = await apiFetch(`/api/comic-projects/${encodeURIComponent(projectId)}`, {
    headers: { accept: 'application/json' }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return comicProjectDetailFromResponse(data);
}

async function importComicProject(projectId) {
  if (!projectId) return;
  try {
    const detail = await loadComicProjectForImport(projectId);
    window.dispatchEvent(new CustomEvent('comic-project-import', { detail }));
    switchTab('comicPanel');
    setStatus('已导入漫画项目，可继续编辑或生成', 'ok', 1800);
  } catch (err) {
    setStatus(`导入失败：${err?.message || err}`, 'err', 2200);
  }
}

async function deleteComicProject(projectId) {
  if (!projectId) return;
  const ok = await dialog.confirm({
    title: '删除漫画项目',
    message: '将删除该漫画项目及项目内所有图片，且不可恢复。继续？',
    confirmText: '删除项目',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/comic-projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('漫画项目已删除', 'ok', 1400);
    activeComicProject = null;
    await refreshGalleryPanel({ silent: true });
  } catch (err) {
    setStatus(`删除漫画项目失败：${err?.message || err}`, 'err', 2400);
  }
}

async function openVideoProject(projectId, { silent = false } = {}) {
  if (!projectId) return;
  try {
    if (!silent) setStatus('正在打开视频项目…', 'busy');
    const resp = await apiFetch(`/api/video-projects/${encodeURIComponent(projectId)}`, {
      headers: { accept: 'application/json' }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    activeComicProject = null;
    activeVideoProject = videoProjectDetailFromResponse(data);
    renderGallery();
    if (!silent) setStatus('视频项目已打开', 'ok', 1200);
  } catch (err) {
    setStatus(`打开视频项目失败：${err?.message || err}`, 'err', 2200);
  }
}

async function loadVideoProjectForImport(projectId) {
  if (activeVideoProject?.project?.id === projectId) return activeVideoProject;
  const resp = await apiFetch(`/api/video-projects/${encodeURIComponent(projectId)}`, {
    headers: { accept: 'application/json' }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return videoProjectDetailFromResponse(data);
}

async function importVideoProject(projectId) {
  if (!projectId) return;
  try {
    const detail = await loadVideoProjectForImport(projectId);
    window.dispatchEvent(new CustomEvent('video-project-import', { detail }));
    switchTab('videoPanel');
    setStatus('已导入视频项目，可继续编辑或生成', 'ok', 1800);
  } catch (err) {
    setStatus(`导入失败：${err?.message || err}`, 'err', 2200);
  }
}

async function deleteVideoProject(projectId) {
  if (!projectId) return;
  const ok = await dialog.confirm({
    title: '删除视频项目',
    message: '将删除该视频项目、项目参考图及项目内所有图片，且不可恢复。继续？',
    confirmText: '删除项目',
    danger: true
  });
  if (!ok) return;
  try {
    const resp = await apiFetch(`/api/video-projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus('视频项目已删除', 'ok', 1400);
    activeVideoProject = null;
    await refreshGalleryPanel({ silent: true });
  } catch (err) {
    setStatus(`删除视频项目失败：${err?.message || err}`, 'err', 2400);
  }
}

function projectIdFromElement(el, kind = 'comic') {
  if (kind === 'video') {
    if (activeVideoProject?.project?.id) return activeVideoProject.project.id;
    return el?.closest?.('[data-video-project-id]')?.dataset?.videoProjectId || '';
  }
  if (activeComicProject?.project?.id) return activeComicProject.project.id;
  return el?.closest?.('[data-comic-project-id]')?.dataset?.comicProjectId || '';
}

export function mountGalleryPanel() {
  mounted = true;
  $('refreshGallery').addEventListener('click', () => refreshGalleryPanel());
  $('galleryScopeTabs')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-gallery-scope]');
    if (!btn) return;
    const next = ['public', 'comic', 'video'].includes(btn.dataset.galleryScope) ? btn.dataset.galleryScope : 'mine';
    if (next === galleryScope) return;
    galleryScope = next;
    activeComicProject = null;
    activeVideoProject = null;
    renderScopeTabs();
    refreshGalleryPanel();
  });
  $('savedGallery').addEventListener('click', (ev) => {
    const projectBack = ev.target.closest('[data-comic-project-back]');
    if (projectBack) {
      ev.preventDefault();
      ev.stopPropagation();
      activeComicProject = null;
      renderGallery();
      return;
    }

    const projectOpen = ev.target.closest('[data-comic-project-open]');
    if (projectOpen) {
      ev.preventDefault();
      ev.stopPropagation();
      openComicProject(projectIdFromElement(projectOpen));
      return;
    }

    const projectImport = ev.target.closest('[data-comic-project-import]');
    if (projectImport) {
      ev.preventDefault();
      ev.stopPropagation();
      importComicProject(projectIdFromElement(projectImport));
      return;
    }

    const projectDelete = ev.target.closest('[data-comic-project-delete]');
    if (projectDelete) {
      ev.preventDefault();
      ev.stopPropagation();
      deleteComicProject(projectIdFromElement(projectDelete));
      return;
    }

    const videoProjectBack = ev.target.closest('[data-video-project-back]');
    if (videoProjectBack) {
      ev.preventDefault();
      ev.stopPropagation();
      activeVideoProject = null;
      renderGallery();
      return;
    }

    const videoProjectOpen = ev.target.closest('[data-video-project-open]');
    if (videoProjectOpen) {
      ev.preventDefault();
      ev.stopPropagation();
      openVideoProject(projectIdFromElement(videoProjectOpen, 'video'));
      return;
    }

    const videoProjectImport = ev.target.closest('[data-video-project-import]');
    if (videoProjectImport) {
      ev.preventDefault();
      ev.stopPropagation();
      importVideoProject(projectIdFromElement(videoProjectImport, 'video'));
      return;
    }

    const videoProjectDelete = ev.target.closest('[data-video-project-delete]');
    if (videoProjectDelete) {
      ev.preventDefault();
      ev.stopPropagation();
      deleteVideoProject(projectIdFromElement(videoProjectDelete, 'video'));
      return;
    }

    const copyBtn = ev.target.closest('[data-gallery-copy-prompt]');
    if (copyBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = copyBtn.closest('.image-card');
      handleCopyPromptFromCard(card);
      return;
    }

    const addReferenceBtn = ev.target.closest('[data-gallery-add-reference]');
    if (addReferenceBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = addReferenceBtn.closest('.image-card');
      handleAddReferenceFromCard(card);
      return;
    }

    const delBtn = ev.target.closest('[data-gallery-delete]');
    if (delBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = delBtn.closest('.image-card');
      handleDeleteFromCard(card);
      return;
    }

    const publicBtn = ev.target.closest('[data-gallery-toggle-public]');
    if (publicBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = publicBtn.closest('.image-card');
      handleTogglePublic(card);
      return;
    }

    const likeBtn = ev.target.closest('[data-gallery-like]');
    if (likeBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = likeBtn.closest('.image-card');
      handleLikeFromCard(card);
      return;
    }
    const trigger = ev.target.closest('.image-preview-trigger');
    if (!trigger) return;
    const index = Number(trigger.dataset.galleryIndex);
    if (!Number.isInteger(index)) return;
    openPreviewModal(galleryItems[index], trigger, index);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      closePreviewModal();
      return;
    }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (!previewController.isOpen()) return;
    ev.preventDefault();
    ev.stopPropagation();
    switchPreviewByKeyboard(ev.key === 'ArrowRight' ? 1 : -1);
  });
  window.addEventListener('comic-project-saved', async () => {
    if (galleryScope === 'comic') {
      refreshGalleryPanel({ silent: true });
      return;
    }
    try {
      const resp = await apiFetch('/api/comic-projects?limit=1', { headers: { accept: 'application/json' } });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        galleryCounts = { ...galleryCounts, comicProjects: Number(data.count) || 0 };
        renderScopeTabs();
      }
    } catch {
      // 计数刷新失败不影响生成流程。
    }
  });
  window.addEventListener('video-project-saved', async () => {
    if (galleryScope === 'video') {
      refreshGalleryPanel({ silent: true });
      return;
    }
    try {
      const resp = await apiFetch('/api/video-projects?limit=1', { headers: { accept: 'application/json' } });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        galleryCounts = { ...galleryCounts, videoProjects: Number(data.count) || 0 };
        renderScopeTabs();
      }
    } catch {
      // 计数刷新失败不影响生成流程。
    }
  });
  refreshGalleryPanel({ silent: true });
}
