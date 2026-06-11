import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function imageSrcFromItem(item = {}) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

export function referencePreview(item = {}) {
  return item.previewUrl || item.url || item.local_url || item.localUrl || '';
}

export function referenceListView(items = []) {
  const references = Array.isArray(items) ? items : [];
  if (!references.length) {
    return {
      empty: true,
      html: `<div class="reference-empty">${escapeHtml(t('studio.reference.empty'))}</div>`
    };
  }

  return {
    empty: false,
    html: references.map((item, index) => {
      const src = referencePreview(item);
      const name = item.filename || item.name || t(item.type === 'upload'
        ? 'studio.reference.uploadImage'
        : 'studio.reference.galleryImage');
      const source = t(item.type === 'upload'
        ? 'studio.reference.source.upload'
        : 'studio.reference.source.gallery');
      const bytes = formatBytes(item.bytes);
      return `<article class="reference-item" data-reference-id="${escapeHtml(item.clientId)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(t('studio.reference.alt', { index: index + 1 }))}" />
      <button class="reference-remove" type="button" data-reference-remove aria-label="${escapeHtml(t('studio.reference.removeAria', { index: index + 1 }))}">${escapeHtml(t('studio.reference.remove'))}</button>
      <div class="reference-item-meta">
        <span title="${escapeHtml(name)}">#${index + 1} ${escapeHtml(source)}</span>
        <span>${escapeHtml(bytes)}</span>
      </div>
    </article>`;
    }).join('')
  };
}

export function studioEmptyGalleryHtml() {
  return `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⚠</div>
        <p>${escapeHtml(t('studio.gallery.empty'))}</p>
      </div>`;
}

export function studioImageCardHtml(item = {}, index = 0, {
  prompt = '',
  timestamp = Date.now()
} = {}) {
  const src = imageSrcFromItem(item);
  const altText = String(prompt || '').slice(0, 100) || t('studio.result.altFallback', { index: index + 1 });
  const stem = `image-${timestamp}-${index + 1}`;
  const downloadName = item.file_name || `${stem}.png`;
  const saveError = item.save_error
    ? `<p class="revised">${escapeHtml(t('studio.result.saveFailed', { error: item.save_error }))}</p>`
    : '';
  const galleryId = item.gallery_id || item.galleryId || '';
  const refDisabled = galleryId ? '' : 'disabled';
  return `<article class="image-card">
      <button class="image-preview-trigger" type="button" data-studio-index="${index}" aria-label="${escapeHtml(t('studio.result.previewAria', { index: index + 1 }))}">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(altText)}" />
      </button>
      <div class="card-actions">
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">${escapeHtml(t('studio.result.download'))}</a>
        <button type="button" data-studio-add-reference="${index}" ${refDisabled}>${escapeHtml(t('studio.result.addReference'))}</button>
        <button type="button" data-studio-edit-reference="${index}" ${refDisabled}>${escapeHtml(t('studio.result.editReference'))}</button>
      </div>
      ${saveError}
    </article>`;
}

export function studioGalleryView(items = [], prompt = '', { timestamp = Date.now() } = {}) {
  const images = Array.isArray(items) ? items : [];
  if (!images.length) {
    return {
      empty: true,
      html: studioEmptyGalleryHtml()
    };
  }
  return {
    empty: false,
    html: images.map((item, index) => studioImageCardHtml(item, index, {
      prompt,
      timestamp
    })).join('')
  };
}
