import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const INDEX_HTML = 'public/index.html';
const LOGIN_HTML = 'public/login.html';
const MODULE_DIR = 'public/modules';

function read(path) {
  return readFileSync(path, 'utf8');
}

function staticIdsFrom(text) {
  return [...text.matchAll(/\bid=["']([A-Za-z0-9_-]+)["']/g)].map((match) => match[1]);
}

function literalDomRefsFrom(text) {
  const refs = [];
  for (const pattern of [
    /\$\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g,
    /document\.getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g
  ]) {
    for (const match of text.matchAll(pattern)) refs.push(match[1]);
  }
  return refs;
}

test('entry HTML keeps the browser boot path external and module based', () => {
  const html = read(INDEX_HTML);

  assert.match(html, /<script\b[^>]+src=["']\.\/main-boot\.js\?/);
  assert.match(html, /<script\b[^>]+type=["']module["'][^>]+src=["']\.\/app\.js\?/);
  for (const id of ['main', 'status', 'userMenu', 'appDrawer', 'appDrawerBody']) {
    assert.match(html, new RegExp(`\\bid=["']${id}["']`), `missing #${id}`);
  }
});

test('entry HTML loads split CSS bundles in dependency order', () => {
  const html = read(INDEX_HTML);
  const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g)]
    .map((match) => match[1].replace(/[?#].*$/, ''));

  assert.deepEqual(links, ['./styles.css', './logs.css', './admin.css']);
  for (const href of links) {
    assert.equal(existsSync(join('public', href.slice(2))), true, `missing ${href}`);
  }
});

test('top-level navigation tabs have matching tab panels', () => {
  const html = read(INDEX_HTML);
  const topMenu = html.match(/<nav\b[^>]*class=["'][^"']*top-menu[^"']*["'][^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
  const tabTargets = [...topMenu.matchAll(/<button\b[^>]*\bdata-tab=["']([^"']+)["'][^>]*>/g)]
    .map((match) => match[1]);

  assert.deepEqual(tabTargets, [
    'studioPanel',
    'comicPanel',
    'promptPanel',
    'galleryPanel',
    'configPanel',
    'logsPanel',
    'usersPanel'
  ]);

  for (const id of tabTargets) {
    assert.match(
      html,
      new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*\\bclass=["'][^"']*tab-panel`),
      `missing tab panel for ${id}`
    );
  }
});

test('app module imports point to files that exist', () => {
  const app = read('public/app.js');
  const imports = [...app.matchAll(/from\s+["'](\.\/modules\/[^"']+\.js)["']/g)]
    .map((match) => match[1]);

  assert.ok(imports.length > 10);
  for (const specifier of imports) {
    assert.equal(existsSync(join('public', specifier.slice(2))), true, `missing ${specifier}`);
  }
});

test('literal frontend DOM id references resolve to static or generated markup', () => {
  const moduleFiles = [
    'public/app.js',
    ...[
      'admin-client-logs.js',
      'admin-gallery.js',
      'admin-interfaces.js',
      'admin-jobs.js',
      'admin-quota.js',
      'admin-registration.js',
      'auth.js',
      'clipboard.js',
      'comic.js',
      'dialog.js',
      'dom.js',
      'drawer.js',
      'gallery.js',
      'job-dismissal.js',
      'jobs.js',
      'logs.js',
      'nav.js',
      'profile.js',
      'profiles.js',
      'prompts.js',
      'selects.js',
      'state.js',
      'studio.js',
      'theme.js',
      'users.js',
      'volatile-secrets.js'
    ].map((name) => `${MODULE_DIR}/${name}`)
  ];
  const markupSources = [INDEX_HTML, LOGIN_HTML, ...moduleFiles].map(read).join('\n');
  const availableIds = new Set(staticIdsFrom(markupSources));
  const missing = [];

  for (const file of moduleFiles) {
    for (const id of literalDomRefsFrom(read(file))) {
      if (!availableIds.has(id)) missing.push(`${file} -> #${id}`);
    }
  }

  assert.deepEqual(missing, []);
});
