// 管理后台：系统默认接口配置。

import { $, escapeHtml, setStatus } from './dom.js';
import { apiFetch } from './auth.js';

const DEFAULT_BASE_URL = 'https://api.openai.com';

let globalInterface = null;
let globalInterfaceLoaded = false;

function globalEndpoint(kind) {
  const endpoint = globalInterface?.[kind] || {};
  return {
    baseUrl: endpoint.baseUrl || DEFAULT_BASE_URL,
    apiKey: '',
    hasApiKey: endpoint.hasApiKey === undefined ? null : Boolean(endpoint.hasApiKey),
    maskedApiKey: endpoint.maskedApiKey || '',
    defaultModel: endpoint.defaultModel || (kind === 'chat' ? 'gpt-5.5' : 'gpt-image-2'),
    testStatus: endpoint.testStatus || 'unknown',
    testLatencyMs: endpoint.testLatencyMs ?? null,
    testedAt: endpoint.testedAt || null,
    testError: endpoint.testError || '',
    secretError: endpoint.secretError || ''
  };
}

function keyState(endpoint) {
  if (endpoint.hasApiKey === true) return '已配置';
  if (endpoint.hasApiKey === false) return '未配置';
  return '未知';
}

function renderGlobalEndpointTest(kind) {
  const prefix = kind === 'chat' ? 'globalChat' : 'globalImage';
  const endpoint = globalEndpoint(kind);
  const el = $(`${prefix}TestResult`);
  if (!el) return;
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    el.dataset.state = 'idle';
    el.textContent = '未测试';
  } else if (endpoint.testStatus === 'ok') {
    el.dataset.state = 'ok';
    el.textContent = `OK · ${endpoint.testLatencyMs ?? '?'}ms`;
  } else if (endpoint.testStatus === 'busy') {
    el.dataset.state = 'busy';
    el.textContent = '测试中…';
  } else {
    el.dataset.state = 'err';
    el.textContent = `失败 · ${endpoint.secretError || endpoint.testError || '未知错误'}`;
  }
}

function renderGlobalInterfaceSummary() {
  const host = $('globalInterfaceSummary');
  if (!host) return;
  if (!globalInterface) {
    host.innerHTML = '<span class="chip">尚未加载</span>';
    return;
  }
  const image = globalEndpoint('image');
  const chat = globalEndpoint('chat');
  host.innerHTML = `
    <span class="chip ${globalInterface.enabled === false ? 'error' : 'ok'}">${globalInterface.enabled === false ? '停用' : '启用'}</span>
    <span class="chip info">${escapeHtml(globalInterface.name || '系统默认')}</span>
    <span class="chip">生图 Key：${keyState(image)}</span>
    <span class="chip">对话 Key：${keyState(chat)}</span>
    <span class="chip">生图模型：${escapeHtml(image.defaultModel || '-')}</span>
    <span class="chip">对话模型：${escapeHtml(chat.defaultModel || '-')}</span>
  `;
}

function renderGlobalInterfaceForm() {
  if (!globalInterface) return;
  const image = globalEndpoint('image');
  const chat = globalEndpoint('chat');

  const enabled = $('globalInterfaceEnabled');
  if (enabled) enabled.checked = globalInterface.enabled !== false;
  if ($('globalInterfaceName')) $('globalInterfaceName').value = globalInterface.name || '系统默认';
  if ($('globalImageBaseUrl')) $('globalImageBaseUrl').value = image.baseUrl || DEFAULT_BASE_URL;
  if ($('globalImageDefaultModel')) $('globalImageDefaultModel').value = image.defaultModel || 'gpt-image-2';
  if ($('globalChatBaseUrl')) $('globalChatBaseUrl').value = chat.baseUrl || DEFAULT_BASE_URL;
  if ($('globalChatDefaultModel')) $('globalChatDefaultModel').value = chat.defaultModel || 'gpt-5.5';

  const imageKey = $('globalImageApiKey');
  const chatKey = $('globalChatApiKey');
  if (imageKey) {
    imageKey.value = '';
    imageKey.placeholder = image.hasApiKey ? '已配置；留空保留现有密钥' : '未配置；请输入 API Key';
  }
  if (chatKey) {
    chatKey.value = '';
    chatKey.placeholder = chat.hasApiKey ? '已配置；留空保留现有密钥' : '未配置；请输入 API Key';
  }
  renderGlobalEndpointTest('image');
  renderGlobalEndpointTest('chat');
  renderGlobalInterfaceSummary();
}

export async function refreshGlobalInterface({ silent = false } = {}) {
  try {
    const resp = await apiFetch('/api/admin/interfaces/default');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    globalInterface = data.default || {};
    globalInterfaceLoaded = true;
    renderGlobalInterfaceForm();
    if (!silent) setStatus('全局默认接口已刷新', 'ok', 1400);
  } catch (err) {
    const host = $('globalInterfaceSummary');
    if (host) host.innerHTML = `<span class="chip error">加载失败：${escapeHtml(err?.message || String(err))}</span>`;
    setStatus(`加载接口配置失败：${err?.message || err}`, 'err', 2400);
  }
}

export function ensureGlobalInterfaceLoaded(options = {}) {
  if (globalInterfaceLoaded) {
    renderGlobalInterfaceForm();
    return Promise.resolve(globalInterface);
  }
  return refreshGlobalInterface(options);
}

function readGlobalInterfaceForm() {
  const imageKey = $('globalImageApiKey')?.value.trim() || '';
  const chatKey = $('globalChatApiKey')?.value.trim() || '';
  const body = {
    enabled: Boolean($('globalInterfaceEnabled')?.checked),
    name: $('globalInterfaceName')?.value.trim() || '系统默认',
    image: {
      baseUrl: $('globalImageBaseUrl')?.value.trim() || DEFAULT_BASE_URL,
      defaultModel: $('globalImageDefaultModel')?.value.trim() || 'gpt-image-2'
    },
    chat: {
      baseUrl: $('globalChatBaseUrl')?.value.trim() || DEFAULT_BASE_URL,
      defaultModel: $('globalChatDefaultModel')?.value.trim() || 'gpt-5.5'
    }
  };
  if (imageKey) body.image.apiKey = imageKey;
  if (chatKey) body.chat.apiKey = chatKey;
  return body;
}

async function saveGlobalInterface({ silent = false } = {}) {
  const body = readGlobalInterfaceForm();
  try {
    const resp = await apiFetch('/api/admin/interfaces/default', {
      method: 'PUT',
      body
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    globalInterface = data.default || {};
    globalInterfaceLoaded = true;
    renderGlobalInterfaceForm();
    window.dispatchEvent(new CustomEvent('system-default-interface-updated'));
    if (!silent) setStatus('全局默认接口已保存', 'ok', 1600);
    return true;
  } catch (err) {
    setStatus(`保存接口配置失败：${err?.message || err}`, 'err', 2400);
    return false;
  }
}

async function testGlobalInterface(kind) {
  const ok = await saveGlobalInterface({ silent: true });
  if (!ok) return;
  const label = kind === 'chat' ? '对话' : '生图';
  const testEl = $(kind === 'chat' ? 'globalChatTestResult' : 'globalImageTestResult');
  if (testEl) {
    testEl.dataset.state = 'busy';
    testEl.textContent = '测试中…';
  }
  setStatus(`正在测试${label}默认接口…`, 'busy');
  try {
    const resp = await apiFetch('/api/admin/interfaces/default/test', {
      method: 'POST',
      body: { kind }
    });
    const data = await resp.json().catch(() => ({}));
    globalInterface = data.default || globalInterface;
    renderGlobalInterfaceForm();
    window.dispatchEvent(new CustomEvent('system-default-interface-updated'));
    if (!resp.ok || !data.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    setStatus(`${label}默认接口连接成功 · ${data.modelCount} 个模型`, 'ok', 2200);
  } catch (err) {
    renderGlobalInterfaceForm();
    setStatus(`${label}默认接口连接失败：${err?.message || err}`, 'err', 2600);
  }
}

export function bindGlobalInterfacePanel() {
  $('globalInterfaceForm')?.addEventListener('submit', (ev) => ev.preventDefault());
  $('globalInterfaceRefresh')?.addEventListener('click', () => refreshGlobalInterface());
  $('globalInterfaceSave')?.addEventListener('click', () => saveGlobalInterface());
  $('globalTestImage')?.addEventListener('click', () => testGlobalInterface('image'));
  $('globalTestChat')?.addEventListener('click', () => testGlobalInterface('chat'));
}
