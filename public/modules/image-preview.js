// Shared image preview modal controller. It intentionally builds DOM nodes
// instead of injecting an HTML string so callers only pass image URL/alt text.

function createEl(tag, { className = '', attrs = {}, text = '' } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  if (text) el.textContent = text;
  return el;
}

export function createImagePreviewController({
  modalClass = '',
  ariaLabel = '图片预览',
  closeLabel = '关闭图片预览',
  closeAttribute = 'data-image-preview-close',
  referrerPolicy = '',
  transformUrl = (url) => url,
  onClose = null
} = {}) {
  let modal = null;
  let lastTrigger = null;

  function ensure() {
    if (modal) return modal;

    modal = createEl('div', {
      className: ['image-preview-modal', modalClass].filter(Boolean).join(' '),
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': ariaLabel
      }
    });
    modal.hidden = true;

    const backdrop = createEl('div', {
      className: 'image-preview-backdrop',
      attrs: { [closeAttribute]: true }
    });
    const frame = createEl('div', { className: 'image-preview-frame' });
    const close = createEl('button', {
      className: 'image-preview-close',
      attrs: {
        type: 'button',
        'aria-label': closeLabel,
        [closeAttribute]: true
      },
      text: '×'
    });
    const img = createEl('img', {
      className: 'image-preview-image',
      attrs: referrerPolicy ? { alt: '', referrerpolicy: referrerPolicy } : { alt: '' }
    });
    if (referrerPolicy) img.referrerPolicy = referrerPolicy;

    frame.appendChild(close);
    frame.appendChild(img);
    modal.appendChild(backdrop);
    modal.appendChild(frame);
    document.body.appendChild(modal);

    modal.addEventListener('click', (ev) => {
      if (ev.target?.hasAttribute?.(closeAttribute)) closePreview();
    });

    return modal;
  }

  function openPreview({ src, alt = '', trigger = null } = {}) {
    if (!src) return false;
    const nextUrl = transformUrl(String(src));
    if (!nextUrl) return false;

    lastTrigger = trigger || null;
    const current = ensure();
    const img = current.querySelector('.image-preview-image');
    if (img) {
      img.src = nextUrl;
      img.alt = String(alt || ariaLabel).slice(0, 120);
      if (referrerPolicy) img.referrerPolicy = referrerPolicy;
    }
    current.hidden = false;
    document.body.classList.add('preview-open');
    current.querySelector('.image-preview-close')?.focus?.();
    return true;
  }

  function closePreview() {
    if (!modal || modal.hidden) return false;
    const img = modal.querySelector('.image-preview-image');
    modal.hidden = true;
    if (img) img.removeAttribute('src');
    document.body.classList.remove('preview-open');
    lastTrigger?.focus?.();
    lastTrigger = null;
    if (typeof onClose === 'function') onClose();
    return true;
  }

  return {
    open: openPreview,
    close: closePreview,
    isOpen: () => Boolean(modal && !modal.hidden),
    getModal: () => modal
  };
}
