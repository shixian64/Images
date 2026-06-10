// Shared dialog helpers: confirm / info / one-time secret / controlled form.
// Keep a usable fallback for browsers without native dialog.showModal().
// TAG: hmt---

import { escapeHtml } from './dom.js';
import { copyText } from './clipboard.js';

const TEXT = Object.freeze({
  confirmTitle: '\u786e\u8ba4\u64cd\u4f5c',
  confirm: '\u786e\u8ba4',
  cancel: '\u53d6\u6d88',
  infoTitle: '\u63d0\u793a',
  infoOk: '\u6211\u77e5\u9053\u4e86',
  secretTitle: '\u8bf7\u590d\u5236\u5e76\u59a5\u5584\u4fdd\u5b58',
  secretMessage: '\u6b64\u5185\u5bb9\u53ea\u663e\u793a\u4e00\u6b21\uff0c\u5173\u95ed\u540e\u65e0\u6cd5\u518d\u6b21\u67e5\u770b\u3002',
  copy: '\u590d\u5236',
  copied: '\u5df2\u590d\u5236',
  copyManual: '\u8bf7\u624b\u52a8\u590d\u5236',
  copyFailed: '\u590d\u5236\u5931\u8d25',
  close: '\u5173\u95ed',
  formTitle: '\u586b\u5199\u4fe1\u606f',
  save: '\u4fdd\u5b58'
});

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function buildDialog(innerHtml) {
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = innerHtml;
  document.body.appendChild(dlg);
  return dlg;
}

export function closeDialog(dlg, value = '') {
  if (!dlg) return;
  dlg.returnValue = value;
  if (typeof dlg.close === 'function') {
    dlg.close(value);
    return;
  }
  dlg.removeAttribute?.('open');
  const CloseEventCtor = globalThis.CloseEvent || globalThis.Event;
  if (typeof CloseEventCtor === 'function') {
    dlg.dispatchEvent?.(new CloseEventCtor('close'));
  }
}

export function focusableDialogElements(dlg) {
  if (!dlg?.querySelectorAll) return [];
  return Array.from(dlg.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hidden && el.getAttribute?.('aria-hidden') !== 'true');
}

export function presentDialog(dlg, { handleDialogForms = true } = {}) {
  const previousActive = document.activeElement;
  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
    return () => previousActive?.focus?.();
  }

  dlg.setAttribute('open', '');
  if (!dlg.getAttribute?.('role')) dlg.setAttribute('role', 'dialog');
  if (!dlg.getAttribute?.('aria-modal')) dlg.setAttribute('aria-modal', 'true');
  dlg.classList?.add?.('app-dialog-fallback');

  const focusFirst = () => {
    const focusable = focusableDialogElements(dlg);
    (focusable[0] || dlg).focus?.();
  };

  const onKeyDown = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault?.();
      closeDialog(dlg, 'cancel');
      return;
    }
    if (ev.key !== 'Tab') return;
    const focusable = focusableDialogElements(dlg);
    if (!focusable.length) {
      ev.preventDefault?.();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = document.activeElement;
    if (ev.shiftKey && active === first) {
      ev.preventDefault?.();
      last.focus?.();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault?.();
      first.focus?.();
    }
  };

  const onSubmit = (ev) => {
    if (!handleDialogForms) return;
    const form = ev.target;
    if (String(form?.getAttribute?.('method') || '').toLowerCase() !== 'dialog') return;
    ev.preventDefault?.();
    closeDialog(dlg, ev.submitter?.value || '');
  };

  dlg.addEventListener?.('keydown', onKeyDown);
  dlg.addEventListener?.('submit', onSubmit);
  queueMicrotask(focusFirst);

  return () => {
    dlg.removeEventListener?.('keydown', onKeyDown);
    dlg.removeEventListener?.('submit', onSubmit);
    previousActive?.focus?.();
  };
}

function showAndAwait(dlg, parseResult) {
  return new Promise((resolve) => {
    const cleanup = presentDialog(dlg);
    const handler = () => {
      dlg.removeEventListener('close', handler);
      cleanup();
      let value;
      try { value = parseResult ? parseResult(dlg.returnValue, dlg) : dlg.returnValue; }
      catch { value = null; }
      try { dlg.remove(); } catch { /* ignore */ }
      resolve(value);
    };
    dlg.addEventListener('close', handler);
  });
}

export function confirm({
  title = TEXT.confirmTitle,
  message = '',
  confirmText = TEXT.confirm,
  cancelText = TEXT.cancel,
  danger = false
} = {}) {
  const dlg = buildDialog(`
    <form method="dialog" class="app-dialog-form">
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p class="app-dialog-message">${escapeHtml(message)}</p>` : ''}
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit">${escapeHtml(cancelText)}</button>
        <button value="confirm" class="${danger ? 'danger' : 'primary'}" type="submit">${escapeHtml(confirmText)}</button>
      </div>
    </form>
  `);
  return showAndAwait(dlg, (val) => val === 'confirm');
}

export function info({ title = TEXT.infoTitle, message = '', okText = TEXT.infoOk } = {}) {
  const dlg = buildDialog(`
    <form method="dialog" class="app-dialog-form">
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p class="app-dialog-message">${escapeHtml(message)}</p>` : ''}
      <div class="app-dialog-actions">
        <button value="ok" class="primary" type="submit">${escapeHtml(okText)}</button>
      </div>
    </form>
  `);
  return showAndAwait(dlg, () => true);
}

export function showSecret({
  title = TEXT.secretTitle,
  message = TEXT.secretMessage,
  secret = ''
} = {}) {
  const dlg = buildDialog(`
    <form method="dialog" class="app-dialog-form">
      <h3>${escapeHtml(title)}</h3>
      <p class="app-dialog-message">${escapeHtml(message)}</p>
      <div class="app-dialog-secret">
        <code>${escapeHtml(secret)}</code>
        <button type="button" class="ghost small" data-copy>${TEXT.copy}</button>
      </div>
      <div class="app-dialog-actions">
        <button value="ok" class="primary" type="submit">${TEXT.close}</button>
      </div>
    </form>
  `);
  const copyBtn = dlg.querySelector('[data-copy]');
  copyBtn?.addEventListener('click', async () => {
    try {
      const result = await copyText(secret);
      copyBtn.textContent = result.manual ? TEXT.copyManual : TEXT.copied;
      if (!result.manual) setTimeout(() => { copyBtn.textContent = TEXT.copy; }, 1400);
    } catch (err) {
      copyBtn.textContent = err?.message || TEXT.copyFailed;
    }
  });
  return showAndAwait(dlg, () => true);
}

export function form({
  title = TEXT.formTitle,
  fields = [],
  confirmText = TEXT.save,
  cancelText = TEXT.cancel,
  validate
} = {}) {
  const fieldHtml = fields.map((f) => {
    const id = `app-field-${f.name}`;
    if (f.type === 'select') {
      const opts = (f.options || []).map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : (o.label || o.value);
        const selected = f.value !== undefined && String(f.value) === String(value) ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
      }).join('');
      return `
        <label class="field"><span>${escapeHtml(f.label || f.name)}</span>
          <select id="${id}" name="${escapeHtml(f.name)}"${f.required ? ' required' : ''}>${opts}</select>
        </label>`;
    }
    const value = f.value === undefined ? '' : String(f.value);
    return `
      <label class="field"><span>${escapeHtml(f.label || f.name)}</span>
        <input id="${id}" name="${escapeHtml(f.name)}" type="${escapeHtml(f.type || 'text')}"
          ${f.required ? 'required' : ''}
          ${f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : ''}
          ${f.minlength ? `minlength="${Number(f.minlength)}"` : ''}
          ${f.pattern ? `pattern="${escapeHtml(f.pattern)}"` : ''}
          value="${escapeHtml(value)}" />
      </label>`;
  }).join('');

  const dlg = buildDialog(`
    <form method="dialog" class="app-dialog-form" data-form>
      <h3>${escapeHtml(title)}</h3>
      <div class="error-banner" data-err hidden></div>
      ${fieldHtml}
      <div class="app-dialog-actions">
        <button value="cancel" class="ghost" type="submit">${escapeHtml(cancelText)}</button>
        <button value="confirm" class="primary" type="submit" data-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </form>
  `);

  const formEl = dlg.querySelector('[data-form]');
  const errEl = dlg.querySelector('[data-err]');

  return new Promise((resolve) => {
    const cleanup = presentDialog(dlg, { handleDialogForms: false });
    let pendingValues = null;
    formEl.addEventListener('submit', (ev) => {
      const submitter = ev.submitter;
      ev.preventDefault();
      if (submitter && submitter.value === 'cancel') {
        closeDialog(dlg, 'cancel');
        return;
      }
      errEl.hidden = true; errEl.textContent = '';
      const fd = new FormData(formEl);
      const values = {};
      for (const f of fields) values[f.name] = String(fd.get(f.name) || '').trim();
      const err = typeof validate === 'function' ? validate(values) : null;
      if (err) {
        errEl.textContent = err;
        errEl.hidden = false;
        return;
      }
      pendingValues = values;
      closeDialog(dlg, 'confirm');
    });
    dlg.addEventListener('close', () => {
      cleanup();
      try { dlg.remove(); } catch { /* ignore */ }
      if (dlg.returnValue === 'confirm') resolve({ ok: true, values: pendingValues || {} });
      else resolve({ ok: false });
    });
  });
}
