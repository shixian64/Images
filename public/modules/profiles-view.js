import { escapeHtml, maskKey } from './dom.js';
import { t } from './i18n.js';

export function profileKeyStatus(endpoint) {
  if (endpoint?.hasApiKey === true) return t('profiles.key.configured');
  if (endpoint?.hasApiKey === false) return t('profiles.key.missing');
  return t('profiles.key.loading');
}

export function systemDefaultCardHtml(sys = {}, {
  image = {},
  chat = {},
  systemMode = true,
  loaded = true
} = {}) {
  const statusChip = sys.status === 'active'
    ? `<span class="chip ok">${escapeHtml(t('profiles.status.enabled'))}</span>`
    : `<span class="chip err">${escapeHtml(t('profiles.status.disabled'))}</span>`;
  const loadingChip = loaded ? '' : `<span class="chip">${escapeHtml(t('profiles.loading'))}</span>`;
  return `
    <div class="system-default-title">
      <strong>${escapeHtml(sys.name || t('profiles.systemDefault.name'))}</strong>
      ${statusChip}
      ${loadingChip}
      <span class="chip info">${escapeHtml(systemMode ? t('profiles.mode.current') : t('profiles.mode.overrideActive'))}</span>
    </div>
    <div class="system-default-grid">
      <span>${escapeHtml(t('profiles.kind.image'))}</span><code>${escapeHtml(image.baseUrl || '-')}</code><strong>${escapeHtml(image.defaultModel || '-')}</strong><em>${escapeHtml(profileKeyStatus(image))}</em>
      <span>${escapeHtml(t('profiles.kind.chat'))}</span><code>${escapeHtml(chat.baseUrl || '-')}</code><strong>${escapeHtml(chat.defaultModel || '-')}</strong><em>${escapeHtml(profileKeyStatus(chat))}</em>
    </div>
  `;
}

export function profileListHtml(profiles = [], { activeId = '' } = {}) {
  return (Array.isArray(profiles) ? profiles : []).map((profile = {}) => {
    const active = profile.id === activeId ? ' active' : '';
    return `<li>
      <button class="profile-item${active}" data-id="${escapeHtml(profile.id)}">
        <strong>${escapeHtml(profile.name || t('profiles.untitled'))}</strong>
      </button>
    </li>`;
  }).join('');
}

export function profileSummaryHtml(profiles = [], {
  effectiveProfile = {},
  image = {},
  chat = {},
  systemMode = true
} = {}) {
  const list = Array.isArray(profiles) ? profiles : [];
  const activeCount = list.filter((profile) => profile?.status === 'active').length;
  return `
    <div><span>${escapeHtml(t('profiles.summary.effectiveMode'))}</span><strong>${escapeHtml(systemMode ? t('profiles.mode.systemDefault') : t('profiles.mode.personalOverride'))}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.personalCount'))}</span><strong>${list.length}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.enabledCount'))}</span><strong>${activeCount}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.currentProfile'))}</span><strong>${escapeHtml(effectiveProfile?.name || t('profiles.untitled'))}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.imageModel'))}</span><strong>${escapeHtml(image.defaultModel || '-')}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.chatModel'))}</span><strong>${escapeHtml(chat.defaultModel || '-')}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.imageKey'))}</span><strong>${escapeHtml(systemMode ? profileKeyStatus(image) : maskKey(image.apiKey))}</strong></div>
    <div><span>${escapeHtml(t('profiles.summary.chatKey'))}</span><strong>${escapeHtml(systemMode ? profileKeyStatus(chat) : maskKey(chat.apiKey))}</strong></div>
  `;
}

export function endpointTestResultView(endpoint = {}) {
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    return { state: 'idle', text: t('profiles.test.untested') };
  }
  if (endpoint.testStatus === 'ok') {
    return { state: 'ok', text: `OK \u00b7 ${endpoint.testLatencyMs ?? '?'}ms` };
  }
  if (endpoint.testStatus === 'busy') {
    return { state: 'busy', text: t('profiles.test.busy') };
  }
  return { state: 'err', text: t('profiles.test.failed', { error: endpoint.testError || t('common.unknownError') }) };
}
