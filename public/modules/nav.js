// Tab 切换 + 记忆 + 快捷键（G S / G M / G V / G T / G G / G P / G L）。对应 §5.1 键盘友好。

import { $, $$ } from './dom.js';
import { KEYS, readString, writeString } from './state.js';

const FALLBACK_TAB_IDS = ['studioPanel', 'comicPanel', 'videoPanel', 'promptPanel', 'galleryPanel', 'configPanel', 'logsPanel', 'usersPanel'];

function availableTabIds() {
  const ids = $$('.tab-panel')
    .map((panel) => panel.id)
    .filter(Boolean);
  return ids.length ? ids : FALLBACK_TAB_IDS;
}

export function switchTab(tabId) {
  if (!availableTabIds().includes(tabId)) tabId = 'studioPanel';
  const targetPanel = $(tabId);
  if (!targetPanel || targetPanel.hidden) tabId = 'studioPanel';
  $$('.tab-button').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
  writeString(KEYS.activeTab, tabId);
  document.dispatchEvent(new CustomEvent('app-tab-changed', { detail: { tabId } }));
}

export function mountNav() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('.tab-button, .tab-link');
    if (!btn) return;
    ev.preventDefault();
    switchTab(btn.dataset.tab);
  });
  switchTab(readString(KEYS.activeTab, 'studioPanel'));

  // 键盘序列 G + S/M/V/T/G/P/L/U
  let pending = false;
  let pendingTimer = null;
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target;
    // 在输入区不要触发
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (!pending && k === 'g') {
      pending = true;
      pendingTimer = setTimeout(() => { pending = false; }, 900);
      return;
    }
    if (pending) {
      pending = false;
      clearTimeout(pendingTimer);
      if (k === 's') switchTab('studioPanel');
      else if (k === 'm') switchTab('comicPanel');
      else if (k === 'v') switchTab('videoPanel');
      else if (k === 't') switchTab('promptPanel');
      else if (k === 'g') switchTab('galleryPanel');
      else if (k === 'p') switchTab('configPanel');
      else if (k === 'l') switchTab('logsPanel');
      else if (k === 'u') switchTab('usersPanel');
    }
  });
}
