// 入口：装配各模块，不做业务。
// 模块拆分对应 docs §13.1 第 3 条。

import { mountNav } from './modules/nav.js';
import { mountTheme } from './modules/theme.js';
import { mountStudioPanel, loadPromptFromLog } from './modules/studio.js';
import { mountPromptPanel } from './modules/prompts.js';
import { mountProfilesPanel } from './modules/profiles.js';
import { mountGalleryPanel, refreshGalleryPanel } from './modules/gallery.js';
import { mountLogsPanel } from './modules/logs.js';
import { switchTab } from './modules/nav.js';
import { getMe, setCurrentUser } from './modules/auth.js';
import { mountProfileMenu } from './modules/profile.js';
import { mountUsersPanel } from './modules/users.js';
import { mountSelectEnhancer } from './modules/selects.js';
import { mountJobQueue } from './modules/jobs.js';

// why：入口先确认登录态，未登录立即跳转，避免后续模块触发 401 噪音。
const me = await getMe();
if (!me) {
  location.replace('/login.html');
  // 如果跳转被浏览器/插件拦截，避免页面永久停留在隐藏态。
  setTimeout(() => document.documentElement.classList.remove('auth-pending'), 800);
  await new Promise(() => {});
}
setCurrentUser(me);
document.documentElement.classList.remove('auth-pending');

mountTheme();
mountProfileMenu(me);
if (me.role === 'admin') {
  document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = false; });
}
mountNav();
mountProfilesPanel();
mountGalleryPanel();
mountStudioPanel({
  onSavedImages: () => refreshGalleryPanel({ silent: true })
});
mountJobQueue();
mountPromptPanel({
  onUsePrompt: (prompt) => {
    loadPromptFromLog(prompt);
    switchTab('studioPanel');
  }
});
mountLogsPanel();

if (me.role === 'admin') {
  mountUsersPanel();
}

mountSelectEnhancer();
