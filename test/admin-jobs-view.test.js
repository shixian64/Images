import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminJobLogLevelChipClass,
  adminJobRowHtml,
  adminJobSettingsHtml,
  adminJobShortId,
  adminJobStatusChipClass,
  adminJobStatusText,
  adminJobUserLabel,
  adminJobsErrorHtml,
  adminJobsSummaryHtml,
  adminJobsTableView,
  formatAdminJobDuration,
  formatAdminJobTime
} from '../public/modules/admin-jobs-view.js';

test('admin jobs view formats common labels and durations', () => {
  assert.equal(formatAdminJobTime('not-a-date'), '-');
  assert.equal(formatAdminJobDuration(0), '-');
  assert.equal(formatAdminJobDuration(999), '999ms');
  assert.equal(formatAdminJobDuration(1500), '2s');
  assert.equal(formatAdminJobDuration(61_000), '1m 1s');
  assert.equal(adminJobShortId('abcdefghi'), 'abcdefgh');
  assert.equal(adminJobShortId(''), '-');
  assert.equal(adminJobUserLabel('u1', [{ id: 'u1', username: 'Alice' }]), 'Alice');
  assert.equal(adminJobUserLabel('missing-user-id', []), 'missing-');
  assert.equal(adminJobStatusText('running'), '执行中');
  assert.equal(adminJobStatusText('<custom>'), '<custom>');
  assert.equal(adminJobStatusChipClass('succeeded'), 'ok');
  assert.equal(adminJobStatusChipClass('failed'), 'err');
  assert.equal(adminJobStatusChipClass('running'), 'info');
  assert.equal(adminJobLogLevelChipClass('warn'), 'warn');
});

test('admin jobs view renders escaped summary and settings', () => {
  const summary = adminJobsSummaryHtml({
    byStatus: { queued: '2"><bad>', running: 1, succeeded: 3, failed: 1, timeout: 2 },
    successRate: '88.5',
    avgSuccessDurationMs: 61_000
  });
  assert.match(summary, /排队 0/);
  assert.match(summary, /执行中 1/);
  assert.match(summary, /失败 3/);
  assert.match(summary, /成功率 88\.5%/);
  assert.match(summary, /平均耗时 1m 1s/);
  assert.doesNotMatch(summary, /<bad>/);

  assert.match(adminJobSettingsHtml(null), /尚未加载设置/);
  const settings = adminJobSettingsHtml({
    maintenance_mode: true,
    global_concurrency: '4"><bad>',
    max_pending_per_user: 2,
    max_pending_global: 10,
    max_wait_ms: 120_000,
    execution_timeout_ms: 180_000,
    max_retries: '1"><bad>',
    role_priorities: { admin: '<admin>' }
  });
  assert.match(settings, /id="queueMaintenanceMode" type="checkbox" checked/);
  assert.match(settings, /value="4&quot;&gt;&lt;bad&gt;"/);
  assert.match(settings, /id="queueMaxWaitMin"[^>]+value="2"/);
  assert.match(settings, /&lt;admin&gt;/);
  assert.doesNotMatch(settings, /<admin>/);
  assert.doesNotMatch(settings, /<bad>/);
});

test('admin jobs view renders empty and escaped job rows', () => {
  const empty = adminJobsTableView([]);
  assert.equal(empty.empty, true);
  assert.match(empty.html, /暂无队列任务/);

  const html = adminJobRowHtml({
    id: 'job"><bad>',
    userId: 'u1',
    user: { username: '<alice>' },
    status: '<custom>',
    promptPreview: '<prompt>',
    model: '<model>',
    n: '2"><bad>',
    profileName: '<profile>',
    error: '<error>',
    priority: '5"><bad>',
    createdAt: 'bad-date',
    startedAt: 10_000,
    finishedAt: 75_000
  }, {
    users: [{ id: 'u1', username: 'fallback' }],
    nowMs: 90_000
  });

  assert.match(html, /data-admin-job-id="job&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /&lt;custom&gt;/);
  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /title="&lt;prompt&gt;"/);
  assert.match(html, /&lt;model&gt; · n=2&quot;&gt;&lt;bad&gt; · &lt;profile&gt;/);
  assert.match(html, /&lt;error&gt;/);
  assert.match(html, /value="0"/);
  assert.match(html, /1m 5s/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<prompt>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin jobs view renders escaped error banner', () => {
  const html = adminJobsErrorHtml('加载失败 <script>alert(1)</script> "><bad>');

  assert.match(html, /class="error-banner"/);
  assert.match(html, /加载失败 &lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;&gt;&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin jobs view renders table and running cancellation state', () => {
  const view = adminJobsTableView([
    {
      id: 'job1',
      userId: 'u1',
      status: 'running',
      promptPreview: 'Run',
      priority: 7,
      startedAt: 10_000
    }
  ], {
    users: [{ id: 'u1', email: 'u1@example.test' }],
    nowMs: 75_000
  });

  assert.equal(view.empty, false);
  assert.match(view.html, /admin-jobs-table/);
  assert.match(view.html, /u1@example\.test/);
  assert.match(view.html, /value="7"/);
  assert.match(view.html, /已运行 1m 5s/);
  assert.doesNotMatch(view.html, /data-admin-job-act="cancel" disabled/);
});
