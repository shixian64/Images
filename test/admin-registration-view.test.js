import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRegistrationInviteExpiry,
  formatRegistrationTime,
  registrationInviteRowHtml,
  registrationInviteStatus,
  registrationInviteUsersHtml,
  registrationInvitesHtml,
  registrationModeLabel,
  registrationRedemptionRowHtml,
  registrationRedemptionUserLabel,
  registrationRedemptionsByCode,
  registrationRedemptionsHtml,
  registrationSettings,
  registrationSummaryHtml
} from '../public/modules/admin-registration-view.js';

test('admin registration view formats settings and invite status', () => {
  assert.equal(formatRegistrationTime('not-a-date'), '-');
  assert.equal(formatRegistrationInviteExpiry({}), '永不过期');
  assert.equal(registrationModeLabel({ allowPublicRegistration: true, allowInviteRegistration: true }), '开放注册 + 邀请码注册');
  assert.equal(registrationModeLabel({ allowPublicRegistration: true }), '开放注册');
  assert.equal(registrationModeLabel({ allowInviteRegistration: true }), '仅邀请码注册');
  assert.equal(registrationModeLabel({}), '关闭注册');

  assert.deepEqual(registrationInviteStatus({ disabledAt: 'x' }), { className: 'err', label: '已停用' });
  assert.deepEqual(registrationInviteStatus({ expired: true }), { className: 'err', label: '已过期' });
  assert.deepEqual(registrationInviteStatus({ remainingUses: 0 }), { className: '', label: '已用完' });
  assert.deepEqual(registrationInviteStatus({ remainingUses: 1 }), { className: 'ok', label: '可用' });
  assert.deepEqual(registrationSettings(null), {});
});

test('admin registration summary and empty tables render expected states', () => {
  assert.match(registrationSummaryHtml(null), /尚未加载/);
  assert.match(registrationInvitesHtml(null), /正在等待注册配置加载/);
  assert.equal(registrationRedemptionsHtml(null), '');
  assert.match(registrationInvitesHtml({ invites: [] }), /还没有 UI 生成的邀请码/);
  assert.match(registrationRedemptionsHtml({ redemptions: [] }), /暂无兑换记录/);

  const html = registrationSummaryHtml({
    settings: {
      allowInviteRegistration: true,
      defaultInviteUses: 5,
      defaultInviteTtlDays: 7,
      source: 'env'
    },
    invites: [
      { active: true, remainingUses: 2 },
      { disabledAt: '2026-01-01T00:00:00Z', remainingUses: 0 }
    ],
    redemptions: [{ code: 'a' }]
  });

  assert.match(html, /仅邀请码注册/);
  assert.match(html, /默认次数：5/);
  assert.match(html, /可用邀请码：1 个 \/ 剩余 2 次/);
  assert.match(html, /当前来自环境变量/);
});

test('admin registration invite table escapes dynamic fields', () => {
  const redemptions = [
    { code: 'code"><bad>', username: '<alice>', email: 'a@example.test"><img>', usedAt: 'bad' },
    { code: 'code"><bad>', username: '<bob>' },
    { code: 'code"><bad>', username: '<carol>' },
    { code: 'code"><bad>', username: '<dave>' }
  ];
  const byCode = registrationRedemptionsByCode(redemptions);
  assert.equal(byCode.get('code"><bad>').length, 4);

  const usersHtml = registrationInviteUsersHtml('code"><bad>', redemptions, 4);
  assert.match(usersHtml, /&lt;alice&gt;/);
  assert.match(usersHtml, /a@example\.test&quot;&gt;&lt;img&gt;/);
  assert.match(usersHtml, /另有 1 条兑换记录/);
  assert.doesNotMatch(usersHtml, /<alice>/);

  const row = registrationInviteRowHtml({
    code: 'code"><bad>',
    displayCode: '<display>',
    usedCount: 1,
    maxUses: 5,
    remainingUses: 4,
    createdAt: 'bad',
    expiresAt: null
  }, byCode);

  assert.match(row, /&lt;display&gt;/);
  assert.match(row, /1 \/ 5/);
  assert.match(row, /data-disable-invite="code&quot;&gt;&lt;bad&gt;"/);
  assert.match(row, /data-invite-label="&lt;display&gt;"/);
  assert.doesNotMatch(row, /<display>/);
  assert.doesNotMatch(row, /<bad>/);

  const table = registrationInvitesHtml({
    invites: [{ code: 'code"><bad>', displayCode: '<display>', remainingUses: 1 }],
    redemptions
  });
  assert.match(table, /registration-invites-table/);
  assert.doesNotMatch(table, /<alice>/);
});

test('admin registration redemptions escape dynamic fields', () => {
  assert.equal(
    registrationRedemptionUserLabel({ username: '<alice>', email: 'a@example.test', userDeleted: true }),
    '<alice> · a@example.test · 用户已删除'
  );

  const row = registrationRedemptionRowHtml({
    displayCode: '<display>',
    username: '<alice>',
    email: 'a@example.test"><img>',
    userId: 'u"><bad>',
    usedAt: 'bad'
  });

  assert.match(row, /&lt;display&gt;/);
  assert.match(row, /&lt;alice&gt; · a@example\.test&quot;&gt;&lt;img&gt;/);
  assert.match(row, /u&quot;&gt;&lt;bad&gt;/);
  assert.doesNotMatch(row, /<alice>/);
  assert.doesNotMatch(row, /<bad>/);

  const table = registrationRedemptionsHtml({
    redemptions: [{ code: '<code>', email: '<mail>', userId: '<user>', usedAt: 'bad' }]
  });
  assert.match(table, /registration-redemptions-table/);
  assert.doesNotMatch(table, /<mail>/);
});
