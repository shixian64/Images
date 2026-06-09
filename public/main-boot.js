// HTML 解析阶段执行：同步主题并隐藏主界面，避免未登录状态下闪现应用内容。
// 默认 'light' 必须与 modules/theme.js 保持一致。
try {
  var t = localStorage.getItem('image-key-manager.theme');
  if (t !== 'dark' && t !== 'light' && t !== 'system') t = 'light';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

// 只在 app.js 确认已登录后移除；未登录/慢网络时不能用超时兜底显示主界面。
document.documentElement.classList.add('auth-pending');

// 如果 app.js 或其子模块加载失败，至少给出错误提示而不是一直显示“确认中”。
setTimeout(function () {
  if (document.documentElement.classList.contains('auth-pending') &&
      !document.documentElement.getAttribute('data-auth-state')) {
    document.documentElement.setAttribute('data-auth-state', 'error');
  }
}, 10000);
