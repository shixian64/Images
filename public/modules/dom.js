// DOM 基础工具。统一 $, escape, mask，避免各模块各写一遍。

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

// 前端日志 / 展示用的脱敏，与 server 保持一致的外观。
export function maskKey(key) {
  const value = String(key || '');
  if (!value) return '未填写 Key';
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

// 简易 toast（写入 status-chip）。超出重复写入会自动清理。
let statusResetTimer = null;
export function setStatus(text, state = 'ready', autoResetMs = 0) {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
  if (statusResetTimer) clearTimeout(statusResetTimer);
  if (autoResetMs > 0) {
    statusResetTimer = setTimeout(() => {
      el.textContent = '就绪';
      el.dataset.state = 'ready';
    }, autoResetMs);
  }
}
