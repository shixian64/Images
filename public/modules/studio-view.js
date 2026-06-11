import { escapeHtml } from './dom.js';

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
      html: '<div class="reference-empty">还没有参考图。生成结果卡片可点“加入参考图”。</div>'
    };
  }

  return {
    empty: false,
    html: references.map((item, index) => {
      const src = referencePreview(item);
      const name = item.filename || item.name || (item.type === 'upload' ? '上传图片' : '图库图片');
      const source = item.type === 'upload' ? '上传' : '图库';
      const bytes = formatBytes(item.bytes);
      return `<article class="reference-item" data-reference-id="${escapeHtml(item.clientId)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(`参考图 ${index + 1}`)}" />
      <button class="reference-remove" type="button" data-reference-remove aria-label="移除参考图 ${index + 1}">移除</button>
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
        <p>接口返回成功，但 <code>data[]</code> 为空。</p>
      </div>`;
}

export function studioImageCardHtml(item = {}, index = 0, {
  prompt = '',
  timestamp = Date.now()
} = {}) {
  const src = imageSrcFromItem(item);
  const altBase = escapeHtml(String(prompt || '').slice(0, 100));
  const stem = `image-${timestamp}-${index + 1}`;
  const downloadName = item.file_name || `${stem}.png`;
  const saveError = item.save_error
    ? `<p class="revised">本地保存失败：${escapeHtml(item.save_error)}</p>`
    : '';
  const galleryId = item.gallery_id || item.galleryId || '';
  const refDisabled = galleryId ? '' : 'disabled';
  return `<article class="image-card">
      <button class="image-preview-trigger" type="button" data-studio-index="${index}" aria-label="放大查看第 ${index + 1} 张生成图">
        <img src="${escapeHtml(src)}" alt="${altBase || `Generated image ${index + 1}`}" />
      </button>
      <div class="card-actions">
        <a href="${escapeHtml(src)}" download="${escapeHtml(downloadName)}">下载</a>
        <button type="button" data-studio-add-reference="${index}" ${refDisabled}>加入参考图</button>
        <button type="button" data-studio-edit-reference="${index}" ${refDisabled}>继续编辑</button>
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
