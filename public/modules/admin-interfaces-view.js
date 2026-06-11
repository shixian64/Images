import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

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
  if (endpoint.hasApiKey === true) return t('admin.interfaces.key.configured');
  if (endpoint.hasApiKey === false) return t('admin.interfaces.key.missing');
  return t('admin.interfaces.key.unknown');
}

export function globalEndpointTestView(endpoint = {}) {
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    return { state: 'idle', text: t('admin.interfaces.test.untested') };
  }
  if (endpoint.testStatus === 'ok') {
    return { state: 'ok', text: `OK · ${endpoint.testLatencyMs ?? '?'}ms` };
  }
  if (endpoint.testStatus === 'busy') {
    return { state: 'busy', text: t('admin.interfaces.test.busy') };
  }
  return {
    state: 'err',
    text: t('admin.interfaces.test.failed', {
      error: endpoint.secretError || endpoint.testError || t('common.unknownError')
    })
  };
}

export function globalInterfaceSummaryHtml(globalInterface = null) {
  if (!globalInterface) return `<span class="chip">${escapeHtml(t('admin.interfaces.summary.notLoaded'))}</span>`;
  const image = globalEndpointConfig(globalInterface, 'image');
  const chat = globalEndpointConfig(globalInterface, 'chat');
  const imageKeyState = interfaceKeyState(image);
  const chatKeyState = interfaceKeyState(chat);
  return `
    <span class="chip ${globalInterface.enabled === false ? 'error' : 'ok'}">${escapeHtml(globalInterface.enabled === false ? t('admin.interfaces.summary.disabled') : t('admin.interfaces.summary.enabled'))}</span>
    <span class="chip info">${escapeHtml(globalInterface.name || t('admin.interfaces.summary.systemDefault'))}</span>
    <span class="chip">${escapeHtml(t('admin.interfaces.summary.imageKey', { state: imageKeyState }))}</span>
    <span class="chip">${escapeHtml(t('admin.interfaces.summary.chatKey', { state: chatKeyState }))}</span>
    <span class="chip">${escapeHtml(t('admin.interfaces.summary.imageModel', { model: image.defaultModel || t('common.empty') }))}</span>
    <span class="chip">${escapeHtml(t('admin.interfaces.summary.chatModel', { model: chat.defaultModel || t('common.empty') }))}</span>
  `;
}

export function globalInterfaceErrorHtml(message) {
  return `<span class="chip error">${escapeHtml(t('admin.interfaces.error.loadFailed', {
    error: message || t('common.unknownError')
  }))}</span>`;
}
