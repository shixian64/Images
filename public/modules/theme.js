// Theme toggle: system → light → dark → system.
// Corresponds to the first-class dark mode design.

import { $ } from './dom.js';
import { t } from './i18n.js';
import { KEYS, readString, writeString } from './state.js';

// Click order; the first item is also the default when storage is empty.
const ORDER = ['light', 'dark', 'system'];
const ICONS = { system: '◐', light: '☀', dark: '☾' };

export function themeModeLabel(mode) {
  return t(`theme.mode.${mode}`, {}, String(mode || ''));
}

export function themeToggleTitle(mode) {
  return t('theme.toggle.title', { mode: themeModeLabel(mode) });
}

function apply(mode) {
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
  const icon = document.querySelector('[data-theme-icon]');
  if (icon) icon.textContent = ICONS[mode] || ICONS.system;
  const btn = $('themeToggle');
  if (btn) btn.title = themeToggleTitle(mode);
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
