import { test, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let workDir;
let prevCwd;
let db;
let auth;
let promptSquareRoutes;

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-prompt-square-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  promptSquareRoutes = await import('../routes/prompt-square.js');
  db.migrate();

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('DELETE FROM prompt_square').run();
  } finally {
    sqlite.close();
  }
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

function captureRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = '') {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };
}

function getReq(user) {
  return {
    method: 'GET',
    session: { user },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  };
}

function postReq(user, body) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    method: 'POST',
    session: { user },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield raw;
    }
  };
}

function setPublishedAt(id, ts) {
  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    sqlite.prepare('UPDATE prompt_square SET published_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  } finally {
    sqlite.close();
  }
}

async function getSquare(user, query) {
  const url = new URL(`http://localhost/api/prompt-square${query}`);
  const res = captureRes();
  await promptSquareRoutes.handlePromptSquareRoute(getReq(user), res, '/api/prompt-square', url);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function getSquareDetail(user, id) {
  const path = `/api/prompt-square/${encodeURIComponent(id)}`;
  const url = new URL(`http://localhost${path}`);
  const res = captureRes();
  await promptSquareRoutes.handlePromptSquareRoute(getReq(user), res, path, url);
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function postSquare(user, body) {
  const url = new URL('http://localhost/api/prompt-square');
  const res = captureRes();
  await promptSquareRoutes.handlePromptSquareRoute(postReq(user, body), res, '/api/prompt-square', url);
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

test('prompt square search/tag/mine filters run before the result limit', async () => {
  const owner = auth.register({
    username: 'square_owner',
    email: 'square_owner@example.com',
    password: 'longenough1'
  });
  const other = auth.register({
    username: 'square_other',
    email: 'square_other@example.com',
    password: 'longenough1'
  });

  const match = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'match-oldest',
    title: 'Needle prompt',
    prompt: 'needle appears only in the oldest row',
    tagsJson: JSON.stringify(['rare']),
    source: 'manual',
    metaJson: '{}'
  });
  const rows = [
    db.promptSquare.upsert({
      userId: other.id,
      sourcePromptId: 'newest-1',
      title: 'Newest one',
      prompt: 'plain prompt',
      tagsJson: JSON.stringify(['common']),
      source: 'manual',
      metaJson: '{}'
    }),
    db.promptSquare.upsert({
      userId: other.id,
      sourcePromptId: 'newest-2',
      title: 'Newest two',
      prompt: 'plain prompt',
      tagsJson: JSON.stringify(['common']),
      source: 'manual',
      metaJson: '{}'
    }),
    db.promptSquare.upsert({
      userId: other.id,
      sourcePromptId: 'newest-3',
      title: 'Newest three',
      prompt: 'plain prompt',
      tagsJson: JSON.stringify(['common']),
      source: 'manual',
      metaJson: '{}'
    })
  ];

  setPublishedAt(match.id, '2026-01-01T00:00:00.000Z');
  rows.forEach((row, index) => {
    setPublishedAt(row.id, `2026-01-0${index + 2}T00:00:00.000Z`);
  });

  const search = await getSquare(owner, '?limit=2&search=needle');
  assert.equal(search.total, 4);
  assert.equal(search.filtered, 1);
  assert.deepEqual(search.items.map((item) => item.id), [match.id]);

  const taggedMine = await getSquare(owner, '?limit=1&tag=rare&mine=1');
  assert.equal(taggedMine.filtered, 1);
  assert.deepEqual(taggedMine.items.map((item) => item.id), [match.id]);
  assert.equal(taggedMine.items[0].isMine, true);
});

test('prompt square search uses the fts index and keeps it in sync', async () => {
  const owner = auth.register({
    username: 'square_fts_owner',
    email: 'square_fts_owner@example.com',
    password: 'longenough1'
  });

  const item = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'fts-sync-prompt',
    title: 'FTS sync prompt',
    prompt: 'A long prompt with hiddeneedlevalue buried in the middle',
    tagsJson: JSON.stringify(['search-index']),
    source: 'manual',
    metaJson: '{}'
  });

  const substring = await getSquare(owner, '?limit=10&search=deneed');
  assert.equal(substring.filtered, 1);
  assert.deepEqual(substring.items.map((entry) => entry.id), [item.id]);

  const sqlite = new DatabaseSync(db.dbPaths.file);
  try {
    const ftsRows = sqlite
      .prepare('SELECT id FROM prompt_square_fts WHERE prompt_square_fts MATCH ?')
      .all('"deneed"');
    assert.deepEqual(ftsRows.map((row) => row.id), [item.id]);
  } finally {
    sqlite.close();
  }

  const updated = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'fts-sync-prompt',
    title: 'FTS sync prompt updated',
    prompt: 'A replacement prompt with uniquefreshvalue instead',
    tagsJson: JSON.stringify(['search-index']),
    source: 'manual',
    metaJson: '{}'
  });
  assert.equal(updated.id, item.id);

  const stale = await getSquare(owner, '?limit=10&search=deneed');
  assert.equal(stale.filtered, 0);

  const fresh = await getSquare(owner, '?limit=10&search=quefresh');
  assert.equal(fresh.filtered, 1);
  assert.deepEqual(fresh.items.map((entry) => entry.id), [item.id]);

  assert.equal(db.promptSquare.deleteById(item.id), 1);
  const deleted = await getSquare(owner, '?limit=10&search=quefresh');
  assert.equal(deleted.filtered, 0);
});

test('prompt square tag filter matches JSON array elements, not tag substrings', async () => {
  const owner = auth.register({
    username: 'square_tag_owner',
    email: 'square_tag_owner@example.com',
    password: 'longenough1'
  });

  const exact = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'tag-exact-a',
    title: 'Exact short tag',
    prompt: 'contains a deliberately short tag',
    tagsJson: JSON.stringify(['a']),
    source: 'manual',
    metaJson: '{}'
  });
  const alias = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'tag-alias-only',
    title: 'Alias tag',
    prompt: 'contains only a longer alias tag',
    tagsJson: JSON.stringify(['alias']),
    source: 'manual',
    metaJson: '{}'
  });
  const aesthetic = db.promptSquare.upsert({
    userId: owner.id,
    sourcePromptId: 'tag-aesthetic-only',
    title: 'Aesthetic tag',
    prompt: 'contains only a longer aesthetic tag',
    tagsJson: JSON.stringify(['aesthetic']),
    source: 'manual',
    metaJson: '{}'
  });

  setPublishedAt(exact.id, '2026-02-03T00:00:00.000Z');
  setPublishedAt(alias.id, '2026-02-02T00:00:00.000Z');
  setPublishedAt(aesthetic.id, '2026-02-01T00:00:00.000Z');

  const tagged = await getSquare(owner, '?limit=10&tag=a');
  assert.equal(tagged.filtered, 1);
  assert.deepEqual(tagged.items.map((item) => item.id), [exact.id]);
});

test('prompt square keeps uploaded prompt example preview urls', async () => {
  const owner = auth.register({
    username: 'square_preview_owner',
    email: 'square_preview_owner@example.com',
    password: 'longenough1'
  });
  const previewUrl = `/prompt-example-files/users/${owner.id}/images/prompt-examples/2026-04-25/example.png`;

  const result = await postSquare(owner, {
    sourcePromptId: 'preview-local-upload',
    title: 'Preview local upload',
    prompt: 'prompt with uploaded example image',
    tags: ['preview'],
    source: 'manual',
    meta: {
      previewImages: [
        previewUrl,
        'data:image/png;base64,AAA=',
        '/gallery-files/users/x/images/private.png'
      ]
    }
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.item.meta.previewImages, [previewUrl]);
});

test('prompt square only keeps HTTPS external preview image urls', async () => {
  const owner = auth.register({
    username: 'square_https_preview_owner',
    email: 'square_https_preview_owner@example.com',
    password: 'longenough1'
  });
  const httpsPreviewUrl = 'https://cdn.example.test/preview.png';

  const result = await postSquare(owner, {
    sourcePromptId: 'preview-external-url',
    title: 'Preview external URL',
    prompt: 'prompt with external example image',
    tags: ['preview'],
    source: 'manual',
    meta: {
      sourceUrl: 'http://cdn.example.test/source',
      previewImages: [
        httpsPreviewUrl,
        'http://cdn.example.test/insecure.png',
        'https://user:pass@cdn.example.test/credentialed.png'
      ]
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.item.meta.sourceUrl, undefined);
  assert.deepEqual(result.body.item.meta.previewImages, [httpsPreviewUrl]);
});

test('prompt square list caps prompt previews while detail keeps the full prompt', async () => {
  const owner = auth.register({
    username: 'square_budget_owner',
    email: 'square_budget_owner@example.com',
    password: 'longenough1'
  });
  const longPrompt = [
    'budget prompt start',
    '画'.repeat(promptSquareRoutes.PROMPT_SQUARE_LIST_PROMPT_MAX_CHARS + 200),
    'budget prompt end'
  ].join('\n');

  const published = await postSquare(owner, {
    sourcePromptId: 'list-budget-long-prompt',
    title: 'List budget long prompt',
    prompt: longPrompt,
    tags: ['budget'],
    source: 'manual'
  });

  assert.equal(published.statusCode, 200);
  assert.equal(published.body.item.prompt, longPrompt);
  assert.equal(published.body.item.promptTruncated, false);

  const list = await getSquare(owner, '?limit=20&mine=1&tag=budget');
  const item = list.items.find((entry) => entry.id === published.body.item.id);
  assert.ok(item, 'published prompt should appear in mine/tag list');
  assert.equal(item.promptTruncated, true);
  assert.equal(item.promptLength, longPrompt.length);
  assert.ok(item.prompt.length <= promptSquareRoutes.PROMPT_SQUARE_LIST_PROMPT_MAX_CHARS);
  assert.match(item.prompt, /…$/);
  assert.doesNotMatch(item.prompt, /budget prompt end/);

  const detail = await getSquareDetail(owner, item.id);
  assert.equal(detail.item.promptTruncated, false);
  assert.equal(detail.item.promptLength, longPrompt.length);
  assert.equal(detail.item.prompt, longPrompt);
});
