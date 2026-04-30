// 图库面板：展示我的图片 / 公开图片，并处理公开、点赞、删除等操作。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';

let galleryItems = [];
let galleryScope = 'mine';
let galleryCounts = { mine: 0, myPublic: 0, public: 0 };
let likeQuota = { limit: 10, used: 0, remaining: 10 };
let mounted = false;

let previewModal = null;
let lastPreviewTrigger = null;

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

function openPreviewModal(item, trigger) {
  const src = item?.url || item?.local_url || item?.localUrl || '';
  if (!src) return;

  const prompt = item.prompt || item.revisedPrompt || '';
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
  if (mine) mine.textContent = String(galleryCounts.mine || 0);
  if (pub) pub.textContent = String(galleryCounts.public || 0);
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

function renderGallery() {
  const list = $('savedGallery');
  if (!galleryItems.length) {
    list.dataset.empty = 'true';
    list.innerHTML = galleryScope === 'public'
      ? emptyHtml('还没有公开图片。可以先在“我的图库”中公开一张生成图。')
      : emptyHtml();
    return;
  }

  list.dataset.empty = 'false';
  list.innerHTML = galleryItems.map((item, index) => {
    const src = item.url || item.local_url || item.localUrl || '';
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
        ${item.id ? `<button type="button" data-gallery-toggle-public>${isPublic ? '取消公开' : '公开'}</button>` : ''}
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

export async function refreshGalleryPanel({ silent = false } = {}) {
  if (!mounted) return;
  const list = $('savedGallery');
  try {
    if (!silent) {
      hideGallerySummary();
      list.dataset.empty = 'true';
      list.innerHTML = emptyHtml('正在加载本地图库…');
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
    list.innerHTML = emptyHtml(`图库加载失败：${message}`);
    setStatus('图库加载失败', 'err', 1800);
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
    await refreshGalleryPanel({ silent: true });
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

export function mountGalleryPanel() {
  mounted = true;
  $('refreshGallery').addEventListener('click', () => refreshGalleryPanel());
  $('galleryScopeTabs')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-gallery-scope]');
    if (!btn) return;
    const next = btn.dataset.galleryScope === 'public' ? 'public' : 'mine';
    if (next === galleryScope) return;
    galleryScope = next;
    renderScopeTabs();
    refreshGalleryPanel();
  });
  $('savedGallery').addEventListener('click', (ev) => {
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
    openPreviewModal(galleryItems[index], trigger);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePreviewModal();
  });
  refreshGalleryPanel({ silent: true });
}
