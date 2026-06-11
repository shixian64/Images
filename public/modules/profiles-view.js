import { escapeHtml, maskKey } from './dom.js';

export function profileKeyStatus(endpoint) {
  if (endpoint?.hasApiKey === true) return '已配置';
  if (endpoint?.hasApiKey === false) return '未配置';
  return '读取中';
}

export function systemDefaultCardHtml(sys = {}, {
  image = {},
  chat = {},
  systemMode = true,
  loaded = true
} = {}) {
  const statusChip = sys.status === 'active'
    ? '<span class="chip ok">已启用</span>'
    : '<span class="chip err">已停用</span>';
  const loadingChip = loaded ? '' : '<span class="chip">读取中…</span>';
  return `
    <div class="system-default-title">
      <strong>${escapeHtml(sys.name || '系统默认接口')}</strong>
      ${statusChip}
      ${loadingChip}
      <span class="chip info">${systemMode ? '当前生效' : '个人覆盖中'}</span>
    </div>
    <div class="system-default-grid">
      <span>生图</span><code>${escapeHtml(image.baseUrl || '-')}</code><strong>${escapeHtml(image.defaultModel || '-')}</strong><em>${profileKeyStatus(image)}</em>
      <span>对话</span><code>${escapeHtml(chat.baseUrl || '-')}</code><strong>${escapeHtml(chat.defaultModel || '-')}</strong><em>${profileKeyStatus(chat)}</em>
    </div>
  `;
}

export function profileListHtml(profiles = [], { activeId = '' } = {}) {
  return (Array.isArray(profiles) ? profiles : []).map((profile = {}) => {
    const active = profile.id === activeId ? ' active' : '';
    return `<li>
      <button class="profile-item${active}" data-id="${escapeHtml(profile.id)}">
        <strong>${escapeHtml(profile.name || '未命名')}</strong>
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
    <div><span>生效模式</span><strong>${systemMode ? '系统默认' : '个人覆盖'}</strong></div>
    <div><span>个人接口数</span><strong>${list.length}</strong></div>
    <div><span>启用接口</span><strong>${activeCount}</strong></div>
    <div><span>当前接口</span><strong>${escapeHtml(effectiveProfile?.name || '未命名')}</strong></div>
    <div><span>生图模型</span><strong>${escapeHtml(image.defaultModel || '-')}</strong></div>
    <div><span>对话模型</span><strong>${escapeHtml(chat.defaultModel || '-')}</strong></div>
    <div><span>生图密钥</span><strong>${escapeHtml(systemMode ? profileKeyStatus(image) : maskKey(image.apiKey))}</strong></div>
    <div><span>对话密钥</span><strong>${escapeHtml(systemMode ? profileKeyStatus(chat) : maskKey(chat.apiKey))}</strong></div>
  `;
}

export function endpointTestResultView(endpoint = {}) {
  if (!endpoint.testStatus || endpoint.testStatus === 'unknown') {
    return { state: 'idle', text: '未测试' };
  }
  if (endpoint.testStatus === 'ok') {
    return { state: 'ok', text: `OK · ${endpoint.testLatencyMs ?? '?'}ms` };
  }
  if (endpoint.testStatus === 'busy') {
    return { state: 'busy', text: '测试中…' };
  }
  return { state: 'err', text: `失败 · ${endpoint.testError || '未知错误'}` };
}
