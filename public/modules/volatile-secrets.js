import { confirm } from './dialog.js';

const SESSION_KEY = 'image-key-manager.customKeyVolatileConfirm.v1';

function confirmedThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberConfirmation() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
}

export async function confirmVolatileCustomKeyUse({
  title = '确认使用个人 API Key 入队',
  taskLabel = '后台任务'
} = {}) {
  if (confirmedThisSession()) return true;
  const ok = await confirm({
    title,
    message: `当前使用个人接口配置提交${taskLabel}。个人 API Key 只保存在当前页面内存，并只会临时交给当前服务进程；如果页面刷新、服务重启或任务排队过久，任务可能无法继续。`,
    confirmText: '我知道，继续入队',
    cancelText: '取消'
  });
  if (ok) rememberConfirmation();
  return ok;
}
