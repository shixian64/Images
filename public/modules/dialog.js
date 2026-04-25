// 通用对话框：confirm / prompt / info / form。
// 替代浏览器内置 alert/confirm/prompt，统一视觉与可访问性。
// TAG: hmt---

import { escapeHtml } from './dom.js';

function buildDialog(innerHtml) {
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = innerHtml;
  document.body.appendChild(dlg);
  return dlg;
}

function showAndAwait(dlg, parseResult) {
  return new Promise((resolve) => {
    const handler = () => {
      dlg.removeEventListener('close', handler);
      let value;
      try { value = parseResult ? parseResult(dlg.returnValue, dlg) : dlg.returnValue; }
      catch { value = null; }
      try { dlg.remove(); } catch { /* ignore */ }
      resolve(value);
    };
    dlg.addEventListener('close', handler);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });
}

export function confirm({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
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

export function info({ title = '提示', message = '', okText = '我知道了' } = {}) {
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

// 显示一条已生成的明文（密码 / 临时口令），允许复制
export function showSecret({
  title = '请复制并妥善保存',
  message = '此内容只显示一次，关闭后无法再次查看。',
  secret = ''
} = {}) {
  const dlg = buildDialog(`
    <form method="dialog" class="app-dialog-form">
      <h3>${escapeHtml(title)}</h3>
      <p class="app-dialog-message">${escapeHtml(message)}</p>
      <div class="app-dialog-secret">
        <code>${escapeHtml(secret)}</code>
        <button type="button" class="ghost small" data-copy>复制</button>
      </div>
      <div class="app-dialog-actions">
        <button value="ok" class="primary" type="submit">关闭</button>
      </div>
    </form>
  `);
  const copyBtn = dlg.querySelector('[data-copy]');
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(secret);
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 1400);
    } catch {
      copyBtn.textContent = '复制失败';
    }
  });
  return showAndAwait(dlg, () => true);
}

// 受控输入对话框：fields = [{ name, label, type, required, value, placeholder, options }]
// 返回 { ok: true, values: {} } 或 { ok: false }
export function form({
  title = '填写信息',
  fields = [],
  confirmText = '保存',
  cancelText = '取消',
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
    formEl.addEventListener('submit', (ev) => {
      const submitter = ev.submitter;
      if (submitter && submitter.value === 'cancel') {
        // 走默认 dialog 关闭流程
        return;
      }
      ev.preventDefault();
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
      dlg.returnValue = 'confirm';
      dlg.close('confirm');
      try { dlg.remove(); } catch { /* ignore */ }
      resolve({ ok: true, values });
    });
    dlg.addEventListener('close', (ev) => {
      // close 由表单 submit 触发时已 resolve；这里处理 ESC / 取消
      if (dlg.returnValue !== 'confirm') {
        try { dlg.remove(); } catch { /* ignore */ }
        resolve({ ok: false });
      }
    });
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });
}
