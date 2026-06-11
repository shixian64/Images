#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_TIMEOUT_MS = 15_000;

function boolEnv(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ''));
}

export function parseArgs(argv = []) {
  const out = {
    baseUrl: process.env.E2E_BASE_URL || DEFAULT_BASE_URL,
    browser: process.env.E2E_BROWSER || '',
    headed: boolEnv('E2E_HEADED'),
    skipIfMissing: boolEnv('E2E_SKIP_IF_BROWSER_MISSING'),
    screenshot: process.env.E2E_SCREENSHOT || '',
    username: process.env.E2E_USERNAME || '',
    password: process.env.E2E_PASSWORD || '',
    timeoutMs: Number(process.env.E2E_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headed') {
      out.headed = true;
    } else if (arg === '--skip-if-missing') {
      out.skipIfMissing = true;
    } else if (arg === '--base-url') {
      out.baseUrl = argv[++i] || out.baseUrl;
    } else if (arg === '--browser') {
      out.browser = argv[++i] || out.browser;
    } else if (arg === '--screenshot') {
      out.screenshot = argv[++i] || out.screenshot;
    } else if (arg === '--username') {
      out.username = argv[++i] || out.username;
    } else if (arg === '--password') {
      out.password = argv[++i] || out.password;
    } else if (arg === '--timeout-ms') {
      out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  out.timeoutMs = Math.max(1_000, Math.floor(Number(out.timeoutMs) || DEFAULT_TIMEOUT_MS));
  return out;
}

function envPath(name, suffix) {
  const root = process.env[name];
  return root ? join(root, suffix) : '';
}

export function browserCandidates(platform = process.platform) {
  if (platform === 'win32') {
    return [
      envPath('LOCALAPPDATA', 'Google\\Chrome\\Application\\chrome.exe'),
      envPath('PROGRAMFILES', 'Google\\Chrome\\Application\\chrome.exe'),
      envPath('PROGRAMFILES(X86)', 'Google\\Chrome\\Application\\chrome.exe'),
      envPath('LOCALAPPDATA', 'Microsoft\\Edge\\Application\\msedge.exe'),
      envPath('PROGRAMFILES', 'Microsoft\\Edge\\Application\\msedge.exe'),
      envPath('PROGRAMFILES(X86)', 'Microsoft\\Edge\\Application\\msedge.exe')
    ].filter(Boolean);
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
}

export function findBrowser(explicit = '') {
  if (explicit) {
    return /[\\/]/.test(explicit) ? (existsSync(explicit) ? explicit : '') : explicit;
  }
  return browserCandidates().find((candidate) => existsSync(candidate)) || '';
}

function printHelp() {
  console.log(`Usage:
  npm run e2e:smoke -- [--base-url http://127.0.0.1:8787] [--browser chrome.exe] [--headed] [--screenshot out.png]

Runs a dependency-light real-browser smoke test against an already running Image Studio server.
Set E2E_USERNAME and E2E_PASSWORD, or pass --username/--password, to also verify login and the main app shell.
Set E2E_SKIP_IF_BROWSER_MISSING=1 or pass --skip-if-missing to make missing Chrome/Edge a skip instead of a failure.`);
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
    server.on('error', reject);
  });
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
      lastError = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw lastError || new Error(`timed out waiting for ${url}`);
}

async function assertServerReachable(baseUrl, timeoutMs) {
  const url = new URL('/login.html', baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs).unref?.();
  try {
    const resp = await fetch(url, { signal: controller.signal });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`GET ${url} failed with HTTP ${resp.status}`);
    if (!/<form[^>]+id="loginForm"/.test(text)) throw new Error(`GET ${url} did not return login.html`);
  } finally {
    clearTimeout(timer);
  }
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ws.addEventListener('message', (event) => this.onMessage(event));
  }

  async open(timeoutMs) {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolveOpen, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out opening browser websocket')), timeoutMs);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('browser websocket error'));
      }, { once: true });
    });
  }

  onMessage(event) {
    const msg = JSON.parse(event.data);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    const set = this.events.get(msg.method);
    if (set) {
      for (const handler of [...set]) handler(msg.params || {});
    }
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
    });
  }

  waitFor(method, timeoutMs) {
    return new Promise((resolveEvent, reject) => {
      const set = this.events.get(method) || new Set();
      const timer = setTimeout(() => {
        set.delete(handler);
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        set.delete(handler);
        resolveEvent(params);
      };
      set.add(handler);
      this.events.set(method, set);
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function newPage(port, timeoutMs) {
  const resp = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!resp.ok) throw new Error(`create browser page failed with HTTP ${resp.status}`);
  const target = await resp.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open(timeoutMs);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  return client;
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
  }
  return result.result?.value;
}

async function waitForEvaluate(client, expression, timeoutMs, label = 'browser condition') {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(client, expression);
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw lastError || new Error(`timed out waiting for ${label}`);
}

async function navigate(client, url, timeoutMs) {
  const loaded = client.waitFor('Page.loadEventFired', timeoutMs);
  await client.send('Page.navigate', { url });
  await loaded;
}

function hasLoginCredentials(opts = {}) {
  return Boolean(opts.username && opts.password);
}

const MAIN_APP_TAB_IDS = Object.freeze([
  'studioPanel',
  'comicPanel',
  'promptPanel',
  'galleryPanel',
  'configPanel',
  'logsPanel'
]);

async function verifyMainTabs(client, timeoutMs) {
  const checked = [];
  for (const tabId of MAIN_APP_TAB_IDS) {
    const state = await waitForEvaluate(client, `(() => {
      const tabId = ${JSON.stringify(tabId)};
      const button = Array.from(document.querySelectorAll('.tab-button')).find((item) => item.dataset.tab === tabId);
      if (!button || button.hidden) throw new Error('tab button not available: ' + tabId);
      button.click();
      const panel = document.getElementById(tabId);
      if (!panel) throw new Error('tab panel not found: ' + tabId);
      if (!button.classList.contains('active') || !panel.classList.contains('active')) return null;
      return {
        tabId,
        activeButton: true,
        activePanel: true
      };
    })()`, timeoutMs, `main tab switch ${tabId}`);
    checked.push(state.tabId);
  }
  return checked;
}

async function runLoginFlow(client, opts) {
  await evaluate(client, `(() => {
    const form = document.querySelector('#loginForm');
    if (!form) throw new Error('login form not found before credential submit');
    form.querySelector('[name="login"]').value = ${JSON.stringify(opts.username)};
    form.querySelector('[name="password"]').value = ${JSON.stringify(opts.password)};
    form.requestSubmit();
    return true;
  })()`);

  const app = await waitForEvaluate(client, `(() => {
    const error = document.querySelector('#authError:not([hidden])')?.textContent?.trim();
    if (error) throw new Error('login failed: ' + error);
    const appReady = Boolean(document.querySelector('#studioPanel.active') && document.querySelector('#prompt') && document.querySelector('#userMenu'));
    if (!appReady) return null;
    return {
      path: location.pathname,
      title: document.title,
      studioActive: Boolean(document.querySelector('#studioPanel.active')),
      tabCount: document.querySelectorAll('[data-tab]').length,
      promptField: Boolean(document.querySelector('#prompt')),
      inlineScripts: document.querySelectorAll('script:not([src])').length
    };
  })()`, opts.timeoutMs, 'authenticated app shell');
  app.tabsChecked = await verifyMainTabs(client, opts.timeoutMs);
  return app;
}

async function runSmoke(opts) {
  await assertServerReachable(opts.baseUrl, opts.timeoutMs);
  const browser = findBrowser(opts.browser);
  if (!browser) {
    const message = 'Chrome/Edge/Chromium executable not found; set E2E_BROWSER or install a supported browser.';
    if (opts.skipIfMissing) {
      console.log(`SKIP: ${message}`);
      return { skipped: true };
    }
    throw new Error(message);
  }

  const port = await freePort();
  const userDataDir = mkdtempSync(join(tmpdir(), 'image-studio-e2e-browser-'));
  const child = spawn(browser, [
    ...(opts.headed ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-background-networking',
    '--disable-gpu',
    '--no-default-browser-check',
    '--no-first-run',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });

  let client;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`, opts.timeoutMs);
    client = await newPage(port, opts.timeoutMs);
    const loginUrl = new URL('/login.html', opts.baseUrl).toString();
    await navigate(client, loginUrl, opts.timeoutMs);

    const page = await evaluate(client, `(() => ({
      title: document.title,
      heading: document.querySelector('#authHeading')?.textContent?.trim() || '',
      loginForm: Boolean(document.querySelector('#loginForm')),
      registerHidden: document.querySelector('#registerForm')?.hidden === true,
      inlineScripts: document.querySelectorAll('script:not([src])').length
    }))()`);
    if (!page.title.includes('登录')) throw new Error(`unexpected login page title: ${page.title}`);
    if (!page.heading.includes('登录')) throw new Error(`unexpected login heading: ${page.heading}`);
    if (!page.loginForm) throw new Error('login form not found in browser');
    if (!page.registerHidden) throw new Error('register form should be hidden by default');
    if (page.inlineScripts !== 0) throw new Error(`expected no inline scripts, found ${page.inlineScripts}`);

    if (opts.screenshot) {
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(resolve(opts.screenshot), Buffer.from(shot.data, 'base64'));
    }

    const app = hasLoginCredentials(opts) ? await runLoginFlow(client, opts) : null;
    if (app) {
      if (app.path !== '/' && app.path !== '/index.html') throw new Error(`unexpected app path after login: ${app.path}`);
      if (!app.studioActive) throw new Error('studio panel should be active after login');
      if (!app.promptField) throw new Error('main prompt field not found after login');
      if (app.tabCount < 4) throw new Error(`expected main navigation tabs after login, found ${app.tabCount}`);
      if (app.inlineScripts !== 0) throw new Error(`expected no inline scripts in app shell, found ${app.inlineScripts}`);
      if (app.tabsChecked.length !== MAIN_APP_TAB_IDS.length) throw new Error(`expected ${MAIN_APP_TAB_IDS.length} checked tabs, found ${app.tabsChecked.length}`);
    }

    console.log(JSON.stringify({
      ok: true,
      browser,
      baseUrl: opts.baseUrl,
      title: page.title,
      authenticated: Boolean(app),
      appTitle: app?.title || '',
      tabsChecked: app?.tabsChecked || []
    }, null, 2));
    return { ok: true };
  } finally {
    client?.close();
    child.kill();
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    if (stderr && process.env.E2E_DEBUG) process.stderr.write(stderr);
  }
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return;
  }
  await runSmoke(opts);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  });
}
