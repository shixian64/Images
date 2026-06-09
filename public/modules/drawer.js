// 通用右侧抽屉组件。基于 #appDrawer 容器（见 index.html），
// open({ eyebrow, title, body, unsafeHtml, onClose }) 渲染并打开；body 既可是字符串也可是 DOM 节点。
// TAG: hmt---

import { $ } from './dom.js';

let bound = false;
let activeCloseHandler = null;

function renderBody(bodyEl, body, { unsafeHtml = false } = {}) {
  bodyEl.replaceChildren();
  if (body instanceof Node) {
    bodyEl.appendChild(body);
  } else if (unsafeHtml) {
    bodyEl.innerHTML = String(body || '');
  } else {
    bodyEl.textContent = String(body || '');
  }
}

function ensureContainer() {
  return $('appDrawer');
}

function bindOnce() {
  if (bound) return;
  const wrap = ensureContainer();
  if (!wrap) return;
  bound = true;
  wrap.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-drawer-close]')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !wrap.hidden) close();
  });
}

export function open({ eyebrow = '', title = '详情', body = '', unsafeHtml = false, onClose } = {}) {
  const wrap = ensureContainer();
  if (!wrap) return;
  bindOnce();

  const eyebrowEl = $('appDrawerEyebrow');
  const titleEl = $('appDrawerTitle');
  const bodyEl = $('appDrawerBody');
  if (eyebrowEl) eyebrowEl.textContent = eyebrow || '';
  if (titleEl) titleEl.textContent = title || '详情';
  if (bodyEl) {
    renderBody(bodyEl, body, { unsafeHtml });
  }

  wrap.hidden = false;
  wrap.removeAttribute('aria-hidden');
  document.body.classList.add('drawer-open');
  activeCloseHandler = typeof onClose === 'function' ? onClose : null;
}

export function update({ body, unsafeHtml = false } = {}) {
  const bodyEl = $('appDrawerBody');
  if (!bodyEl) return;
  renderBody(bodyEl, body, { unsafeHtml });
}

export function close() {
  const wrap = ensureContainer();
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  wrap.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  if (activeCloseHandler) {
    try { activeCloseHandler(); } catch { /* ignore */ }
    activeCloseHandler = null;
  }
}
