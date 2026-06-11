import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fmtDuration,
  logLevelChipClass,
  renderUserDetailBody,
  statusChipClass,
  statusText
} from '../public/modules/users-detail-view.js';

test('users detail view formats status, log level, and durations', () => {
  assert.equal(statusText('queued'), '排队');
  assert.equal(statusText('running'), '执行中');
  assert.equal(statusText('unknown'), 'unknown');
  assert.equal(statusText(''), '-');

  assert.equal(statusChipClass('succeeded'), 'ok');
  assert.equal(statusChipClass('failed'), 'err');
  assert.equal(statusChipClass('timeout'), 'err');
  assert.equal(statusChipClass('running'), 'info');
  assert.equal(statusChipClass('cancelled'), '');
  assert.equal(statusChipClass('queued'), 'info');

  assert.equal(logLevelChipClass('error'), 'err');
  assert.equal(logLevelChipClass('warn'), 'warn');
  assert.equal(logLevelChipClass('info'), 'info');
  assert.equal(logLevelChipClass('debug'), '');

  assert.equal(fmtDuration(0), '-');
  assert.equal(fmtDuration(-10), '-');
  assert.equal(fmtDuration(250), '250ms');
  assert.equal(fmtDuration(1600), '2s');
  assert.equal(fmtDuration(65_000), '1m 5s');
});

test('users detail view escapes dynamic fields across sections', () => {
  const html = renderUserDetailBody({
    user: {
      id: 'u"><script>',
      username: '<img src=x onerror=alert(1)>',
      email: 'user@example.test"><bad>',
      role: 'admin',
      status: 'active',
      createdAt: 'not-a-date'
    },
    stats: {
      imageCount: 2,
      imageBytes: 2048,
      activeSessions: 1,
      lastImageAt: 'not-a-date'
    },
    sessions: [{
      ip: '127.0.0.1"><img>',
      userAgent: '<script>alert(1)</script>',
      createdAt: 'not-a-date'
    }],
    jobs: [{
      status: 'failed',
      createdAt: 'not-a-date',
      model: 'model"><x>',
      n: 2,
      promptPreview: '<b>prompt</b>',
      error: '<error>boom</error>'
    }],
    clientLogs: [{
      level: 'error',
      receivedAt: 'not-a-date',
      clientTs: 'not-a-date',
      message: '<log message>',
      pageUrl: 'https://example.test/?q=<script>',
      meta: { nested: '<meta>' }
    }],
    audits: [{
      action: '<audit>',
      createdAt: 'not-a-date',
      actorName: '<actor>',
      meta: { token: '<secret>' }
    }],
    activityLogs: [{
      action: '<activity>',
      createdAt: 'not-a-date',
      targetType: '<target>',
      targetId: '<id>',
      meta: { path: '<path>' }
    }]
  }, {
    currentUserId: 'u"><script>'
  });

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /user@example\.test&quot;&gt;&lt;bad&gt;/);
  assert.match(html, /<code>u&quot;&gt;&lt;script&gt;<\/code>/);
  assert.match(html, /127\.0\.0\.1&quot;&gt;&lt;img&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /model&quot;&gt;&lt;x&gt; · n=2/);
  assert.match(html, /&lt;b&gt;prompt&lt;\/b&gt;/);
  assert.match(html, /&lt;error&gt;boom&lt;\/error&gt;/);
  assert.match(html, /&lt;log message&gt;/);
  assert.match(html, /https:\/\/example\.test\/\?q=&lt;script&gt;/);
  assert.match(html, /&quot;nested&quot;:&quot;&lt;meta&gt;&quot;/);
  assert.match(html, /&lt;audit&gt;/);
  assert.match(html, /&lt;actor&gt;/);
  assert.match(html, /&lt;target&gt;:&lt;id&gt;/);
  assert.match(html, /2\.0 KB/);

  assert.match(html, /data-detail-act="reset-password" disabled title="不能在自己详情页重置密码"/);
  assert.match(html, /data-detail-act="logout" disabled title="不能强制下线自己"/);
  assert.match(html, /data-detail-act="delete" disabled title="不能删除自己"/);

  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<b>prompt<\/b>/);
});

test('users detail view renders loading and escaped section errors', () => {
  const html = renderUserDetailBody({
    user: { id: 'u1', username: 'Alice' },
    loadingSections: ['jobs', 'audits'],
    sectionErrors: {
      clientLogs: '<failed>',
      activityLogs: 'bad & worse'
    }
  });

  assert.match(html, /正在加载生成记录…/);
  assert.match(html, /正在加载账户审计…/);
  assert.match(html, /加载失败：&lt;failed&gt;/);
  assert.match(html, /加载失败：bad &amp; worse/);
  assert.doesNotMatch(html, /<failed>/);
});

test('users detail view renders running job duration with injectable clock', () => {
  const html = renderUserDetailBody({
    user: { id: 'u1', username: 'Alice' },
    jobs: [{
      status: 'running',
      createdAt: 'not-a-date',
      startedAt: 1_000,
      promptPreview: 'hello'
    }]
  }, {
    now: 66_000
  });

  assert.match(html, /已运行 1m 5s/);
  assert.match(html, /<span class="chip info">执行中<\/span>/);
});
