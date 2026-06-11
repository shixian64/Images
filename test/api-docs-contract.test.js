import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = readFileSync('docs/API.md', 'utf8');
const implementation = [
  'server.js',
  'routes/auth.js',
  'routes/profile.js',
  'routes/interfaces.js',
  'routes/generate.js',
  'routes/chat.js',
  'routes/jobs.js',
  'routes/gallery.js',
  'routes/admin-gallery.js',
  'routes/prompt-square.js',
  'routes/prompt-examples.js',
  'routes/comic-projects.js',
  'routes/comic-storyboards.js',
  'routes/users.js',
  'routes/quota.js',
  'routes/registration.js',
  'routes/client-logs.js',
  'utils/api-version.js'
].map((file) => readFileSync(file, 'utf8')).join('\n');

const API_CONTRACT = [
  ['GET', '/healthz'],
  ['HEAD', '/healthz'],
  ['POST', '/api/auth/register'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
  ['GET', '/api/auth/registration-policy'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/profile'],
  ['PATCH', '/api/profile'],
  ['POST', '/api/profile/password'],
  ['GET', '/api/quota/me'],
  ['GET', '/api/interfaces/default'],
  ['GET', '/api/admin/interfaces/default'],
  ['PUT', '/api/admin/interfaces/default'],
  ['POST', '/api/admin/interfaces/default/test'],
  ['POST', '/api/test-profile'],
  ['GET', '/api/generate/config'],
  ['POST', '/api/generate'],
  ['POST', '/api/generate/stream'],
  ['POST', '/api/chat'],
  ['GET', '/api/jobs'],
  ['GET', '/api/jobs/:id'],
  ['POST', '/api/jobs/:id/cancel'],
  ['POST', '/api/jobs/:id/retry'],
  ['GET', '/api/jobs/stream'],
  ['GET', '/api/jobs/:id/stream'],
  ['GET', '/api/admin/jobs'],
  ['GET', '/api/admin/jobs/settings'],
  ['PUT', '/api/admin/jobs/settings'],
  ['GET', '/api/admin/jobs/:id'],
  ['POST', '/api/admin/jobs/:id/cancel'],
  ['PATCH', '/api/admin/jobs/:id/priority'],
  ['POST', '/api/admin/jobs/:id/priority'],
  ['GET', '/api/admin/jobs/stream'],
  ['GET', '/api/gallery'],
  ['POST', '/api/gallery/:id/visibility'],
  ['POST', '/api/gallery/:id/like'],
  ['DELETE', '/api/gallery/:id'],
  ['GET', '/api/admin/gallery'],
  ['GET', '/api/admin/gallery/stats'],
  ['DELETE', '/api/admin/gallery/:id'],
  ['POST', '/api/admin/gallery/bulk-delete'],
  ['GET', '/api/admin/gallery/orphans'],
  ['DELETE', '/api/admin/gallery/orphans'],
  ['GET', '/api/prompt-square'],
  ['POST', '/api/prompt-square'],
  ['GET', '/api/prompt-square/:id'],
  ['DELETE', '/api/prompt-square/:id'],
  ['POST', '/api/prompt-square/:id/use'],
  ['POST', '/api/prompt-examples'],
  ['GET', '/api/comic-projects'],
  ['POST', '/api/comic-projects'],
  ['GET', '/api/comic-projects/:id'],
  ['PUT', '/api/comic-projects/:id'],
  ['PATCH', '/api/comic-projects/:id'],
  ['DELETE', '/api/comic-projects/:id'],
  ['POST', '/api/comic-storyboards'],
  ['GET', '/api/users'],
  ['POST', '/api/users'],
  ['GET', '/api/users/:id'],
  ['PATCH', '/api/users/:id'],
  ['DELETE', '/api/users/:id'],
  ['POST', '/api/users/:id/reset-password'],
  ['POST', '/api/users/:id/logout'],
  ['GET', '/api/admin/quota/defaults'],
  ['PUT', '/api/admin/quota/defaults'],
  ['GET', '/api/admin/quota/users/:id'],
  ['PUT', '/api/admin/quota/users/:id'],
  ['DELETE', '/api/admin/quota/users/:id'],
  ['POST', '/api/admin/quota/users/:id/reset'],
  ['GET', '/api/admin/registration'],
  ['PUT', '/api/admin/registration'],
  ['GET', '/api/admin/registration/settings'],
  ['PUT', '/api/admin/registration/settings'],
  ['POST', '/api/admin/registration/invites'],
  ['POST', '/api/admin/registration/invites/reset'],
  ['DELETE', '/api/admin/registration/invites/reset'],
  ['POST', '/api/admin/registration/invites/:code'],
  ['DELETE', '/api/admin/registration/invites/:code'],
  ['POST', '/api/admin/registration/redemptions/cleanup'],
  ['DELETE', '/api/admin/registration/redemptions/cleanup'],
  ['POST', '/api/client-logs'],
  ['GET', '/api/admin/client-logs']
];

const STALE_DOC_ROUTES = [
  '/api/jobs/:id/events',
  '/api/jobs/events',
  '/api/admin/jobs/events',
  'PATCH | `/api/gallery/:id`',
  '/api/admin/gallery/orphans/delete-dangling',
  '/api/admin/registration/invites/generate',
  '/api/admin/registration/invites/:code/disable',
  '/api/prompt-examples/:id'
];

const IMPLEMENTATION_HINTS = [
  [/\/api\/jobs\/stream/, 'user jobs SSE stream route'],
  [/\/api\\\/jobs\\\/\(\[\^\/]\+\)\\\/stream/, 'single job SSE stream regex'],
  [/\/api\/admin\/jobs\/stream/, 'admin jobs SSE stream route'],
  [/\/api\\\/gallery\\\/\(\[\^\/]\+\)\\\/visibility|const visibility = pathname/, 'gallery visibility route'],
  [/DELETE' && pathname === '\/api\/admin\/gallery\/orphans'|\/api\/admin\/gallery\/orphans/, 'admin orphan delete route'],
  [/pathname === '\/api\/admin\/registration\/invites'/, 'registration invite generation route'],
  [/\/api\/prompt-examples/, 'prompt example upload route'],
  [/pathname === '\/api\/client-logs'/, 'client log ingestion route']
];

function rowsContainingPath(path) {
  return docs
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && line.includes(`\`${path}\``));
}

function rowAllowsMethod(row, method) {
  const cells = row.split('|').map((cell) => cell.trim());
  const methods = String(cells[1] || '').split('/').map((item) => item.trim());
  return methods.includes(method);
}

test('docs/API.md documents the current route contract', () => {
  const missing = [];
  for (const [method, path] of API_CONTRACT) {
    const rows = rowsContainingPath(path);
    if (!rows.length || !rows.some((row) => rowAllowsMethod(row, method))) {
      missing.push(`${method} ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('docs/API.md does not keep known stale route spellings', () => {
  for (const route of STALE_DOC_ROUTES) {
    assert.equal(docs.includes(route), false, `stale API route remains documented: ${route}`);
  }
});

test('route implementation still exposes the documented tricky endpoints', () => {
  const missing = IMPLEMENTATION_HINTS
    .filter(([pattern]) => !pattern.test(implementation))
    .map(([, label]) => label);
  assert.deepEqual(missing, []);
});

test('docs/API.md documents the /api/v1 compatibility alias', () => {
  assert.match(docs, /\/api\/v1\/\*/);
  assert.match(implementation, /normalizeApiPathname/);
  assert.match(implementation, /\/api\/v1/);
});
