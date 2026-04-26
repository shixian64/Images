// 本地图库面板：启动时自动读取服务端 generated/gallery.json，并展示已落盘图片。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';
import * as dialog from './dialog.js';

let galleryItems = [];
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

function renderSummary(data = {}) {
  const total = Number(data.count ?? galleryItems.length) || 0;
  const savedToday = galleryItems.filter((item) => {
    const ts = String(item.createdAt || '');
    return ts.slice(0, 10) === new Date().toISOString().slice(0, 10);
  }).length;

  $('gallerySummary').innerHTML = `
    <span class="chip">本地共 ${total} 张</span>
    <span class="chip info">当前显示 ${galleryItems.length} 张</span>
    <span class="chip">今日新增 ${savedToday} 张</span>
    <span class="chip">目录 ${escapeHtml(data.storage || 'generated/images')}</span>
  `;
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
    list.innerHTML = emptyHtml();
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

    return `<article class="image-card gallery-card" data-gallery-id="${escapeHtml(item.id || '')}" data-gallery-index="${index}">
      <button class="image-preview-trigger" type="button" data-gallery-index="${index}" aria-label="放大查看第 ${galleryItems.length - index} 张原图">
        <img src="${escapeHtml(src)}" alt="${escapeHtml((prompt || `本地图库图片 ${index + 1}`).slice(0, 120))}" loading="lazy" />
      </button>
      <div class="card-actions">
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
        <button type="button" data-gallery-copy-prompt ${prompt ? '' : 'disabled'}>复制提示词</button>
        ${item.id ? `<button type="button" data-gallery-delete>删除</button>` : ''}
      </div>
      <div class="image-meta">
        <span>#${galleryItems.length - index}</span>
        <span>${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      <div class="image-meta compact-meta">
        <span>${escapeHtml(title || item.mimeType || '本地图片')}</span>
        <span>${escapeHtml(formatBytes(item.bytes))}</span>
      </div>
      ${promptPreview}
    </article>`;
  }).join('');
}

export async function refreshGalleryPanel({ silent = false } = {}) {
  if (!mounted) return;
  const summary = $('gallerySummary');
  const list = $('savedGallery');
  try {
    if (!silent) {
      summary.innerHTML = '<span class="chip">正在加载本地图库…</span>';
      list.dataset.empty = 'true';
      list.innerHTML = emptyHtml('正在加载本地图库…');
    }

    const resp = await apiFetch('/api/gallery?limit=500', { headers: { accept: 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    galleryItems = Array.isArray(data.items) ? data.items : [];
    renderSummary(data);
    renderGallery();
    if (!silent) setStatus('图库已刷新', 'ok', 1200);
  } catch (err) {
    const message = err.message || String(err);
    summary.innerHTML = `<span class="chip error">加载失败：${escapeHtml(message)}</span>`;
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

export function mountGalleryPanel() {
  mounted = true;
  $('refreshGallery').addEventListener('click', () => refreshGalleryPanel());
  $('savedGallery').addEventListener('click', (ev) => {
    const copyBtn = ev.target.closest('[data-gallery-copy-prompt]');
    if (copyBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const card = copyBtn.closest('.image-card');
      handleCopyPromptFromCard(card);
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
