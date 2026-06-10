// SQLite repositories for quota overrides and daily usage counters.

function usageSumFromRow(row) {
  return {
    calls: Number(row?.calls) || 0,
    images: Number(row?.images) || 0,
    bytes: Number(row?.bytes) || 0,
    promptOptimizations: Number(row?.promptOptimizations) || 0,
    fails: Number(row?.fails) || 0
  };
}

export function createUserQuotaRepository({ open, nowIso }) {
  const repo = {
    get(userId) {
      return open().prepare('SELECT * FROM user_quotas WHERE user_id = ?').get(userId) || null;
    },
    upsert(userId, patch, updatedBy) {
      const db = open();
      const cur = repo.get(userId);
      const next = { ...(cur || {}), ...patch };
      if (cur) {
        db.prepare(`
          UPDATE user_quotas SET
            daily_limit = ?, monthly_limit = ?, storage_limit_mb = ?, concurrent_limit = ?,
            updated_at = ?, updated_by = ?
          WHERE user_id = ?
        `).run(
          next.daily_limit ?? null,
          next.monthly_limit ?? null,
          next.storage_limit_mb ?? null,
          next.concurrent_limit ?? null,
          nowIso(),
          updatedBy || null,
          userId
        );
      } else {
        db.prepare(`
          INSERT INTO user_quotas
          (user_id, daily_limit, monthly_limit, storage_limit_mb, concurrent_limit, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          next.daily_limit ?? null,
          next.monthly_limit ?? null,
          next.storage_limit_mb ?? null,
          next.concurrent_limit ?? null,
          nowIso(),
          updatedBy || null
        );
      }
      return repo.get(userId);
    },
    delete(userId) {
      open().prepare('DELETE FROM user_quotas WHERE user_id = ?').run(userId);
    }
  };
  return repo;
}

export function createUsageDailyRepository({ open }) {
  const repo = {
    get(userId, day) {
      return open().prepare(
        'SELECT * FROM usage_daily WHERE user_id = ? AND day = ?'
      ).get(userId, day) || null;
    },
    // 增量累加。若行不存在则插入。
    bump(userId, day, { calls = 0, images = 0, bytes = 0, fails = 0, promptOptimizations = 0 } = {}) {
      const db = open();
      const cur = repo.get(userId, day);
      if (cur) {
        db.prepare(`
          UPDATE usage_daily SET
            call_count  = call_count  + ?,
            image_count = image_count + ?,
            bytes       = bytes       + ?,
            prompt_optimize_count = prompt_optimize_count + ?,
            fail_count  = fail_count  + ?
          WHERE user_id = ? AND day = ?
        `).run(calls, images, bytes, promptOptimizations, fails, userId, day);
      } else {
        db.prepare(`
          INSERT INTO usage_daily
            (user_id, day, call_count, image_count, bytes, prompt_optimize_count, fail_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, day, calls, images, bytes, promptOptimizations, fails);
      }
    },
    // 区间聚合：[fromDay, toDay] 含端点，YYYY-MM-DD。
    sum(userId, fromDay, toDay) {
      const row = open().prepare(`
        SELECT
          COALESCE(SUM(call_count), 0)  AS calls,
          COALESCE(SUM(image_count), 0) AS images,
          COALESCE(SUM(bytes), 0)       AS bytes,
          COALESCE(SUM(prompt_optimize_count), 0) AS promptOptimizations,
          COALESCE(SUM(fail_count), 0)  AS fails
        FROM usage_daily
        WHERE user_id = ? AND day >= ? AND day <= ?
      `).get(userId, fromDay, toDay);
      return usageSumFromRow(row);
    },
    sumBySignupIp(signupIp, fromDay, toDay) {
      const row = open().prepare(`
        SELECT
          COALESCE(SUM(d.call_count), 0)  AS calls,
          COALESCE(SUM(d.image_count), 0) AS images,
          COALESCE(SUM(d.bytes), 0)       AS bytes,
          COALESCE(SUM(d.prompt_optimize_count), 0) AS promptOptimizations,
          COALESCE(SUM(d.fail_count), 0)  AS fails
        FROM usage_daily d
        JOIN users u ON u.id = d.user_id
        WHERE u.signup_ip = ? AND u.role != 'admin' AND d.day >= ? AND d.day <= ?
      `).get(signupIp, fromDay, toDay);
      return usageSumFromRow(row);
    },
    // 清空某用户的某段时间 (admin 应急)
    reset(userId, fromDay, toDay) {
      open().prepare(
        'DELETE FROM usage_daily WHERE user_id = ? AND day >= ? AND day <= ?'
      ).run(userId, fromDay, toDay);
    },
    deleteOlderThan(cutoffDay) {
      if (!cutoffDay) return 0;
      const res = open().prepare('DELETE FROM usage_daily WHERE day < ?').run(cutoffDay);
      return res.changes;
    }
  };
  return repo;
}
