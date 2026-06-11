const MANUAL_COPY_ID = 'clipboardManualCopy';

import { t } from './i18n.js';

function assertCopyableText(text) {
  const value = String(text ?? '');
  if (!value) throw new Error(t('clipboard.error.empty'));
  return value;
}

export function dismissManualCopyFallback(doc = globalThis.document) {
  doc?.getElementById?.(MANUAL_COPY_ID)?.remove?.();
}

export function showManualCopyFallback(text, {
  doc = globalThis.document,
  title = t('clipboard.manual.title'),
  message = t('clipboard.manual.message')
} = {}) {
  const value = assertCopyableText(text);
  if (!doc?.body || typeof doc.createElement !== 'function') {
    throw new Error(t('clipboard.error.manualUnsupported'));
  }

  dismissManualCopyFallback(doc);

  const wrap = doc.createElement('section');
  wrap.id = MANUAL_COPY_ID;
  wrap.className = 'clipboard-manual-copy';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-live', 'polite');

  const head = doc.createElement('div');
  head.className = 'clipboard-manual-head';

  const titleEl = doc.createElement('strong');
  titleEl.textContent = title;

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'ghost small';
  close.textContent = t('clipboard.manual.close');
  close.addEventListener('click', () => wrap.remove());

  const hint = doc.createElement('p');
  hint.textContent = message;

  const textarea = doc.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-label', t('clipboard.manual.textareaAria'));

  head.appendChild(titleEl);
  head.appendChild(close);
  wrap.appendChild(head);
  wrap.appendChild(hint);
  wrap.appendChild(textarea);
  doc.body.appendChild(wrap);

  textarea.focus?.();
  textarea.select?.();

  return { copied: false, manual: true, method: 'manual', element: wrap, textarea };
}

export async function copyText(text, options = {}) {
  const value = assertCopyableText(text);
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return { copied: true, manual: false, method: 'clipboard' };
    } catch {
      // Continue to the legacy copy path and manual selection fallback.
    }
  }

  const doc = options.doc || globalThis.document;
  if (!doc?.body || typeof doc.createElement !== 'function') {
    throw new Error(t('clipboard.error.unsupported'));
  }

  const textarea = doc.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.className = 'clipboard-hidden-copy';
  doc.body.appendChild(textarea);
  textarea.focus?.();
  textarea.select?.();

  let copied = false;
  try {
    copied = Boolean(doc.execCommand?.('copy'));
  } catch {
    copied = false;
  }

  textarea.remove?.();
  if (copied) return { copied: true, manual: false, method: 'execCommand' };

  return showManualCopyFallback(value, { ...options, doc });
}
