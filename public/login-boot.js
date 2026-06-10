// 与主界面一致地同步应用 localStorage 中保存的主题，避免登录页永远跟随系统色。
// 默认 'light' 必须与 modules/theme.js 保持一致。
try {
  var t = localStorage.getItem('image-studio.theme');
  if (!t) {
    t = localStorage.getItem('image-key-manager.theme');
    if (t) localStorage.setItem('image-studio.theme', t);
  }
  if (t !== 'dark' && t !== 'light' && t !== 'system') t = 'light';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
