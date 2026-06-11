import { t } from './i18n.js';

// Shared DOM helpers for $, escaping, and masking.

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

// Frontend log/display masking; keep the same visible shape as the server.
export function maskKey(key) {
  const value = String(key || '');
  if (!value) return t('dom.maskKey.empty');
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function numberOrEmpty(value) {
  return value === undefined || value === null || value === '' ? '' : Number(value);
}

export function readNumber(id) {
  const value = $(id)?.value;
  return value === '' || value == null ? '' : Number(value);
}

// Lightweight toast helper that writes into the status chip and can auto-reset.
let statusResetTimer = null;
export function setStatus(text, state = 'ready', autoResetMs = 0) {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
  if (statusResetTimer) clearTimeout(statusResetTimer);
  if (autoResetMs > 0) {
    statusResetTimer = setTimeout(() => {
      el.textContent = t('dom.status.ready');
      el.dataset.state = 'ready';
    }, autoResetMs);
  }
}
