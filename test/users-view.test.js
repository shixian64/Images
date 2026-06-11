import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatBytes,
  formatTime,
  renderUserRow,
  roleLabel,
  shortId,
  statusLabel,
  usersErrorHtml,
  usersPagerView,
  usersTableHtml
} from '../public/modules/users-view.js';

test('users view formats common user metadata', () => {
  assert.equal(formatTime(''), '-');
  assert.equal(formatTime('not-a-date'), '-');
  assert.equal(formatBytes(0), '-');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(shortId('abcdef123456'), 'abcdef12');
  assert.equal(roleLabel('admin'), '管理员');
  assert.equal(roleLabel('user'), '普通用户');
  assert.equal(statusLabel('active'), '启用');
  assert.equal(statusLabel('disabled'), '停用');
});

test('users view renders rows with escaped dynamic fields and self controls disabled', () => {
  const html = renderUserRow({
    id: 'u"><script>',
    username: '<b>alice</b>',
    email: 'a@example.test"><img>',
    role: 'admin',
    status: 'active',
    lastLoginAt: 'not-a-date'
  }, {
    currentUserId: 'u"><script>'
  });

  assert.match(html, /data-user-id="u&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /&lt;b&gt;alice&lt;\/b&gt;/);
  assert.match(html, /a@example\.test&quot;&gt;&lt;img&gt;/);
  assert.match(html, /<span class="chip info">你<\/span>/);
  assert.match(html, /users-role-select" title="不能修改自己" disabled/);
  assert.match(html, /users-status-btn" title="不能修改自己" disabled/);
  assert.doesNotMatch(html, /<b>alice<\/b>/);
});

test('users view renders table empty state and populated rows', () => {
  assert.match(usersTableHtml([]), /暂无用户数据/);

  const html = usersTableHtml([
    { id: 'u1', username: 'Alice', email: 'a@example.test', role: 'user', status: 'disabled' }
  ]);
  assert.match(html, /<table class="users-table">/);
  assert.match(html, /Alice/);
  assert.match(html, /普通用户/);
  assert.match(html, /停用/);
});

test('users view renders escaped error banner', () => {
  const html = usersErrorHtml('<script>alert(1)</script> "><bad>', { prefix: '加载用户失败：' });

  assert.match(html, /class="error-banner"/);
  assert.match(html, /加载用户失败：&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;&gt;&lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<bad>/);
});

test('users view renders pager visibility and boundaries', () => {
  assert.deepEqual(usersPagerView({ filtered: 10, pageSize: 50, page: 1 }), {
    hidden: true,
    html: ''
  });

  const middle = usersPagerView({ filtered: 120, pageSize: 50, page: 2 });
  assert.equal(middle.hidden, false);
  assert.match(middle.html, /第 2 \/ 3 页/);
  assert.match(middle.html, /data-users-pager="prev" >/);
  assert.match(middle.html, /data-users-pager="next" >/);

  const last = usersPagerView({ filtered: 120, pageSize: 50, page: 3 });
  assert.match(last.html, /data-users-pager="next" disabled/);
});
