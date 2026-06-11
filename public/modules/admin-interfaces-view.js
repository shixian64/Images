import { escapeHtml } from './dom.js';

export const DEFAULT_INTERFACE_BASE_URL = 'https://api.openai.com';

export function globalEndpointConfig(globalInterface = null, kind = 'image') {
  const endpoint = globalInterface?.[kind] || {};
  return {
    baseUrl: endpoint.baseUrl || DEFAULT_INTERFACE_BASE_URL,
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

export function interfaceKeyState(endpoint = {}) {
  if (endpoint.hasApiKey === true) return '已配置';
  if (endpoint.hasApiKey === false) return '未配置';
  return '未知';
}

export function globalEndpointTestView(endpoint = {}) {
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    return { state: 'idle', text: '未测试' };
  }
  if (endpoint.testStatus === 'ok') {
    return { state: 'ok', text: `OK · ${endpoint.testLatencyMs ?? '?'}ms` };
  }
  if (endpoint.testStatus === 'busy') {
    return { state: 'busy', text: '测试中…' };
  }
  return {
    state: 'err',
    text: `失败 · ${endpoint.secretError || endpoint.testError || '未知错误'}`
  };
}

export function globalInterfaceSummaryHtml(globalInterface = null) {
  if (!globalInterface) return '<span class="chip">尚未加载</span>';
  const image = globalEndpointConfig(globalInterface, 'image');
  const chat = globalEndpointConfig(globalInterface, 'chat');
  return `
    <span class="chip ${globalInterface.enabled === false ? 'error' : 'ok'}">${globalInterface.enabled === false ? '停用' : '启用'}</span>
    <span class="chip info">${escapeHtml(globalInterface.name || '系统默认')}</span>
    <span class="chip">生图 Key：${interfaceKeyState(image)}</span>
    <span class="chip">对话 Key：${interfaceKeyState(chat)}</span>
    <span class="chip">生图模型：${escapeHtml(image.defaultModel || '-')}</span>
    <span class="chip">对话模型：${escapeHtml(chat.defaultModel || '-')}</span>
  `;
}

export function globalInterfaceErrorHtml(message) {
  return `<span class="chip error">加载失败：${escapeHtml(message || '未知错误')}</span>`;
}
