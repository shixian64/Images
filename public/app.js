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
  location.href = '/login.html';
  // 终止后续初始化；location 赋值后新页面即将接管，body 保持隐藏避免主界面闪现。
  throw new Error('unauthenticated');
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
