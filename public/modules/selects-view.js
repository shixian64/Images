import { escapeHtml } from './dom.js';

export function selectOptionLabel(option = {}) {
  return option.label || option.text || option.textContent || option.value || '未命名';
}

export function customSelectMenuHtml(items = []) {
  const rows = [];
  let lastGroup = null;

  for (const item of Array.isArray(items) ? items : []) {
    if (item?.hidden) continue;
    const group = item?.group || '';
    if (group && group !== lastGroup) {
      rows.push(`<div class="custom-select-group">${escapeHtml(group)}</div>`);
      lastGroup = group;
    }
    rows.push(`
      <div
        tabindex="-1"
        class="custom-select-option"
        role="option"
        data-option-index="${Number(item?.index) || 0}"
        aria-selected="${item?.selected ? 'true' : 'false'}"
        aria-disabled="${item?.disabled ? 'true' : 'false'}"
      >
        <span>${escapeHtml(selectOptionLabel(item))}</span>
      </div>
    `);
  }

  return rows.join('') || '<div class="custom-select-empty">暂无选项</div>';
}

