// 图库面板：展示我的图片 / 公开图片，并处理公开、点赞、删除等操作。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';
import { switchTab } from './nav.js';

let galleryItems = [];
let galleryScope = 'mine';
let galleryCounts = { mine: 0, myPublic: 0, public: 0, comicProjects: 0 };
let likeQuota = { limit: 10, used: 0, remaining: 10 };
let comicProjects = [];
let activeComicProject = null;
let mounted = false;

let previewModal = null;
let lastPreviewTrigger = null;
let previewIndex = -1;

function imageSrcFromGalleryItem(item = {}) {
  return item?.url || item?.local_url || item?.localUrl || '';
}

function ensurePreviewModal() {
  if (previewModal) return previewModal;

  const modal = document.createElement('div');
  modal.className = 'image-preview-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '原图预览');
  modal.innerHTML = `
    <div class="image-preview-backdrop" data-preview-close></div>
    <div class="image-preview-frame">
      <button class="image-preview-close" type="button" aria-label="关闭原图预览" data-preview-close>×</button>
      <img class="image-preview-image" alt="" />
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => {
    if (ev.target?.hasAttribute?.('data-preview-close')) closePreviewModal();
  });

  previewModal = modal;
  return previewModal;
}

function openPreviewModal(item, trigger, index = -1) {
  const src = imageSrcFromGalleryItem(item);
  if (!src) return;

  const prompt = item.prompt || item.revisedPrompt || '';
  const nextIndex = Number(index);
  previewIndex = Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : galleryItems.findIndex((galleryItem) => galleryItem === item);
  lastPreviewTrigger = trigger || null;
  const modal = ensurePreviewModal();
  const img = modal.querySelector('.image-preview-image');
  img.src = src;
  img.alt = (prompt || '本地图库原图').slice(0, 120);
  modal.hidden = false;
  document.body.classList.add('preview-open');
  modal.querySelector('.image-preview-close')?.focus();
}

function closePreviewModal() {
  if (!previewModal || previewModal.hidden) return;
  const img = previewModal.querySelector('.image-preview-image');
  previewModal.hidden = true;
  if (img) img.removeAttribute('src');
  document.body.classList.remove('preview-open');
  lastPreviewTrigger?.focus?.();
  lastPreviewTrigger = null;
  previewIndex = -1;
}

function findAdjacentPreviewIndex(direction) {
  if (!direction || !galleryItems.length) return -1;
  const currentIndex = Number.isInteger(previewIndex)
    ? previewIndex
    : Number(lastPreviewTrigger?.dataset?.galleryIndex);
  if (!Number.isInteger(currentIndex) || currentIndex < 0) return -1;

  for (let index = currentIndex + direction; index >= 0 && index < galleryItems.length; index += direction) {
    if (imageSrcFromGalleryItem(galleryItems[index])) return index;
  }
  return -1;
}

function switchPreviewByKeyboard(direction) {
  if (!previewModal || previewModal.hidden) return false;
  const nextIndex = findAdjacentPreviewIndex(direction);
  if (nextIndex < 0) return false;

  const trigger = $('savedGallery')?.querySelector(`.image-preview-trigger[data-gallery-index="${nextIndex}"]`) || null;
  openPreviewModal(galleryItems[nextIndex], trigger, nextIndex);
  return true;
}

function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function getImagePrompt(item = {}) {
  return String(item.prompt || item.revised_prompt || item.revisedPrompt || '').trim();
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
  if (mine) mine.textContent = String(galleryCounts.mine || 0);
  if (pub) pub.textContent = String(galleryCounts.public || 0);
  if (comic) comic.textContent = String(galleryCounts.comicProjects || 0);
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

function emptyHtml(message = '还没有本地图片。生成成功后会自动保存并显示在这里。') {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">▦</div>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function renderImageCards(items = galleryItems) {
  return items.map((item, index) => {
    const src = imageSrcFromGalleryItem(item);
    const prompt = getImagePrompt(item);
    const promptText = prompt || '暂无提示词';
    const promptPreview = `<p class="prompt-preview${prompt ? '' : ' is-empty'}" title="${escapeHtml(promptText)}">${escapeHtml(promptText)}</p>`;
    const title = [
      item.model,
      item.size,
      item.quality,
      item.outputFormat
    ].filter(Boolean).join(' · ');
    const downloadName = item.filename || `gallery-${index + 1}`;
    const likeCount = Number(item.likeCount || 0);
    const isPublic = Boolean(item.isPublic);
    const hasLikeBadge = isPublic || galleryScope === 'public';
    const ownerText = item.ownerUsername ? `作者 ${item.ownerUsername}` : (galleryScope === 'public' ? `用户 ${String(item.userId || '').slice(0, 8)}` : '');
    const publicControls = galleryScope === 'public';
    const comicProjectControls = galleryScope === 'comic';
    const cardClass = `image-card gallery-card${publicControls ? ' public-gallery-card' : ''}${hasLikeBadge ? ' has-like-badge' : ''}`;
    const likeLimitReached = publicControls && !item.likedByMe && Number(likeQuota.remaining || 0) <= 0;
    const likeDisabled = item.likedByMe || likeLimitReached;
    const likeText = item.likedByMe ? '已赞' : (likeLimitReached ? '今日用完' : '点赞');
    const actionButtons = publicControls
      ? `
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
        <button type="button" data-gallery-copy-prompt ${prompt ? '' : 'disabled'}>复制提示词</button>
        <button type="button" data-gallery-like aria-pressed="${item.likedByMe ? 'true' : 'false'}" ${likeDisabled ? 'disabled' : ''}>${likeText}</button>
      `
      : `
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
        ${item.id ? `<button type="button" data-gallery-add-reference>加入参考图</button>` : ''}
        <button type="button" data-gallery-copy-prompt ${prompt ? '' : 'disabled'}>复制提示词</button>
        ${item.id && !comicProjectControls ? `<button type="button" data-gallery-toggle-public>${isPublic ? '取消公开' : '公开'}</button>` : ''}
        ${item.id ? `<button type="button" data-gallery-delete>删除</button>` : ''}
      `;

    return `<article class="${cardClass}" data-gallery-id="${escapeHtml(item.id || '')}" data-gallery-index="${index}" data-scope="${galleryScope}">
      <div class="gallery-image-wrap">
        ${hasLikeBadge ? `<span class="like-badge" title="获赞数量">♥ ${likeCount}</span>` : ''}
        <button class="image-preview-trigger" type="button" data-gallery-index="${index}" aria-label="放大查看第 ${galleryItems.length - index} 张原图">
          <img src="${escapeHtml(src)}" alt="${escapeHtml((prompt || `本地图库图片 ${index + 1}`).slice(0, 120))}" loading="lazy" />
        </button>
        <div class="card-actions">
          ${actionButtons}
        </div>
      </div>
      <div class="image-meta">
        <span>#${galleryItems.length - index}</span>
        <span>${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      <div class="image-meta compact-meta">
        <span>${escapeHtml(ownerText || title || item.mimeType || '本地图片')}</span>
        <span>${escapeHtml(formatBytes(item.bytes))}</span>
      </div>
      ${galleryScope === 'mine' && isPublic ? '<div class="image-meta compact-meta"><span class="public-state">已公开到公开图库</span><span>♥ ' + likeCount + '</span></div>' : ''}
      ${promptPreview}
    </article>`;
  }).join('');
}

function projectStatusLabel(status) {
  return {
    draft: '草稿',
    storyboard: '已生成分镜',
    generating: '生成中',
    completed: '已完成',
    stopped: '已停止',
    failed: '失败'
  }[status] || status || '项目';
}

function projectProgress(project = {}, images = []) {
  const progress = project.progress || {};
  const total = Number(progress.total ?? project.pageCount ?? project.panelCount) || 0;
  const completed = Number(progress.completed ?? project.imageCount ?? images.length) || 0;
  return {
    total,
    completed: total ? Math.min(total, completed) : completed,
    active: Number(progress.active) || 0,
    running: Number(progress.running) || 0,
    queued: Number(progress.queued) || 0,
    failed: Number(progress.failed) || 0,
    computedStatus: progress.computedStatus || project.status || 'draft'
  };
}

function projectProgressText(project = {}, images = []) {
  const progress = projectProgress(project, images);
  const parts = [`${progress.completed}/${progress.total || '-'} 张`];
  if (progress.running) parts.push(`${progress.running} 个运行中`);
  if (progress.queued) parts.push(`${progress.queued} 个排队中`);
  if (!progress.active && progress.failed) parts.push(`${progress.failed} 个失败`);
  return parts.join(' · ');
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

function renderComicProjects() {
  const list = $('savedGallery');
  activeComicProject = null;
  galleryItems = [];
  if (!comicProjects.length) {
    list.dataset.empty = 'true';
    list.innerHTML = emptyHtml('还没有漫画项目。请到“漫画”页输入小故事并点击“生成分镜”。');
    return;
  }
  list.dataset.empty = 'false';
  list.innerHTML = comicProjects.map((project, index) => {
    const thumb = project.thumbnailUrl
      ? `<img src="${escapeHtml(project.thumbnailUrl)}" alt="${escapeHtml(project.title)}" loading="lazy" />`
      : `<div class="comic-result-placeholder">项目</div>`;
    const meta = [
      project.styleLabel,
      project.imageModel,
      project.size,
      project.quality
    ].filter(Boolean).join(' · ');
    const progress = projectProgress(project);
    return `<article class="image-card gallery-card comic-project-card" data-comic-project-id="${escapeHtml(project.id)}" data-comic-project-index="${index}">
      <div class="gallery-image-wrap">
        <button class="image-preview-trigger comic-project-open" type="button" data-comic-project-open aria-label="打开漫画项目 ${escapeHtml(project.title)}">
          ${thumb}
        </button>
        <div class="card-actions">
          <button type="button" data-comic-project-open>打开</button>
          <button type="button" data-comic-project-import>导入漫画</button>
          <button type="button" data-comic-project-delete>删除</button>
        </div>
      </div>
      <div class="image-meta">
        <span>#${comicProjects.length - index}</span>
        <span>${escapeHtml(formatTime(project.updatedAt || project.createdAt))}</span>
      </div>
      <div class="image-meta compact-meta">
        <span>${escapeHtml(projectStatusLabel(progress.computedStatus))} · ${escapeHtml(projectProgressText(project))}</span>
        <span>${escapeHtml(meta || '漫画项目')}</span>
      </div>
      <p class="prompt-preview" title="${escapeHtml(project.story || project.title)}">${escapeHtml(project.title || '未命名漫画')}</p>
    </article>`;
  }).join('');
}

function renderComicProjectDetail() {
  const list = $('savedGallery');
  const project = activeComicProject?.project;
  if (!project) return renderComicProjects();
  const images = activeComicProject.images || [];
  galleryItems = images;
  list.dataset.empty = 'false';
  const meta = [
    project.styleLabel,
    project.imageModel,
    project.size,
    project.quality,
    project.outputFormat
  ].filter(Boolean).join(' · ');
  const progress = projectProgress(project, images);
  list.innerHTML = `
    <section class="comic-project-detail span-all">
      <div>
        <button class="ghost small" type="button" data-comic-project-back>← 返回漫画项目</button>
        <h3>${escapeHtml(project.title || '未命名漫画')}</h3>
        <p class="hint">${escapeHtml(meta || '漫画项目')} · ${escapeHtml(projectProgressText(project, images))} · ${escapeHtml(projectStatusLabel(progress.computedStatus))}</p>
        <p class="prompt-preview">${escapeHtml(project.story || '暂无小故事')}</p>
      </div>
      <div class="comic-project-detail-actions">
        <button type="button" class="primary" data-comic-project-import>导入至漫画菜单</button>
        <button type="button" class="ghost danger" data-comic-project-delete>删除项目</button>
      </div>
    </section>
    ${images.length ? renderImageCards(images) : emptyHtml('这个漫画项目还没有生成图片。可导入到漫画菜单继续生成。')}
  `;
}

function renderGallery() {
  const list = $('savedGallery');
  if (galleryScope === 'comic') {
    if (activeComicProject) renderComicProjectDetail();
    else renderComicProjects();
    return;
  }
  if (!galleryItems.length) {
    list.dataset.empty = 'true';
    list.innerHTML = galleryScope === 'public'
      ? emptyHtml('还没有公开图片。可以先在“我的图库”中公开一张生成图。')
      : emptyHtml();
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
      list.innerHTML = emptyHtml(galleryScope === 'comic' ? '正在加载漫画项目…' : '正在加载本地图库…');
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
      renderGallery();
      if (!silent) setStatus('漫画项目已刷新', 'ok', 1200);
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
    list.innerHTML = emptyHtml(`${galleryScope === 'comic' ? '漫画项目' : '图库'}加载失败：${message}`);
    setStatus(`${galleryScope === 'comic' ? '漫画项目' : '图库'}加载失败`, 'err', 1800);
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

async function copyText(text) {
  if (!text) throw new Error('没有可复制的提示词');

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // localhost / 非安全上下文下可能拒绝，继续走传统复制兜底。
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('浏览器拒绝复制');
}

async function handleCopyPromptFromCard(card) {
  const index = Number(card?.dataset?.galleryIndex);
  const prompt = Number.isInteger(index) ? getImagePrompt(galleryItems[index]) : '';
  try {
    await copyText(prompt);
    setStatus('提示词已复制', 'ok', 1400);
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

function projectIdFromElement(el) {
  if (activeComicProject?.project?.id) return activeComicProject.project.id;
  return el?.closest?.('[data-comic-project-id]')?.dataset?.comicProjectId || '';
}

export function mountGalleryPanel() {
  mounted = true;
  $('refreshGallery').addEventListener('click', () => refreshGalleryPanel());
  $('galleryScopeTabs')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-gallery-scope]');
    if (!btn) return;
    const next = ['public', 'comic'].includes(btn.dataset.galleryScope) ? btn.dataset.galleryScope : 'mine';
    if (next === galleryScope) return;
    galleryScope = next;
    activeComicProject = null;
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
    if (!previewModal || previewModal.hidden) return;
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
  refreshGalleryPanel({ silent: true });
}
