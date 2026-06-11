import { escapeHtml } from './dom.js';

export function imageSrcFromGalleryItem(item = {}) {
  return item?.url || item?.local_url || item?.localUrl || '';
}

export function thumbnailSrcFromGalleryItem(item = {}) {
  return item?.thumbnailUrl || item?.thumbnail_url || item?.previewUrl || item?.preview_url || imageSrcFromGalleryItem(item);
}

export function previewSrcFromGalleryItem(item = {}) {
  return item?.previewUrl || item?.preview_url || imageSrcFromGalleryItem(item);
}

export function downloadSrcFromGalleryItem(item = {}) {
  return item?.downloadUrl || imageSrcFromGalleryItem(item);
}

export function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function getImagePrompt(item = {}) {
  return String(item.prompt || item.revised_prompt || item.revisedPrompt || '').trim();
}

export function galleryEmptyHtml(message = '还没有本地图片。生成成功后会自动保存并显示在这里。') {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">▦</div>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

export function galleryImageCardHtml(item = {}, index = 0, {
  scope = 'mine',
  totalCount = 1,
  likeQuota = { remaining: 10 }
} = {}) {
  const thumbSrc = thumbnailSrcFromGalleryItem(item);
  const downloadSrc = downloadSrcFromGalleryItem(item);
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
  const hasLikeBadge = isPublic || scope === 'public';
  const ownerText = item.ownerUsername ? `作者 ${item.ownerUsername}` : (scope === 'public' ? `用户 ${String(item.userId || '').slice(0, 8)}` : '');
  const publicControls = scope === 'public';
  const comicProjectControls = scope === 'comic';
  const cardClass = `image-card gallery-card${publicControls ? ' public-gallery-card' : ''}${hasLikeBadge ? ' has-like-badge' : ''}`;
  const likeLimitReached = publicControls && !item.likedByMe && Number(likeQuota.remaining || 0) <= 0;
  const likeDisabled = item.likedByMe || likeLimitReached;
  const likeText = item.likedByMe ? '已赞' : (likeLimitReached ? '今日用完' : '点赞');
  const actionButtons = publicControls
    ? `
        <a href="${escapeHtml(downloadSrc)}" download="${escapeHtml(downloadName)}">下载</a>
        <button type="button" data-gallery-copy-prompt ${prompt ? '' : 'disabled'}>复制提示词</button>
        <button type="button" data-gallery-like aria-pressed="${item.likedByMe ? 'true' : 'false'}" ${likeDisabled ? 'disabled' : ''}>${likeText}</button>
      `
    : `
        <a href="${escapeHtml(downloadSrc)}" download="${escapeHtml(downloadName)}">下载</a>
        ${item.id ? `<button type="button" data-gallery-add-reference>加入参考图</button>` : ''}
        <button type="button" data-gallery-copy-prompt ${prompt ? '' : 'disabled'}>复制提示词</button>
        ${item.id && !comicProjectControls ? `<button type="button" data-gallery-toggle-public>${isPublic ? '取消公开' : '公开'}</button>` : ''}
        ${item.id ? `<button type="button" data-gallery-delete>删除</button>` : ''}
      `;

  return `<article class="${cardClass}" data-gallery-id="${escapeHtml(item.id || '')}" data-gallery-index="${index}" data-scope="${escapeHtml(scope)}">
      <div class="gallery-image-wrap">
        ${hasLikeBadge ? `<span class="like-badge" title="获赞数量">♥ ${likeCount}</span>` : ''}
        <button class="image-preview-trigger" type="button" data-gallery-index="${index}" aria-label="放大查看第 ${totalCount - index} 张原图">
          <img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml((prompt || `本地图库图片 ${index + 1}`).slice(0, 120))}" loading="lazy" />
        </button>
        <div class="card-actions">
          ${actionButtons}
        </div>
      </div>
      <div class="image-meta">
        <span>#${totalCount - index}</span>
        <span>${escapeHtml(formatTime(item.createdAt))}</span>
      </div>
      <div class="image-meta compact-meta">
        <span>${escapeHtml(ownerText || title || item.mimeType || '本地图片')}</span>
        <span>${escapeHtml(formatBytes(item.bytes))}</span>
      </div>
      ${scope === 'mine' && isPublic ? '<div class="image-meta compact-meta"><span class="public-state">已公开到公开图库</span><span>♥ ' + likeCount + '</span></div>' : ''}
      ${promptPreview}
    </article>`;
}

export function galleryImageCardsHtml(items = [], options = {}) {
  const list = Array.isArray(items) ? items : [];
  const totalCount = Number(options.totalCount ?? list.length) || list.length;
  return list.map((item, index) => galleryImageCardHtml(item, index, {
    ...options,
    totalCount
  })).join('');
}
