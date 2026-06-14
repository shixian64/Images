import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

let workDir;
let prevCwd;
let db;
let auth;
let videoProjects;
let gallery;
let route;
let user;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

before(async () => {
  prevCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'image-studio-video-projects-'));
  process.chdir(workDir);

  db = await import('../services/db.js');
  auth = await import('../services/auth.js');
  videoProjects = await import('../services/video-projects.js');
  gallery = await import('../services/gallery-store.js');
  route = await import('../routes/video-projects.js');

  db.migrate();
  user = auth.register({ username: 'video_owner', email: 'video-owner@example.com', password: 'longenough1' });
});

after(() => {
  process.chdir(prevCwd);
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

test('video project save normalizes storyboard keyframes and references', () => {
  const project = videoProjects.upsertVideoProject({
    title: '雨夜视频',
    prompt: '快递员追随发光猫穿过雨夜城市。',
    status: 'storyboard',
    keyframeCount: 5,
    config: {
      style: '电影感霓虹',
      motion: '镜头从左向右推进',
      negative: '不要文字',
      betweenCoarseCount: 4,
      betweenRefineCount: 6
    },
    references: [
      { id: 'ref-a', label: '角色' },
      { id: 'ref-b', label: '街景' }
    ],
    storyboard: {
      title: '雨夜视频',
      keyframe_count: 2,
      keyframes: [
        { beat: '快递员起跑', image_prompt: '雨夜天台，快递员起跑', reference_indexes: [1, 9] },
        { beat: '发光猫回头', prompt: '发光猫在巷口回头', referenceIndexes: [2] }
      ]
    }
  }, { userId: user.id });

  assert.equal(project.status, 'storyboard');
  assert.equal(project.keyframeCount, 2);
  assert.equal(project.config.style, '电影感霓虹');
  assert.equal(project.config.betweenCoarseCount, 4);
  assert.equal(project.config.betweenRefineCount, 6);
  assert.equal(project.storyboard.keyframes.length, 2);
  assert.deepEqual(project.storyboard.keyframes[0].referenceIndexes, [1]);
  assert.deepEqual(project.storyboard.keyframes[1].referenceIndexes, [2]);
});

test('video project save rejects unknown status values', () => {
  assert.throws(
    () => videoProjects.upsertVideoProject({
      title: '状态异常',
      prompt: '测试',
      status: 'running-but-not-supported',
      storyboard: {
        keyframes: [
          { beat: '一帧', imagePrompt: '一帧画面' },
          { beat: '二帧', imagePrompt: '二帧画面' }
        ]
      }
    }, { userId: user.id }),
    /invalid video project status/
  );
});

test('video project status counts only keyframes as completion target', async () => {
  const project = videoProjects.upsertVideoProject({
    title: '自动完成视频',
    prompt: '两个关键帧和一个帧间图。',
    status: 'generating',
    storyboard: {
      keyframes: [
        { beat: '第一帧', imagePrompt: '第一帧画面' },
        { beat: '第二帧', imagePrompt: '第二帧画面' }
      ]
    }
  }, { userId: user.id });

  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'key 1', outputFormat: 'png', videoProjectId: project.id, videoFrameKind: 'keyframe', videoFrameIndex: 1 },
    { userId: user.id }
  );
  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'between', outputFormat: 'png', videoProjectId: project.id, videoFrameKind: 'between', videoFromIndex: 1, videoToIndex: 2 },
    { userId: user.id }
  );
  let synced = videoProjects.syncVideoProjectStatus(project.id, { userId: user.id });
  assert.equal(synced.nextStatus, 'generating');
  assert.equal(synced.progress.completed, 1);
  let listed = videoProjects.listVideoProjects({ userId: user.id, limit: 50 }).items.find((item) => item.id === project.id);
  assert.equal(listed.imageCount, 1);
  assert.equal(listed.progress.completed, 1);
  assert.equal(listed.progress.computedStatus, 'generating');

  await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'key 2', outputFormat: 'png', videoProjectId: project.id, videoFrameKind: 'keyframe', videoFrameIndex: 2 },
    { userId: user.id }
  );
  synced = videoProjects.syncVideoProjectStatus(project.id, { userId: user.id });
  assert.equal(synced.nextStatus, 'completed');
  assert.equal(synced.progress.completed, 2);
  listed = videoProjects.listVideoProjects({ userId: user.id, limit: 50 }).items.find((item) => item.id === project.id);
  assert.equal(listed.imageCount, 2);
  assert.equal(listed.progress.completed, 2);
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

async function callVideoRoute(method, pathname, { body, asUser = user, query = '' } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  req.session = asUser ? { user: asUser } : null;
  const res = mockRes();
  const url = new URL(`http://localhost${pathname}${query}`);
  await route.handleVideoProjectsRoute(req, res, pathname, url);
  return res;
}

test('video projects route supports CRUD and project images stay out of normal gallery', async () => {
  const create = await callVideoRoute('POST', '/api/video-projects', {
    body: {
      title: 'API 视频项目',
      prompt: '猫把霓虹灯带到屋顶。',
      status: 'storyboard',
      storyboard: {
        keyframes: [
          { beat: '猫出现', imagePrompt: '发光猫出现在旧楼门口' },
          { beat: '屋顶星河', imagePrompt: '屋顶灯光变成星河' }
        ]
      }
    }
  });
  assert.equal(create.statusCode, 201);
  const created = create.json().project;
  assert.ok(created.id);
  assert.equal(created.keyframeCount, 2);

  const list = await callVideoRoute('GET', '/api/video-projects', { query: '?limit=10' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items.some((item) => item.id === created.id), true);

  const update = await callVideoRoute('PUT', `/api/video-projects/${encodeURIComponent(created.id)}`, {
    body: {
      ...created,
      title: 'API 视频项目修订',
      status: 'generating',
      storyboard: created.storyboard
    }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().project.title, 'API 视频项目修订');

  const queuedJob = db.generationJobs.create({
    userId: user.id,
    status: 'queued',
    payload: {
      model: 'test-image-model',
      prompt: '继续生成第二帧',
      n: 1,
      videoProjectId: created.id,
      videoFrameKind: 'keyframe',
      videoFrameIndex: 2
    },
    promptPreview: '继续生成第二帧',
    profileName: 'Video Test',
    model: 'test-image-model',
    n: 1
  });

  const saved = await gallery.saveGeneratedImages(
    [{ b64_json: Buffer.from(PNG_BYTES).toString('base64') }],
    { prompt: 'video keyframe', outputFormat: 'png', videoProjectId: created.id, videoFrameKind: 'keyframe', videoFrameIndex: 1 },
    { userId: user.id }
  );
  assert.equal(saved.saved.length, 1);
  assert.equal(db.images.listByVideoProject(created.id, { limit: 10 }).length, 1);

  const normalGallery = await gallery.listGallery({ userId: user.id, limit: 100, scope: 'mine' });
  assert.equal(normalGallery.items.some((item) => item.videoProjectId === created.id), false);

  const detail = await callVideoRoute('GET', `/api/video-projects/${encodeURIComponent(created.id)}`);
  assert.equal(detail.statusCode, 200);
  const detailBody = detail.json();
  assert.equal(detailBody.jobs.length, 1);
  assert.equal(detailBody.jobs[0].id, queuedJob.id);
  assert.equal(detailBody.jobs[0].videoFrameKind, 'keyframe');
  assert.equal(detailBody.jobs[0].videoFrameIndex, 2);
  assert.equal(detailBody.images.length, 1);
  assert.equal(detailBody.project.progress.completed, 1);
  assert.equal(detailBody.project.progress.queued, 1);

  const other = auth.register({ username: 'video_route_other', email: 'video-route-other@example.com', password: 'longenough1' });
  const forbidden = await callVideoRoute('GET', `/api/video-projects/${encodeURIComponent(created.id)}`, { asUser: other });
  assert.equal(forbidden.statusCode, 403);

  const del = await callVideoRoute('DELETE', `/api/video-projects/${encodeURIComponent(created.id)}`);
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().removed.length, 1);
  assert.equal(del.json().cancelledJobs.length, 1);
  assert.equal(db.generationJobs.findById(queuedJob.id).status, 'cancelled');
  assert.equal(db.videoProjects.findById(created.id), null);
  assert.equal(db.images.listByVideoProject(created.id, { limit: 10 }).length, 0);
});
