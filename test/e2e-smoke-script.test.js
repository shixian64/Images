import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browserCandidates,
  findBrowser,
  parseArgs
} from '../scripts/e2e-smoke.js';

test('e2e smoke args use stable defaults and CLI overrides', () => {
  const opts = parseArgs([
    '--base-url', 'http://127.0.0.1:9999',
    '--browser', 'chrome',
    '--headed',
    '--screenshot', 'out.png',
    '--timeout-ms', '3000',
    '--skip-if-missing'
  ]);

  assert.equal(opts.baseUrl, 'http://127.0.0.1:9999');
  assert.equal(opts.browser, 'chrome');
  assert.equal(opts.headed, true);
  assert.equal(opts.screenshot, 'out.png');
  assert.equal(opts.timeoutMs, 3000);
  assert.equal(opts.skipIfMissing, true);
});

test('e2e smoke rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--wat']), /unknown argument/);
});

test('e2e smoke browser candidates include platform-specific chromium paths', (t) => {
  const oldLocal = process.env.LOCALAPPDATA;
  const oldProgramFiles = process.env.PROGRAMFILES;
  const oldProgramFilesX86 = process.env['PROGRAMFILES(X86)'];
  process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';
  process.env.PROGRAMFILES = 'C:\\Program Files';
  process.env['PROGRAMFILES(X86)'] = 'C:\\Program Files (x86)';
  t.after(() => {
    if (oldLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocal;
    if (oldProgramFiles === undefined) delete process.env.PROGRAMFILES;
    else process.env.PROGRAMFILES = oldProgramFiles;
    if (oldProgramFilesX86 === undefined) delete process.env['PROGRAMFILES(X86)'];
    else process.env['PROGRAMFILES(X86)'] = oldProgramFilesX86;
  });

  const win = browserCandidates('win32');
  assert.ok(win.some((item) => item.endsWith('Google\\Chrome\\Application\\chrome.exe')));
  assert.ok(win.some((item) => item.endsWith('Microsoft\\Edge\\Application\\msedge.exe')));
  assert.ok(browserCandidates('darwin').some((item) => item.includes('Google Chrome.app')));
  assert.ok(browserCandidates('linux').some((item) => item.includes('chromium')));
});

test('e2e smoke accepts explicit browser commands from PATH', () => {
  assert.equal(findBrowser('chrome'), 'chrome');
  assert.equal(findBrowser('missing\\browser.exe'), '');
});
