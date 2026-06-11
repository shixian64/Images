import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatQuotaLimit,
  formatQuotaStorageMb,
  inlineQuotaCellHtml,
  quotaDefaultsCardHtml,
  quotaMiniBar,
  quotaPct,
  quotaStatusLabel,
  quotaStorageMiniBar,
  quotaTableRowHtml,
  quotaTableView
} from '../public/modules/admin-quota-view.js';

test('admin quota view formats labels and meter values', () => {
  assert.equal(quotaStatusLabel('active'), '启用');
  assert.equal(quotaStatusLabel('disabled'), '停用');
  assert.equal(formatQuotaLimit(null), '不限');
  assert.equal(formatQuotaLimit(10), '10');
  assert.equal(formatQuotaStorageMb(0), '0 MB');
  assert.equal(formatQuotaStorageMb(1024 * 1024 * 1.5), '1.5 MB');
  assert.equal(formatQuotaStorageMb(1024 * 1024 * 120), '120 MB');
  assert.equal(quotaPct(7, 10), 70);
  assert.equal(quotaPct(50, 10), 100);
  assert.equal(quotaPct(1, 0), null);

  assert.match(quotaMiniBar(7, 10), /class="quota-mini mid" value="70"/);
  assert.match(quotaMiniBar(9, 10), /class="quota-mini high" value="90"/);
  assert.match(quotaMiniBar(1, null), /quota-mini-unlim/);
  assert.match(quotaStorageMiniBar(9 * 1024 * 1024, 10), /class="quota-mini high" value="90"/);
});

test('admin quota view renders escaped defaults and inline inputs', () => {
  const defaults = quotaDefaultsCardHtml({
    daily_limit: '1"><script>',
    monthly_limit: null,
    storage_limit_mb: 500,
    concurrent_limit: 3
  });
  assert.match(defaults, /data-default-key="daily_limit"/);
  assert.match(defaults, /value="1&quot;&gt;&lt;script&gt;"/);
  assert.doesNotMatch(defaults, /<script>/);

  const cell = inlineQuotaCellHtml('u"><img>', 'daily_limit', '2"><bad>');
  assert.match(cell, /data-user-id="u&quot;&gt;&lt;img&gt;"/);
  assert.match(cell, /value="2&quot;&gt;&lt;bad&gt;"/);
  assert.match(cell, /overridden/);
  assert.doesNotMatch(cell, /<bad>/);
});

test('admin quota view renders empty table state', () => {
  const view = quotaTableView([]);
  assert.equal(view.empty, true);
  assert.match(view.html, /暂无数据/);
});

test('admin quota view renders escaped quota rows with usage chips', () => {
  const row = {
    user: {
      id: 'u"><script>',
      username: '<alice>',
      email: 'a@example.test"><img>',
      status: 'active',
      role: 'admin'
    },
    quota: {
      raw: {
        daily_limit: 10,
        monthly_limit: null,
        storage_limit_mb: 100,
        concurrent_limit: 2
      },
      daily_limit: '10"><bad>',
      monthly_limit: 100,
      storage_limit_mb: '100"><bad>'
    },
    usage: {
      today: { calls: 8, promptOptimizations: 1, fails: 2 },
      month: { calls: 95, promptOptimizations: 3, fails: 4 },
      storage: { bytes: 50 * 1024 * 1024 }
    }
  };
  const html = quotaTableRowHtml(row, { selectedIds: new Set(['u"><script>']) });

  assert.match(html, /data-quota-user-id="u&quot;&gt;&lt;script&gt;" class="selected"/);
  assert.match(html, /aria-label="选中 &lt;alice&gt;"/);
  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /a@example\.test&quot;&gt;&lt;img&gt;/);
  assert.match(html, /管理员/);
  assert.match(html, /8\/10&quot;&gt;&lt;bad&gt;/);
  assert.match(html, /95\/100/);
  assert.match(html, /50\.0 MB \/ 100&quot;&gt;&lt;bad&gt;MB/);
  assert.match(html, /优化 1\/3/);
  assert.match(html, /失败 2\/4/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('admin quota view renders populated table', () => {
  const view = quotaTableView([
    { user: { id: 'u1', username: 'Alice', status: 'disabled' }, quota: { raw: {} }, usage: {} }
  ]);
  assert.equal(view.empty, false);
  assert.match(view.html, /quota-table/);
  assert.match(view.html, /Alice/);
  assert.match(view.html, /停用/);
});
