import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatJobDuration,
  jobFirstThumb,
  jobImageSrcFromItem,
  jobMeta,
  jobProgressInfo,
  jobQueueEmptyLine,
  jobQueueEmptyText,
  jobQueueSummaryHtml,
  jobStatusLabel,
  jobStatusTone,
  renderJobCard,
  renderJobListSection
} from '../public/modules/jobs-view.js';

test('jobs view formats status, durations, image sources and metadata', () => {
  assert.equal(jobStatusLabel('queued'), '排队');
  assert.equal(jobStatusLabel('unknown'), 'unknown');
  assert.equal(jobStatusTone('succeeded'), 'ok');
  assert.equal(jobStatusTone('failed'), 'err');
  assert.equal(jobStatusTone('running'), 'busy');
  assert.equal(jobStatusTone('cancelled'), 'muted');
  assert.equal(jobStatusTone('queued'), 'queued');

  assert.equal(formatJobDuration(0), '0s');
  assert.equal(formatJobDuration(1500), '2s');
  assert.equal(formatJobDuration(61_000), '1m 1s');
  assert.equal(jobProgressInfo({ status: 'queued' }).text, '');
  assert.equal(jobProgressInfo({ status: 'running', startedAt: 1_000 }, { nowMs: 66_000 }).text, '已运行 1m 5s');

  assert.equal(jobImageSrcFromItem({ local_url: '/local' }), '/local');
  assert.equal(jobImageSrcFromItem({ localUrl: '/camel' }), '/camel');
  assert.equal(jobImageSrcFromItem({ url: '/url' }), '/url');
  assert.equal(jobImageSrcFromItem({ b64_json: 'data:image/jpeg;base64,abc' }), 'data:image/jpeg;base64,abc');
  assert.equal(jobImageSrcFromItem({ b64_json: 'abc' }), 'data:image/png;base64,abc');
  assert.equal(jobFirstThumb({ result: { data: [{ url: '/thumb' }] } }), '/thumb');

  assert.equal(jobMeta({ payload: { jobType: 'comic_storyboard', model: 'm', pageLimit: 3 } }), '漫画页分镜 · m · 模型自动页数 · 最多 3 页');
  assert.equal(jobMeta({ payload: { model: 'm', size: 's', quality: 'q', n: 2 } }), 'm · s · q · n=2');
});

test('jobs view renders queue summaries and empty lines', () => {
  assert.match(jobQueueSummaryHtml({ queuedCount: 2, runningCount: 1 }), /<strong>2<\/strong> 排队/);
  assert.equal(jobQueueEmptyText('running'), '当前没有执行中的任务。');
  assert.equal(jobQueueEmptyText('queued'), '队列为空。');
  assert.equal(jobQueueEmptyText('recent'), '暂无完成记录。');
  assert.equal(jobQueueEmptyText('other'), '暂无任务。');
  const empty = jobQueueEmptyLine('<empty>');
  assert.match(empty, /&lt;empty&gt;/);
  assert.doesNotMatch(empty, /<empty>/);

  const section = renderJobListSection([], 'queued', '<none>');
  assert.match(section, /&lt;none&gt;/);
  assert.match(renderJobListSection([], 'recent'), /暂无完成记录。/);
});

test('jobs view escapes dynamic job card fields', () => {
  const html = renderJobCard({
    id: 'job"><bad>',
    status: '<unknown>',
    promptPreview: '<prompt>',
    error: '<error>',
    model: '<model>',
    payload: {
      size: '<size>',
      quality: '<quality>',
      n: '2"><bad>'
    },
    result: { data: [{ url: '/img"><bad>' }] }
  }, 'recent"><bad>', { nowMs: 20_000 });

  assert.match(html, /data-job-id="job&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /data-status="&lt;unknown&gt;"/);
  assert.match(html, /data-kind="recent&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /src="\/img&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /title="&lt;prompt&gt;"/);
  assert.match(html, /&lt;model&gt; · &lt;size&gt; · &lt;quality&gt; · n=2&quot;&gt;&lt;bad&gt;/);
  assert.match(html, /&lt;unknown&gt;/);
  assert.match(html, /&lt;error&gt;/);
  assert.doesNotMatch(html, /<prompt>/);
  assert.doesNotMatch(html, /<error>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('jobs view renders actions by state and running progress', () => {
  const running = renderJobCard({
    id: 'r1',
    status: 'running',
    startedAt: 10_000,
    promptPreview: 'run'
  }, 'running', { nowMs: 75_000 });
  assert.match(running, /data-job-act="cancel"/);
  assert.match(running, /已运行 1m 5s/);

  const failed = renderJobCard({ id: 'f1', status: 'failed', promptPreview: 'fail' }, 'recent');
  assert.match(failed, /data-job-act="retry"/);
  assert.match(failed, /data-job-act="dismiss"/);

  const succeeded = renderJobListSection([{ id: 's1', status: 'succeeded', promptPreview: 'ok' }], 'recent');
  assert.match(succeeded, /成功/);
  assert.match(succeeded, /data-job-act="dismiss"/);
});
