// 全局下拉增强：保留原生 select 作为数据源，额外渲染统一视觉的弹层。

import { customSelectMenuHtml, selectOptionLabel } from './selects-view.js';

const instances = new WeakMap();
const allInstances = new Set();
let activeInstance = null;
let mounted = false;
let nativeSettersPatched = false;
let selectUid = 0;

function isEnhanceable(select) {
  if (!(select instanceof HTMLSelectElement)) return false;
  if (select.multiple) return false;
  const size = Number(select.getAttribute('size') || 1);
  if (size > 1) return false;
  return select.dataset.nativeSelect !== 'true';
}

function optionLabel(option) {
  return selectOptionLabel(option);
}

function flattenOptions(select) {
  const out = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptionElement) {
      out.push({ option: child, group: '' });
      continue;
    }
    if (child instanceof HTMLOptGroupElement) {
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) {
          out.push({ option, group: child.label || '' });
        }
      }
    }
  }
  return out;
}

function selectedOption(select) {
  return select.selectedOptions?.[0] || select.options?.[select.selectedIndex] || select.options?.[0] || null;
}

function closeSelect(instance, { restoreFocus = false } = {}) {
  if (!instance) return;
  instance.wrap.classList.remove('is-open', 'drop-up', 'align-right');
  instance.trigger.setAttribute('aria-expanded', 'false');
  instance.menu.hidden = true;
  instance.activeIndex = -1;
  if (activeInstance === instance) activeInstance = null;
  if (restoreFocus) instance.trigger.focus({ preventScroll: true });
}

function closeActive({ restoreFocus = false } = {}) {
  closeSelect(activeInstance, { restoreFocus });
}

function setActiveOption(instance, index) {
  const options = Array.from(instance.menu.querySelectorAll('.custom-select-option:not([aria-disabled="true"])'));
  if (!options.length) return;

  const bounded = ((index % options.length) + options.length) % options.length;
  options.forEach((btn, i) => btn.classList.toggle('is-active', i === bounded));
  instance.activeIndex = bounded;
  options[bounded].focus({ preventScroll: true });
  options[bounded].scrollIntoView({ block: 'nearest' });
}

function positionMenu(instance) {
  const rect = instance.trigger.getBoundingClientRect();
  const estimatedHeight = Math.min(instance.menu.scrollHeight || 260, 280);
  const estimatedWidth = Math.max(rect.width, 180);
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  instance.wrap.classList.toggle('drop-up', below < Math.min(estimatedHeight, 220) && above > below);
  instance.wrap.classList.toggle('align-right', rect.left + estimatedWidth > window.innerWidth - 12);
}

function openSelect(instance) {
  if (instance.select.disabled) return;
  if (activeInstance && activeInstance !== instance) closeSelect(activeInstance);

  syncSelect(instance.select);
  instance.menu.hidden = false;
  instance.wrap.classList.add('is-open');
  instance.trigger.setAttribute('aria-expanded', 'true');
  activeInstance = instance;
  positionMenu(instance);

  const selected = instance.menu.querySelector('.custom-select-option[aria-selected="true"]:not([aria-disabled="true"])')
    || instance.menu.querySelector('.custom-select-option:not([aria-disabled="true"])');
  const options = Array.from(instance.menu.querySelectorAll('.custom-select-option:not([aria-disabled="true"])'));
  setActiveOption(instance, Math.max(0, options.indexOf(selected)));
}

function commitOption(instance, optionIndex) {
  const option = instance.select.options[optionIndex];
  if (!option || option.disabled) return;
  const prevValue = instance.select.value;
  const prevIndex = instance.select.selectedIndex;
  instance.select.selectedIndex = optionIndex;
  syncSelect(instance.select);
  closeSelect(instance, { restoreFocus: true });

  if (instance.select.value !== prevValue || instance.select.selectedIndex !== prevIndex) {
    instance.select.dispatchEvent(new Event('input', { bubbles: true }));
    instance.select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function buildMenu(instance) {
  const { select, menu } = instance;
  const items = flattenOptions(select);
  menu.innerHTML = customSelectMenuHtml(items.map(({ option, group }) => ({
    index: Array.prototype.indexOf.call(select.options, option),
    group,
    label: optionLabel(option),
    value: option.value,
    selected: option.selected,
    disabled: option.disabled,
    hidden: option.hidden
  })));
}

export function syncSelect(select) {
  const instance = instances.get(select);
  if (!instance) return;

  buildMenu(instance);
  const option = selectedOption(select);
  const label = option ? optionLabel(option) : '请选择';
  instance.label.textContent = label;
  instance.trigger.title = label;
  instance.trigger.tabIndex = select.disabled ? -1 : 0;
  instance.trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
  instance.wrap.classList.toggle('is-disabled', select.disabled);
  instance.wrap.classList.toggle('is-empty', !option);

  if (activeInstance === instance) positionMenu(instance);
}

function onTriggerKeydown(instance, ev) {
  if (instance.select.disabled) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    openSelect(instance);
  }
}

function onMenuKeydown(instance, ev) {
  const options = Array.from(instance.menu.querySelectorAll('.custom-select-option:not([aria-disabled="true"])'));
  if (!options.length) return;

  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeSelect(instance, { restoreFocus: true });
    return;
  }
  if (ev.key === 'Tab') {
    closeSelect(instance);
    return;
  }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const delta = ev.key === 'ArrowDown' ? 1 : -1;
    setActiveOption(instance, (instance.activeIndex < 0 ? 0 : instance.activeIndex) + delta);
    return;
  }
  if (ev.key === 'Home') {
    ev.preventDefault();
    setActiveOption(instance, 0);
    return;
  }
  if (ev.key === 'End') {
    ev.preventDefault();
    setActiveOption(instance, options.length - 1);
    return;
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    const active = instance.menu.querySelector('.custom-select-option.is-active:not([aria-disabled="true"])')
      || document.activeElement?.closest?.('.custom-select-option:not([aria-disabled="true"])');
    if (active) commitOption(instance, Number(active.dataset.optionIndex));
  }
}

function enhanceSelect(select) {
  if (!isEnhanceable(select) || instances.has(select)) return;

  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  if (select.classList.contains('users-role-select')) wrap.classList.add('custom-select--compact');
  if (select.closest('.inline-label')) wrap.classList.add('custom-select--inline');

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('role', 'button');
  trigger.tabIndex = 0;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const labelText = select.getAttribute('aria-label')
    || select.closest('label')?.querySelector('span')?.textContent?.trim()
    || select.name
    || '下拉选择';
  trigger.setAttribute('aria-label', labelText);

  const label = document.createElement('span');
  label.className = 'custom-select-value';
  const arrow = document.createElement('span');
  arrow.className = 'custom-select-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(label, arrow);

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.id = select.id ? `${select.id}-select-menu` : `custom-select-menu-${++selectUid}`;
  trigger.setAttribute('aria-controls', menu.id);
  menu.hidden = true;

  wrap.append(trigger, menu);
  select.insertAdjacentElement('afterend', wrap);
  select.classList.add('select-native-hidden');
  select.dataset.enhancedSelect = 'true';
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const instance = { select, wrap, trigger, label, menu, activeIndex: -1 };
  instances.set(select, instance);
  allInstances.add(instance);

  trigger.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (wrap.classList.contains('is-open')) closeSelect(instance);
    else openSelect(instance);
  });
  trigger.addEventListener('keydown', (ev) => onTriggerKeydown(instance, ev));
  menu.addEventListener('keydown', (ev) => onMenuKeydown(instance, ev));
  menu.addEventListener('click', (ev) => {
    ev.preventDefault();
    const option = ev.target.closest('.custom-select-option');
    if (!option || option.getAttribute('aria-disabled') === 'true') return;
    commitOption(instance, Number(option.dataset.optionIndex));
  });
  select.addEventListener('change', () => syncSelect(select));

  syncSelect(select);
}

function patchNativeSetters() {
  if (nativeSettersPatched) return;
  nativeSettersPatched = true;

  for (const prop of ['value', 'selectedIndex']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    if (!descriptor?.get || !descriptor?.set) continue;
    if (descriptor.configurable === false) continue;
    Object.defineProperty(HTMLSelectElement.prototype, prop, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(next) {
        descriptor.set.call(this, next);
        if (instances.has(this)) queueMicrotask(() => syncSelect(this));
      }
    });
  }
}

function enhanceSelects(root = document) {
  if (root instanceof HTMLSelectElement) {
    enhanceSelect(root);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;
  root.querySelectorAll?.('select').forEach(enhanceSelect);
}

function destroySelect(select) {
  const instance = instances.get(select);
  if (!instance) return;
  closeSelect(instance);
  allInstances.delete(instance);
  instances.delete(select);
}

function destroySelects(root) {
  if (root instanceof HTMLSelectElement) {
    destroySelect(root);
    return;
  }
  if (!(root instanceof Element)) return;
  root.querySelectorAll?.('select').forEach(destroySelect);
}

function handleMutations(mutations) {
  const dirty = new Set();

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      if (mutation.target instanceof HTMLSelectElement) dirty.add(mutation.target);
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLSelectElement) enhanceSelect(node);
        enhanceSelects(node);
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;
        destroySelects(node);
      }
      continue;
    }

    const target = mutation.target;
    if (target instanceof HTMLSelectElement) {
      if (!instances.has(target)) enhanceSelect(target);
      dirty.add(target);
    } else if (target instanceof HTMLOptionElement && target.parentElement instanceof HTMLSelectElement) {
      dirty.add(target.parentElement);
    }
  }

  dirty.forEach(syncSelect);
}

export function mountSelectEnhancer(root = document) {
  patchNativeSetters();
  enhanceSelects(root);
  if (mounted) return;
  mounted = true;

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'label', 'value', 'hidden']
  });

  document.addEventListener('click', (ev) => {
    if (!activeInstance) return;
    if (activeInstance.wrap.contains(ev.target)) return;
    closeSelect(activeInstance);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeActive({ restoreFocus: true });
  });
  window.addEventListener('select-enhancer:sync', () => {
    allInstances.forEach((instance) => syncSelect(instance.select));
  });
  window.addEventListener('resize', () => closeActive());
  window.addEventListener('scroll', () => closeActive());
}
