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
  usageLoadingHtml,
  usageProgressHtml,
  usageStorageHtml
} from '../public/modules/profile-view.js';
import { setLocale } from '../public/modules/i18n.js';

test('profile view renders escaped user menu and avatar state', () => {
  setLocale('zh-CN');
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
  setLocale('zh-CN');
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
  setLocale('zh-CN');
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
  setLocale('zh-CN');
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

test('profile view uses locale messages for menu, dialogs, and usage', () => {
  setLocale('en-US');

  const menu = profileMenuHtml({ role: 'admin' });
  assert.match(menu, /<span class="user-name">User<\/span>/);
  assert.match(menu, />Profile<\/button>/);
  assert.match(menu, />Change password<\/button>/);
  assert.match(menu, />My usage<\/button>/);
  assert.match(menu, />Admin console<\/button>/);
  assert.match(menu, />Log out<\/button>/);

  const profileHtml = profileDialogHtml();
  assert.match(profileHtml, /<h3>Profile<\/h3>/);
  assert.match(profileHtml, />Username<\/span>/);
  assert.match(profileHtml, />Avatar URL \(optional, HTTPS only\)<\/span>/);
  assert.match(profileHtml, />Cancel<\/button>/);
  assert.match(profileHtml, />Save<\/button>/);

  const passwordHtml = passwordDialogHtml();
  assert.match(passwordHtml, /<h3>Change password<\/h3>/);
  assert.match(passwordHtml, /Set a new personal password/);
  assert.match(passwordHtml, />Current password<\/span>/);
  assert.match(passwordHtml, />Submit<\/button>/);

  assert.match(usageProgressHtml(1, 0, 'Calls'), /1 \/ Unlimited/);
  assert.match(usageStorageHtml(0, 0), /Storage<\/span><strong>0 B \/ Unlimited/);
  assert.match(usageLoadingHtml(), /Loading…/);
  assert.match(usageErrorHtml(''), /Load failed/);

  const usage = usageDrawerHtml({
    quota: { daily_limit: 10, monthly_limit: 20, storage_limit_mb: 2 },
    usage: {
      today: { calls: 1, promptOptimizations: 2, fails: 3, images: 4 },
      month: { calls: 5, promptOptimizations: 6, fails: 7, images: 8 },
      storage: { bytes: 1024, images: 9 }
    }
  });
  assert.match(usage, /<h3>Today<\/h3>/);
  assert.match(usage, /Quota calls \(system-default interface\)/);
  assert.match(usage, /Prompt optimizations 2 · failures 3 · saved 4 images/);
  assert.match(usage, /<h3>This month<\/h3>/);
  assert.match(usage, /Local gallery has 9 images/);
  assert.match(usage, /Quotas are maintained by admins/);

  setLocale('zh-CN');
});
