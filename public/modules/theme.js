// 主题切换：system → light → dark → system
// 对应 §5.1 深色模式一等公民。

import { $ } from './dom.js';
import { KEYS, readString, writeString } from './state.js';

// 顺序决定点击切换的路径；第一个也是无存储时的默认（浅色）。
const ORDER = ['light', 'dark', 'system'];
const ICONS = { system: '◐', light: '☀', dark: '☾' };
const LABELS = { system: '跟随系统', light: '浅色', dark: '深色' };

function apply(mode) {
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
  const icon = document.querySelector('[data-theme-icon]');
  if (icon) icon.textContent = ICONS[mode] || ICONS.system;
  const btn = $('themeToggle');
  if (btn) btn.title = `主题：${LABELS[mode] || mode}（点击切换）`;
}

export function mountTheme() {
  let mode = readString(KEYS.theme, 'light');
  if (!ORDER.includes(mode)) mode = 'light';
  apply(mode);
  $('themeToggle')?.addEventListener('click', () => {
    const idx = ORDER.indexOf(mode);
    mode = ORDER[(idx + 1) % ORDER.length];
    writeString(KEYS.theme, mode);
    apply(mode);
  });
}
