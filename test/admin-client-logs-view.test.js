import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminClientLogLevelChipClass,
  adminClientLogRowHtml,
  adminClientLogsSummaryText,
  adminClientLogsTableView,
  adminClientLogShortId,
  adminClientLogUserLabel,
  adminClientLogUserOptionsHtml,
  formatAdminClientLogTime
} from '../public/modules/admin-client-logs-view.js';

test('admin client logs view formats labels and filter options', () => {
  assert.equal(formatAdminClientLogTime('not-a-date'), '-');
  assert.equal(adminClientLogShortId('abcdefghi'), 'abcdefgh');
  assert.equal(adminClientLogShortId(''), '-');
  assert.equal(adminClientLogUserLabel('u1', [{ id: 'u1', username: 'Alice' }]), 'Alice');
  assert.equal(adminClientLogUserLabel('missing-user-id', []), 'missing-');
  assert.equal(adminClientLogLevelChipClass('error'), 'err');
  assert.equal(adminClientLogLevelChipClass('fatal'), 'err');
  assert.equal(adminClientLogLevelChipClass('warning'), 'warn');
  assert.equal(adminClientLogLevelChipClass('info'), 'ok');
  assert.equal(adminClientLogLevelChipClass('debug'), '');
  assert.equal(adminClientLogsSummaryText([{}, {}]), '显示 2 条');

  const options = adminClientLogUserOptionsHtml([
    { id: 'u"><bad>', username: '<alice>' }
  ], 'u"><bad>');
  assert.match(options, /value="u&quot;&gt;&lt;bad&gt;" selected/);
  assert.match(options, /&lt;alice&gt; \(u&quot;&gt;&lt;bad&gt;\)/);
  assert.doesNotMatch(options, /<alice>/);
  assert.doesNotMatch(options, /<bad>/);
});

test('admin client logs view renders empty and escaped populated rows', () => {
  const empty = adminClientLogsTableView([]);
  assert.equal(empty.empty, true);
  assert.match(empty.html, /暂无匹配的客户端日志/);

  const html = adminClientLogRowHtml({
    userId: 'u1',
    user: { username: '<alice>' },
    level: '<level>',
    message: '<message>',
    pageUrl: '/page?x=<bad>',
    receivedAt: 'bad-date',
    clientTs: 'bad-date',
    meta: {
      field: '<meta>',
      nested: { value: 'x"><bad>' }
    }
  }, {
    users: [{ id: 'u1', username: 'fallback' }]
  });

  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /&lt;level&gt;/);
  assert.match(html, /&lt;message&gt;/);
  assert.match(html, /\/page\?x=&lt;bad&gt;/);
  assert.match(html, /&quot;field&quot;:&quot;&lt;meta&gt;&quot;/);
  assert.match(html, /x\\&quot;&gt;&lt;bad&gt;/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<message>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin client logs view renders table with user fallback', () => {
  const view = adminClientLogsTableView([
    {
      userId: 'u123456789',
      level: 'warn',
      message: 'hello',
      receivedAt: 'bad-date'
    }
  ], {
    users: [{ id: 'u123456789', email: 'u@example.test' }]
  });

  assert.equal(view.empty, false);
  assert.match(view.html, /admin-client-log-table/);
  assert.match(view.html, /u@example\.test/);
  assert.match(view.html, /class="chip warn"/);
  assert.match(view.html, /hello/);
});
