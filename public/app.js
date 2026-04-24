// 入口：装配各模块，不做业务。
// 模块拆分对应 docs §13.1 第 3 条。

import { mountNav } from './modules/nav.js';
import { mountTheme } from './modules/theme.js';
import { mountStudioPanel, loadPromptFromLog } from './modules/studio.js';
import { mountProfilesPanel } from './modules/profiles.js';
import { mountGalleryPanel, refreshGalleryPanel } from './modules/gallery.js';
import { mountLogsPanel } from './modules/logs.js';
import { switchTab } from './modules/nav.js';

mountTheme();
mountNav();
mountProfilesPanel();
mountGalleryPanel();
mountStudioPanel({
  onSavedImages: () => refreshGalleryPanel({ silent: true })
});
mountLogsPanel({
  onReusePrompt: (prompt) => {
    loadPromptFromLog(prompt);
    switchTab('studioPanel');
  }
});
