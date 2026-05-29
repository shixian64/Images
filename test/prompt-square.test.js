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
