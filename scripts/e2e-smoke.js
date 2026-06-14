#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    screenshotBaseline: process.env.E2E_SCREENSHOT_BASELINE || '',
    screenshotDir: process.env.E2E_SCREENSHOT_DIR || '',
    screenshotManifest: process.env.E2E_SCREENSHOT_MANIFEST || '',
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
    } else if (arg === '--screenshot-baseline') {
      out.screenshotBaseline = argv[++i] || out.screenshotBaseline;
    } else if (arg === '--screenshot-dir') {
      out.screenshotDir = argv[++i] || out.screenshotDir;
    } else if (arg === '--screenshot-manifest') {
      out.screenshotManifest = argv[++i] || out.screenshotManifest;
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
Use --screenshot-dir with --screenshot-manifest to capture a visual baseline manifest, and --screenshot-baseline to compare it later.
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

function wantsScreenshots(opts = {}) {
  return Boolean(opts.screenshot || opts.screenshotDir || opts.screenshotManifest || opts.screenshotBaseline);
}

export function screenshotFileName(label = '') {
  const safe = String(label || 'screenshot')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${safe || 'screenshot'}.png`;
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function captureScreenshotEntry(client, label, outputPaths = []) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const buffer = Buffer.from(shot.data, 'base64');
  const paths = [...new Set(outputPaths.filter(Boolean).map((item) => resolve(item)))];
  for (const filePath of paths) {
    ensureParentDir(filePath);
    writeFileSync(filePath, buffer);
  }
  return {
    label,
    path: paths[0] || '',
    paths,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex')
  };
}

function baselineScreenshots(input = {}) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.screenshots)) return input.screenshots;
  return [];
}

export function compareScreenshotBaselineEntries(entries = [], baseline = {}) {
  const actual = new Map((entries || []).map((entry) => [entry?.label, entry?.sha256]));
  const issues = [];
  for (const expected of baselineScreenshots(baseline)) {
    const label = expected?.label || '';
    if (!label) continue;
    if (!actual.has(label)) {
      issues.push(`missing screenshot capture: ${label}`);
      continue;
    }
    const expectedHash = String(expected.sha256 || '');
    const actualHash = String(actual.get(label) || '');
    if (expectedHash && actualHash !== expectedHash) {
      issues.push(`hash mismatch for ${label}: expected ${expectedHash}, got ${actualHash}`);
    }
  }
  if (issues.length) {
    throw new Error(`screenshot baseline mismatch: ${issues.join('; ')}`);
  }
  return { checked: baselineScreenshots(baseline).filter((entry) => entry?.label).length };
}

const MAIN_APP_TAB_IDS = Object.freeze([
  'studioPanel',
  'comicPanel',
  'videoPanel',
  'promptPanel',
  'galleryPanel',
  'configPanel',
  'logsPanel'
]);

async function verifyMainTabs(client, timeoutMs, onTabReady = null) {
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
    if (onTabReady) await onTabReady(tabId);
  }
  return checked;
}

async function runLoginFlow(client, opts, captureTabScreenshot = null) {
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
  app.tabsChecked = await verifyMainTabs(client, opts.timeoutMs, captureTabScreenshot);
  return app;
}

function screenshotPathInDir(dir, label) {
  return join(resolve(dir), screenshotFileName(label));
}

function writeScreenshotManifest(filePath, manifest) {
  const out = resolve(filePath);
  ensureParentDir(out);
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
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
  const screenshotEntries = [];
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

    if (wantsScreenshots(opts)) {
      screenshotEntries.push(await captureScreenshotEntry(client, 'login', [
        opts.screenshot ? resolve(opts.screenshot) : '',
        opts.screenshotDir ? screenshotPathInDir(opts.screenshotDir, 'login') : ''
      ]));
    }

    const captureTabScreenshot = wantsScreenshots(opts)
      ? async (tabId) => {
          screenshotEntries.push(await captureScreenshotEntry(client, `app-${tabId}`, [
            opts.screenshotDir ? screenshotPathInDir(opts.screenshotDir, `app-${tabId}`) : ''
          ]));
        }
      : null;
    const app = hasLoginCredentials(opts) ? await runLoginFlow(client, opts, captureTabScreenshot) : null;
    if (app) {
      if (app.path !== '/' && app.path !== '/index.html') throw new Error(`unexpected app path after login: ${app.path}`);
      if (!app.studioActive) throw new Error('studio panel should be active after login');
      if (!app.promptField) throw new Error('main prompt field not found after login');
      if (app.tabCount < 4) throw new Error(`expected main navigation tabs after login, found ${app.tabCount}`);
      if (app.inlineScripts !== 0) throw new Error(`expected no inline scripts in app shell, found ${app.inlineScripts}`);
      if (app.tabsChecked.length !== MAIN_APP_TAB_IDS.length) throw new Error(`expected ${MAIN_APP_TAB_IDS.length} checked tabs, found ${app.tabsChecked.length}`);
    }

    if (opts.screenshotManifest) {
      writeScreenshotManifest(opts.screenshotManifest, {
        version: 1,
        generatedAt: new Date().toISOString(),
        browser,
        baseUrl: opts.baseUrl,
        authenticated: Boolean(app),
        screenshots: screenshotEntries
      });
    }
    if (opts.screenshotBaseline) {
      const baseline = JSON.parse(readFileSync(resolve(opts.screenshotBaseline), 'utf8'));
      compareScreenshotBaselineEntries(screenshotEntries, baseline);
    }

    console.log(JSON.stringify({
      ok: true,
      browser,
      baseUrl: opts.baseUrl,
      title: page.title,
      authenticated: Boolean(app),
      appTitle: app?.title || '',
      tabsChecked: app?.tabsChecked || [],
      screenshots: screenshotEntries.map((entry) => ({
        label: entry.label,
        path: entry.path,
        bytes: entry.bytes,
        sha256: entry.sha256
      }))
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
