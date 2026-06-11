import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatQuotaLimit,
  formatQuotaStorageMb,
  inlineQuotaCellHtml,
  quotaDefaultsCardHtml,
  quotaErrorHtml,
  quotaMiniBar,
  quotaPct,
  quotaRowMenuHtml,
  quotaStatusLabel,
  quotaStorageMiniBar,
  quotaTableRowHtml,
  quotaTableView
} from '../public/modules/admin-quota-view.js';
import { setLocale } from '../public/modules/i18n.js';

test('admin quota view formats labels and meter values', () => {
  setLocale('zh-CN');
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
  setLocale('zh-CN');
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

test('admin quota view renders escaped errors and row menu actions', () => {
  setLocale('zh-CN');
  const error = quotaErrorHtml('failed <script>alert(1)</script>');
  assert.match(error, /failed &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(error, /<script>/);

  const menu = quotaRowMenuHtml();
  assert.match(menu, /data-act="edit-all"/);
  assert.match(menu, /data-act="reset-today"/);
  assert.match(menu, /data-act="reset-month"/);
  assert.match(menu, /data-act="restore" class="danger"/);
});

test('admin quota view renders empty table state', () => {
  setLocale('zh-CN');
  const view = quotaTableView([]);
  assert.equal(view.empty, true);
  assert.match(view.html, /暂无数据/);
});

test('admin quota view renders escaped quota rows with usage chips', () => {
  setLocale('zh-CN');
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
  setLocale('zh-CN');
  const view = quotaTableView([
    { user: { id: 'u1', username: 'Alice', status: 'disabled' }, quota: { raw: {} }, usage: {} }
  ]);
  assert.equal(view.empty, false);
  assert.match(view.html, /quota-table/);
  assert.match(view.html, /Alice/);
  assert.match(view.html, /停用/);
});

test('admin quota view uses locale messages for table chrome', () => {
  setLocale('en-US');
  assert.equal(quotaStatusLabel('active'), 'Enabled');
  assert.equal(quotaStatusLabel('disabled'), 'Disabled');
  assert.equal(formatQuotaLimit(null), 'Unlimited');

  const defaults = quotaDefaultsCardHtml({
    daily_limit: null,
    monthly_limit: 20,
    storage_limit_mb: 500,
    concurrent_limit: 3
  });
  assert.match(defaults, /System daily call limit/);
  assert.match(defaults, /placeholder="Unlimited"/);
  assert.match(defaults, /calls\/month/);

  const menu = quotaRowMenuHtml();
  assert.match(menu, /Edit all fields/);
  assert.match(menu, /Reset today usage/);
  assert.match(menu, /Restore defaults/);

  assert.match(inlineQuotaCellHtml('u1', 'daily_limit', null), /placeholder="Inherit"/);
  assert.match(quotaErrorHtml('boom'), /boom/);
  assert.match(quotaTableView([]).html, /No data/);

  const table = quotaTableView([{
    user: { id: 'u1', username: 'Alice', status: 'active', role: 'admin' },
    quota: { raw: {}, daily_limit: 10, monthly_limit: null },
    usage: {
      today: { calls: 8, promptOptimizations: 1, fails: 2 },
      month: { calls: 95, promptOptimizations: 3, fails: 4 },
      storage: { bytes: 50 * 1024 * 1024 }
    }
  }]).html;
  assert.match(table, />User<\/th>/);
  assert.match(table, />Daily quota<\/th>/);
  assert.match(table, /aria-label="Select all"/);
  assert.match(table, /aria-label="Select Alice"/);
  assert.match(table, /Admin/);
  assert.match(table, /Today/);
  assert.match(table, /Month/);
  assert.match(table, /Storage/);
  assert.match(table, /Optimize 1\/3/);
  assert.match(table, /Failed 2\/4/);
  assert.match(table, /aria-label="More actions"/);

  setLocale('zh-CN');
});
