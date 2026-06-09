// 登录页不依赖 modules/auth.js，避免循环 import；最小 fetch 即可。
const $ = (sel) => document.querySelector(sel);
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const errorBox = $('#authError');
const switchBtn = $('#switchMode');
const title = document.querySelector('[data-auth-title]');
const switchHint = document.querySelector('[data-switch-hint]');
const switchLabel = document.querySelector('[data-switch-label]');

let mode = 'login';

function showError(msg) {
  if (!msg) {
    errorBox.hidden = true;
    errorBox.textContent = '';
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function setMode(next) {
  mode = next;
  showError('');
  if (mode === 'login') {
    loginForm.hidden = false;
    registerForm.hidden = true;
    title.textContent = '登录';
    switchHint.textContent = '还没有账号？';
    switchLabel.textContent = '去注册';
  } else {
    loginForm.hidden = true;
    registerForm.hidden = false;
    title.textContent = '注册';
    switchHint.textContent = '已有账号？';
    switchLabel.textContent = '去登录';
  }
}

switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'fetch'
    },
    body: JSON.stringify(body)
  });
}

async function handleResponse(resp) {
  if (resp.ok) {
    location.href = '/';
    return;
  }
  let msg = `请求失败 (HTTP ${resp.status})`;
  try {
    const data = await resp.json();
    if (data?.error) msg = String(data.error);
  } catch {}
  showError(msg);
}

loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  showError('');
  const fd = new FormData(loginForm);
  const login = String(fd.get('login') || '').trim();
  const password = String(fd.get('password') || '');
  if (!login || !password) {
    showError('请填写用户名/邮箱和密码');
    return;
  }
  const btn = loginForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const resp = await postJson('/api/auth/login', { login, password });
    await handleResponse(resp);
  } catch (err) {
    showError(err?.message || '网络错误');
  } finally {
    btn.disabled = false;
  }
});

registerForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  showError('');
  const fd = new FormData(registerForm);
  const username = String(fd.get('username') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const confirmPassword = String(fd.get('confirmPassword') || '');
  const adminBootstrapToken = String(fd.get('adminBootstrapToken') || '');
  const registrationCode = String(fd.get('registrationCode') || '');
  const website = String(fd.get('website') || '');

  // 前端最小校验，服务端会再校验一次。
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    showError('用户名格式不正确');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('邮箱格式不正确');
    return;
  }
  if (password.length < 8) {
    showError('密码至少 8 位');
    return;
  }
  if (password !== confirmPassword) {
    showError('两次密码不一致');
    return;
  }

  const btn = registerForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const payload = { username, email, password, website };
    if (adminBootstrapToken) payload.adminBootstrapToken = adminBootstrapToken;
    if (registrationCode) payload.registrationCode = registrationCode;
    const resp = await postJson('/api/auth/register', payload);
    await handleResponse(resp);
  } catch (err) {
    showError(err?.message || '网络错误');
  } finally {
    btn.disabled = false;
  }
});
