import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

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

export function galleryScopeEmptyHtml(scope = 'mine') {
  if (scope === 'public') {
    return galleryEmptyHtml('还没有公开图片。可以先在“我的图库”中公开一张生成图。');
  }
  if (scope === 'comic') {
    return galleryEmptyHtml('还没有漫画项目。请到“漫画”页输入小故事并点击“生成页分镜”。');
  }
  return galleryEmptyHtml();
}

export function comicProjectImagesEmptyHtml() {
  return galleryEmptyHtml('这个漫画项目还没有生成图片。可导入到漫画菜单继续生成。');
}

export function galleryLoadingHtml(scope = 'mine') {
  return galleryEmptyHtml(scope === 'comic' ? '正在加载漫画项目…' : '正在加载本地图库…');
}

export function galleryErrorHtml(scope = 'mine', message = '加载失败') {
  const prefix = scope === 'comic' ? '漫画项目' : '图库';
  return galleryEmptyHtml(`${prefix}加载失败：${message || '加载失败'}`);
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

export function comicProjectStatusLabel(status) {
  return t(`gallery.comic.status.${status}`, {}, status || t('gallery.comic.status.project'));
}

export function comicProjectProgress(project = {}, images = []) {
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

export function comicProjectProgressText(project = {}, images = []) {
  const progress = comicProjectProgress(project, images);
  const parts = [t('gallery.comic.progress.images', {
    completed: progress.completed,
    total: progress.total || '-'
  })];
  if (progress.running) parts.push(t('gallery.comic.progress.running', { count: progress.running }));
  if (progress.queued) parts.push(t('gallery.comic.progress.queued', { count: progress.queued }));
  if (!progress.active && progress.failed) parts.push(t('gallery.comic.progress.failed', { count: progress.failed }));
  return parts.join(' · ');
}

function comicProjectMeta(project = {}) {
  return [
    project.styleLabel,
    project.imageModel,
    project.size,
    project.quality
  ].filter(Boolean).join(' · ');
}

export function comicProjectCardHtml(project = {}, index = 0, { totalCount = 1 } = {}) {
  const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const safeTotal = Number.isFinite(Number(totalCount)) ? Number(totalCount) : 1;
  const thumb = project.thumbnailUrl
    ? `<img src="${escapeHtml(project.thumbnailUrl)}" alt="${escapeHtml(project.title)}" loading="lazy" />`
    : '<div class="comic-result-placeholder">项目</div>';
  const progress = comicProjectProgress(project);
  const meta = comicProjectMeta(project);
  return `<article class="image-card gallery-card comic-project-card" data-comic-project-id="${escapeHtml(project.id)}" data-comic-project-index="${safeIndex}">
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
        <span>#${safeTotal - safeIndex}</span>
        <span>${escapeHtml(formatTime(project.updatedAt || project.createdAt))}</span>
      </div>
      <div class="image-meta compact-meta">
        <span>${escapeHtml(comicProjectStatusLabel(progress.computedStatus))} · ${escapeHtml(comicProjectProgressText(project))}</span>
        <span>${escapeHtml(meta || '漫画项目')}</span>
      </div>
      <p class="prompt-preview" title="${escapeHtml(project.story || project.title)}">${escapeHtml(project.title || '未命名漫画')}</p>
    </article>`;
}

export function comicProjectCardsHtml(projects = []) {
  const list = Array.isArray(projects) ? projects : [];
  const totalCount = list.length;
  return list.map((project, index) => comicProjectCardHtml(project, index, { totalCount })).join('');
}

export function comicProjectDetailHtml(project = {}, images = [], {
  imageCardsHtml = '',
  emptyImagesHtml = galleryEmptyHtml('这个漫画项目还没有生成图片。可导入到漫画菜单继续生成。')
} = {}) {
  const meta = [
    project.styleLabel,
    project.imageModel,
    project.size,
    project.quality,
    project.outputFormat
  ].filter(Boolean).join(' · ');
  const progress = comicProjectProgress(project, images);
  return `
    <section class="comic-project-detail span-all">
      <div>
        <button class="ghost small" type="button" data-comic-project-back>← 返回漫画项目</button>
        <h3>${escapeHtml(project.title || '未命名漫画')}</h3>
        <p class="hint">${escapeHtml(meta || '漫画项目')} · ${escapeHtml(comicProjectProgressText(project, images))} · ${escapeHtml(comicProjectStatusLabel(progress.computedStatus))}</p>
        <p class="prompt-preview">${escapeHtml(project.story || '暂无小故事')}</p>
      </div>
      <div class="comic-project-detail-actions">
        <button type="button" class="primary" data-comic-project-import>导入至漫画菜单</button>
        <button type="button" class="ghost danger" data-comic-project-delete>删除项目</button>
      </div>
    </section>
    ${images.length ? imageCardsHtml : emptyImagesHtml}
  `;
}
