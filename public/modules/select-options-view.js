import { escapeHtml } from './dom.js';

export function optionValue(item = {}) {
  return item.value ?? item.id ?? '';
}

export function optionLabel(item = {}) {
  const value = optionValue(item);
  return item.label ?? value;
}

export function selectOptionsHtml(items = [], { selectedValue = '' } = {}) {
  const selectedText = selectedValue === undefined || selectedValue === null ? '' : String(selectedValue);
  return (Array.isArray(items) ? items : [])
    .map((item = {}) => {
      const value = optionValue(item);
      const label = optionLabel(item);
      const selected = selectedText && selectedText === String(value) ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}
