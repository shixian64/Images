import assert from 'node:assert/strict';
import test from 'node:test';

import {
  logEmptyHtml,
  logItemHtml,
  logListHtml,
  logSummaryHtml,
  shortLogTime
} from '../public/modules/logs-view.js';
import { setLocale } from '../public/modules/i18n.js';

test('logs view renders summary counts, active level and sync state', () => {
  setLocale('zh-CN');
  const logs = [
    { level: 'info' },
    { level: 'info' },
    { level: 'warn' },
    { level: 'error' }
  ];
  const html = logSummaryHtml({
    logs,
    filtered: logs.slice(0, 2),
    activeLevel: 'warn',
    syncEnabled: true,
    syncQueueLength: 3
  });

  assert.match(html, /共 4 条 · 显示 2/);
  assert.match(html, /Info 2/);
  assert.match(html, /Warn 1/);
  assert.match(html, /Error 1/);
  assert.match(html, /class="chip warn level-chip active"/);
  assert.match(html, /data-level-filter="warn"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /服务端同步：开 · 待同步 3/);
  assert.match(html, /id="clientLogSyncToggle"/);
  assert.match(html, /checked/);

  const disabled = logSummaryHtml({ logs, filtered: [], syncEnabled: false, syncQueueLength: 9 });
  assert.match(disabled, /服务端同步：关/);
  assert.doesNotMatch(disabled, /待同步 9/);
  assert.doesNotMatch(disabled, /checked/);
});

test('logs view renders empty state', () => {
  setLocale('zh-CN');
  const html = logEmptyHtml();
  assert.match(html, /empty-state/);
  assert.match(html, /没有匹配的日志/);
  assert.equal(logListHtml([]), html);
});

test('logs view escapes dynamic log item fields', () => {
  setLocale('zh-CN');
  const html = logItemHtml({
    id: 'log"><bad>',
    ts: '2026-06-09T12:34:56.000Z',
    level: '<level>',
    message: '<script>alert(1)</script>',
    meta: {
      value: '<meta>',
      nested: { bad: 'x"><bad>' }
    }
  });

  assert.match(html, /data-id="log&quot;&gt;&lt;bad&gt;"/);
  assert.match(html, /data-level="&lt;level&gt;"/);
  assert.match(html, />12:34:56</);
  assert.match(html, /&lt;level&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&quot;value&quot;:&quot;&lt;meta&gt;&quot;/);
  assert.match(html, /x\\&quot;&gt;&lt;bad&gt;/);
  assert.match(html, /data-action="copy" data-id="log&quot;&gt;&lt;bad&gt;"/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<meta>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('logs view handles missing timestamp without throwing', () => {
  setLocale('zh-CN');
  assert.equal(shortLogTime(null), '');
  assert.equal(shortLogTime('bad'), '');

  const html = logListHtml([{ id: '1', level: 'info', message: 'hello' }]);
  assert.match(html, /class="log-item"/);
  assert.match(html, /hello/);
});

test('logs view uses locale messages for summary, sync, empty and actions', () => {
  setLocale('en-US');
  const logs = [
    { level: 'info' },
    { level: 'warn' },
    { level: 'error' }
  ];
  const summary = logSummaryHtml({
    logs,
    filtered: logs.slice(0, 1),
    activeLevel: 'info',
    syncEnabled: true,
    syncQueueLength: 2
  });

  assert.match(summary, /3 total · 1 shown/);
  assert.match(summary, /title="Filter Info logs; click again to clear"/);
  assert.match(summary, /aria-label="Sync client logs to the server"/);
  assert.match(summary, /Server sync: on · 2 pending/);

  const disabled = logSummaryHtml({ logs, filtered: [], syncEnabled: false, syncQueueLength: 9 });
  assert.match(disabled, /Server sync: off/);
  assert.doesNotMatch(disabled, /9 pending/);

  assert.match(logEmptyHtml(), /No matching logs/);
  assert.match(logItemHtml({ id: '1', level: 'info', message: 'hello' }), />Copy<\/button>/);

  setLocale('zh-CN');
});
