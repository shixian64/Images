import assert from 'node:assert/strict';
import test from 'node:test';

import {
  avatarInitial,
  displayAvatarUrl,
  formatUsageBytes,
  passwordDialogHtml,
  profileDialogHtml,
  profileMenuHtml,
  usageDrawerHtml,
  usageErrorHtml,
  usageProgressHtml,
  usageStorageHtml
} from '../public/modules/profile-view.js';

test('profile view renders escaped user menu and avatar state', () => {
  assert.equal(avatarInitial({ username: ' alice ' }), 'A');
  assert.equal(displayAvatarUrl({ avatarUrl: 'http://example.test/a.png' }), '');
  assert.equal(displayAvatarUrl({ avatarUrl: 'javascript:alert(1)' }), '');
  assert.equal(displayAvatarUrl({ avatarUrl: ' https://example.test/a.png ' }), 'https://example.test/a.png');

  const html = profileMenuHtml({
    username: '<alice>',
    email: 'a@example.test',
    avatarUrl: 'https://example.test/a.png?x=<bad>',
    role: 'admin'
  });

  assert.match(html, /src="https:\/\/example\.test\/a\.png\?x=&lt;bad&gt;"/);
  assert.match(html, /&lt;alice&gt;/);
  assert.match(html, /data-action="admin"/);
  assert.match(html, /data-action="logout"/);
  assert.doesNotMatch(html, /<alice>/);
  assert.doesNotMatch(html, /<bad>/);

  const userHtml = profileMenuHtml({ email: 'bob@example.test', role: 'user' });
  assert.match(userHtml, /user-avatar-text/);
  assert.match(userHtml, />B<\/span>/);
  assert.doesNotMatch(userHtml, /data-action="admin"/);
});

test('profile dialogs expose expected form hooks', () => {
  const profileHtml = profileDialogHtml();
  assert.match(profileHtml, /data-profile-form/);
  assert.match(profileHtml, /name="username"/);
  assert.match(profileHtml, /name="avatarUrl"/);

  const passwordHtml = passwordDialogHtml();
  assert.match(passwordHtml, /data-password-form/);
  assert.match(passwordHtml, /data-reset-required/);
  assert.match(passwordHtml, /name="newPassword"/);
  assert.match(passwordHtml, /data-cancel/);
});

test('profile usage view formats bytes, progress and storage safely', () => {
  assert.equal(formatUsageBytes(0), '0 B');
  assert.equal(formatUsageBytes(1024), '1.0 KB');
  assert.equal(formatUsageBytes(1024 * 1024), '1.0 MB');

  const progress = usageProgressHtml(9, 10, '<label>');
  assert.match(progress, /&lt;label&gt;/);
  assert.match(progress, /9 \/ 10 \(90%\)/);
  assert.match(progress, /quota-progress high/);
  assert.doesNotMatch(progress, /<label>/);

  const maliciousProgress = usageProgressHtml('9"><bad>', 10, '<label>');
  assert.match(maliciousProgress, /0 \/ 10 \(0%\)/);
  assert.doesNotMatch(maliciousProgress, /<bad>/);
  assert.doesNotMatch(progress, /<bad>/);

  const storage = usageStorageHtml(3 * 1024 * 1024, 4);
  assert.match(storage, /3\.0 MB \/ 4 MB \(75%\)/);
  assert.match(storage, /quota-progress mid/);
});

test('profile usage drawer escapes server-sourced numeric-ish fields and errors', () => {
  const html = usageDrawerHtml({
    quota: {
      daily_limit: 10,
      monthly_limit: 0,
      storage_limit_mb: 2
    },
    usage: {
      today: {
        calls: 7,
        promptOptimizations: 1,
        fails: 2,
        images: 3
      },
      month: {
        calls: '<bad>',
        promptOptimizations: '<bad>',
        fails: '<bad>',
        images: '<bad>'
      },
      storage: {
        bytes: '<bad>',
        images: 4
      }
    }
  });

  assert.match(html, /7 \/ 10 \(70%\)/);
  assert.match(html, /提示词优化 1 次 · 失败 2 次 · 入库 3 张/);
  assert.match(html, /0 \/ 不限/);
  assert.match(html, /本地图库共 4 张/);
  assert.doesNotMatch(html, /<bad>/);

  const error = usageErrorHtml('fail <script>alert(1)</script>');
  assert.match(error, /fail &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(error, /<script>/);
});
