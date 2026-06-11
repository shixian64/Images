import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { COMIC_PAGE_PANEL_LIMITS } from '../shared/comic-workflow.js';

let workDir;
let prevCwd;
let db;
let auth;
let comicProjects;
let gallery;
let route;
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-comic-projects-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  comicProjects = await import('../services/comic-projects.js');
  gallery = await import('../services/gallery-store.js');
  route = await import('../routes/comic-projects.js');

  db.migrate();
  user = auth.register({ username: 'comic_owner', email: 'comic-owner@example.com', password: 'longenough1' });
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('comic project save normalizes storyboard pages before persisting', () => {
  const project = comicProjects.upsertComicProject({
    title: '页面分镜项目',
    story: '少年在天台看到巨龙降落。',
    styleId: 'american-comic',
    status: 'storyboard',
    storyboard: {
      title: '页面分镜项目',
      style_id: 'american-comic',
      pageStoryboardEnabled: true,
      panel_plan: [
        {
          index: 1,
          beat: '少年抬头',
          image_prompt: '少年在天台抬头看向云层',
          page_storyboard: {
            layout_type: '大格主视觉型',
            panel_count: 99,
            sub_panels: [
              { id: 'A', role: '反应', area: '左上小格', content: '少年抬头' }
            ]
          }
        },
        {
          index: 2,
          beat: '巨龙压向城市',
          image_prompt: '巨龙从云层俯冲，城市灯光熄灭'
        }
      ],
      unexpected_key: 'not persisted'
    }
  }, { userId: user.id });

  assert.equal(project.status, 'storyboard');
  assert.equal(project.panelCount, 2);
  assert.equal(project.pageCount, 2);
  assert.equal(project.storyboard.styleId, 'american-comic');
  assert.equal(project.storyboard.pageStoryboardEnabled, true);
  assert.equal(project.storyboard.panels.length, 2);
  assert.equal(project.storyboard.panels[0].pageStoryboard.panelCount, COMIC_PAGE_PANEL_LIMITS.max);
  assert.equal(project.storyboard.panels[1].pageStoryboard.panelCount, 1);
  assert.equal(project.storyboard.panel_plan, undefined);
  assert.equal(project.storyboard.unexpected_key, undefined);
});

test('comic project save rejects unknown status values', () => {
  assert.throws(
    () => comicProjects.upsertComicProject({
      title: '状态异常',
      story: '测试',
      status: 'running-but-not-supported',
      storyboard: {
        panels: [{ beat: '一页', imagePrompt: '一页画面' }]
      }
    }, { userId: user.id }),
    /invalid comic project status/
  );
});

test('comic project status sync marks completed projects after all pages are saved', async () => {
  const project = comicProjects.upsertComicProject({
    title: '自动完成项目',
    story: '两页小漫画全部完成。',
    status: 'generating',
    storyboard: {
      pageStoryboardEnabled: true,
      panels: [
        { beat: '第一页', imagePrompt: '第一页画面' },
        { beat: '第二页', imagePrompt: '第二页画面' }
      ]
    }
  }, { userId: user.id });

  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'page 1', outputFormat: 'png', comicProjectId: project.id, comicPageIndex: 1 },
    { userId: user.id }
  );
  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'page 2', outputFormat: 'png', comicProjectId: project.id, comicPageIndex: 2 },
    { userId: user.id }
  );

  const synced = comicProjects.syncComicProjectStatus(project.id, { userId: user.id });
  assert.equal(synced.changed, true);
  assert.equal(synced.previousStatus, 'generating');
  assert.equal(synced.nextStatus, 'completed');
  assert.equal(synced.progress.completed, 2);
  assert.equal(synced.progress.percent, 100);
  assert.equal(db.comicProjects.findById(project.id).status, 'completed');
});

test('comic project status sync marks incomplete projects with failed jobs as failed', async () => {
  const project = comicProjects.upsertComicProject({
    title: '自动失败项目',
    story: '第二页生成失败。',
    status: 'generating',
    storyboard: {
      pageStoryboardEnabled: true,
      panels: [
        { beat: '第一页', imagePrompt: '第一页画面' },
        { beat: '第二页', imagePrompt: '第二页画面' }
      ]
    }
  }, { userId: user.id });

  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'page 1', outputFormat: 'png', comicProjectId: project.id, comicPageIndex: 1 },
    { userId: user.id }
  );
  db.generationJobs.create({
    userId: user.id,
    status: 'failed',
    payload: {
      model: 'test-image-model',
      prompt: 'page 2 failed',
      n: 1,
      comicProjectId: project.id,
      comicPageIndex: 2
    },
    promptPreview: 'page 2 failed',
    profileName: 'Comic Test',
    model: 'test-image-model',
    n: 1
  });

  const synced = comicProjects.syncComicProjectStatus(project.id, { userId: user.id });
  assert.equal(synced.changed, true);
  assert.equal(synced.previousStatus, 'generating');
  assert.equal(synced.nextStatus, 'failed');
  assert.equal(synced.progress.completed, 1);
  assert.equal(synced.progress.failed, 1);
  assert.equal(db.comicProjects.findById(project.id).status, 'failed');
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += chunk ? String(chunk) : '';
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    }
  };
}

async function callComicRoute(method, pathname, { body, asUser = user, query = '' } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  req.session = asUser ? { user: asUser } : null;
  const res = mockRes();
  const url = new URL(`http://localhost${pathname}${query}`);
  await route.handleComicProjectsRoute(req, res, pathname, url);
  return res;
}

test('comic projects route supports CRUD and cascades project image deletion', async () => {
  const create = await callComicRoute('POST', '/api/comic-projects', {
    body: {
      title: 'API 漫画项目',
      story: '猫把城市灯光带到屋顶。',
      status: 'storyboard',
      storyboard: {
        pageStoryboardEnabled: true,
        panels: [
          { beat: '猫出现', imagePrompt: '发光猫出现在旧楼门口' },
          { beat: '屋顶星河', imagePrompt: '屋顶灯光变成星河' }
        ]
      }
    }
  });
  assert.equal(create.statusCode, 200);
  const created = create.json().project;
  assert.ok(created.id);
  assert.equal(created.pageCount, 2);
  assert.equal(created.storyboard.panels[0].pageStoryboard.panelCount, 1);

  const list = await callComicRoute('GET', '/api/comic-projects', { query: '?limit=10' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items.some((item) => item.id === created.id), true);

  const update = await callComicRoute('PUT', `/api/comic-projects/${encodeURIComponent(created.id)}`, {
    body: {
      ...created,
      title: 'API 漫画项目修订',
      status: 'generating',
      storyboard: created.storyboard
    }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().project.title, 'API 漫画项目修订');
  assert.equal(update.json().project.status, 'generating');

  const queuedJob = db.generationJobs.create({
    userId: user.id,
    status: 'queued',
    payload: {
      model: 'test-image-model',
      prompt: '继续生成第二页',
      n: 1,
      comicProjectId: created.id,
      comicPageIndex: 2,
      comicPanelIndex: 2
    },
    promptPreview: '继续生成第二页',
    profileName: 'Comic Test',
    model: 'test-image-model',
    n: 1
  });

  const detail = await callComicRoute('GET', `/api/comic-projects/${encodeURIComponent(created.id)}`);
  assert.equal(detail.statusCode, 200);
  const detailBody = detail.json();
  assert.equal(detailBody.jobs.length, 1);
  assert.equal(detailBody.jobs[0].id, queuedJob.id);
  assert.equal(detailBody.jobs[0].comicPageIndex, 2);
  assert.equal(detailBody.jobs[0].comicPanelIndex, 2);
  assert.equal(detailBody.project.progress.total, 2);
  assert.equal(detailBody.project.progress.completed, 0);
  assert.equal(detailBody.project.progress.queued, 1);
  assert.equal(detailBody.project.progress.active, 1);
  assert.equal(detailBody.project.progress.computedStatus, 'generating');
  assert.deepEqual(detailBody.progress, detailBody.project.progress);

  const listWithJob = await callComicRoute('GET', '/api/comic-projects', { query: '?limit=10' });
  const listedWithJob = listWithJob.json().items.find((item) => item.id === created.id);
  assert.equal(listedWithJob.progress.active, 1);
  assert.equal(listedWithJob.progress.computedStatus, 'generating');

  const other = auth.register({ username: 'comic_route_other', email: 'comic-route-other@example.com', password: 'longenough1' });
  const forbidden = await callComicRoute('GET', `/api/comic-projects/${encodeURIComponent(created.id)}`, { asUser: other });
  assert.equal(forbidden.statusCode, 403);

  const saved = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'comic page', outputFormat: 'png', comicProjectId: created.id, comicPageIndex: 1 },
    { userId: user.id }
  );
  assert.equal(saved.saved.length, 1);
  assert.equal(db.images.listByComicProject(created.id, { limit: 10 }).length, 1);
  const detailAfterImage = await callComicRoute('GET', `/api/comic-projects/${encodeURIComponent(created.id)}`);
  assert.equal(detailAfterImage.json().project.progress.completed, 1);
  assert.equal(detailAfterImage.json().project.progress.percent, 50);

  const del = await callComicRoute('DELETE', `/api/comic-projects/${encodeURIComponent(created.id)}`);
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().removed.removed.length, 1);
  assert.equal(del.json().removed.cancelledJobs.length, 1);
  assert.equal(db.generationJobs.findById(queuedJob.id).status, 'cancelled');
  assert.equal(db.comicProjects.findById(created.id), null);
  assert.equal(db.images.listByComicProject(created.id, { limit: 10 }).length, 0);
});

test('comic project list caps story and storyboard previews while detail keeps full content', async () => {
  const panelCount = comicProjects.COMIC_PROJECT_LIST_STORYBOARD_MAX_PANELS + 2;
  const longStory = [
    'budget story start',
    'x'.repeat(comicProjects.COMIC_PROJECT_LIST_STORY_MAX_CHARS + 200),
    'budget story end'
  ].join('\n');
  const panels = Array.from({ length: panelCount }, (_, index) => ({
    beat: `budget beat ${index + 1} ${'b'.repeat(260)}`,
    imagePrompt: `budget image prompt ${index + 1} ${'p'.repeat(260)}`,
    pageStoryboard: {
      layoutType: `budget layout ${index + 1} ${'l'.repeat(220)}`,
      panelCount: 1,
      subPanels: [{ id: 'A', content: `content ${index + 1}` }]
    }
  }));

  const create = await callComicRoute('POST', '/api/comic-projects', {
    body: {
      title: 'Budgeted comic project list item',
      story: longStory,
      status: 'storyboard',
      storyboard: {
        title: 'Budgeted storyboard',
        pageStoryboardEnabled: true,
        panels
      }
    }
  });
  assert.equal(create.statusCode, 200);
  const created = create.json().project;
  assert.equal(created.story, longStory);
  assert.equal(created.storyboard.panels.length, panelCount);

  const list = await callComicRoute('GET', '/api/comic-projects', { query: '?limit=20' });
  assert.equal(list.statusCode, 200);
  const listed = list.json().items.find((item) => item.id === created.id);
  assert.ok(listed, 'created project should appear in comic project list');
  assert.equal(listed.storyTruncated, true);
  assert.equal(listed.storyLength, longStory.length);
  assert.ok(listed.story.length <= comicProjects.COMIC_PROJECT_LIST_STORY_MAX_CHARS);
  assert.doesNotMatch(listed.story, /budget story end/);
  assert.equal(listed.storyboardTruncated, true);
  assert.equal(listed.storyboardPanelCount, panelCount);
  assert.equal(listed.storyboard.panels.length, comicProjects.COMIC_PROJECT_LIST_STORYBOARD_MAX_PANELS);
  assert.ok(listed.storyboard.panels[0].imagePrompt.length <= 180);

  const detail = await callComicRoute('GET', `/api/comic-projects/${encodeURIComponent(created.id)}`);
  assert.equal(detail.statusCode, 200);
  const detailBody = detail.json();
  assert.equal(detailBody.project.storyTruncated, false);
  assert.equal(detailBody.project.storyLength, longStory.length);
  assert.equal(detailBody.project.story, longStory);
  assert.equal(detailBody.project.storyboardTruncated, false);
  assert.equal(detailBody.project.storyboard.panels.length, panelCount);
  assert.match(detailBody.project.storyboard.panels[0].imagePrompt, /p{200}/);
});
