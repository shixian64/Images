import { escapeHtml } from './dom.js';
import {
  formatBytes,
  formatTime,
  roleLabel,
  statusLabel
} from './users-view.js';

export function statusText(status) {
  return {
    queued: '排队',
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时'
  }[status] || status || '-';
}

export function statusChipClass(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'running') return 'info';
  if (status === 'cancelled') return '';
  return 'info';
}

export function logLevelChipClass(level) {
  if (level === 'error') return 'err';
  if (level === 'warn') return 'warn';
  if (level === 'info') return 'info';
  return '';
}

export function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value < 1000) return `${Math.round(value)}ms`;
  const sec = Math.round(value / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function fallbackSection({ key, emptyText, loadingText, loadingSections, sectionErrors }) {
  if (sectionErrors[key]) return `<p class="hint err">加载失败：${escapeHtml(sectionErrors[key])}</p>`;
  if (loadingSections.has(key)) return `<p class="hint">${escapeHtml(loadingText)}</p>`;
  return `<p class="hint">${escapeHtml(emptyText)}</p>`;
}

function renderSessions(sessionsList = []) {
  if (!sessionsList.length) return '<p class="hint">无活跃会话</p>';
  return `
          <ul class="user-session-list">
            ${sessionsList.map((s) => `
              <li>
                <div><strong>${escapeHtml(s.ip || '-')}</strong> <small>${escapeHtml(formatTime(s.createdAt))}</small></div>
                <small class="user-session-ua">${escapeHtml(String(s.userAgent || '').slice(0, 96))}</small>
              </li>
            `).join('')}
          </ul>
        `;
}

function renderJobs(jobs = [], { now = Date.now(), loadingSections, sectionErrors } = {}) {
  if (!jobs.length) {
    return fallbackSection({
      key: 'jobs',
      emptyText: '暂无生成记录',
      loadingText: '正在加载生成记录…',
      loadingSections,
      sectionErrors
    });
  }
  return `
          <ul class="user-audit-list">
            ${jobs.slice(0, 30).map((job) => {
              const prompt = job.promptPreview || job.payload?.prompt || '-';
              const duration = job.startedAt && job.finishedAt
                ? fmtDuration(job.finishedAt - job.startedAt)
                : (job.startedAt ? `已运行 ${fmtDuration(now - job.startedAt)}` : '-');
              return `
                <li>
                  <span class="chip ${statusChipClass(job.status)}">${escapeHtml(statusText(job.status))}</span>
                  <small>${escapeHtml(formatTime(job.createdAt))}</small>
                  <small>${escapeHtml(job.model || '-')} · n=${job.n || 1} · ${escapeHtml(duration)}</small>
                  <code class="user-audit-meta">${escapeHtml(prompt)}</code>
                  ${job.error ? `<small class="queue-error-line">${escapeHtml(job.error)}</small>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        `;
}

function renderClientLogs(clientLogs = [], { loadingSections, sectionErrors } = {}) {
  if (!clientLogs.length) {
    return fallbackSection({
      key: 'clientLogs',
      emptyText: '暂无客户端日志；用户刷新页面后，新日志会自动同步到服务端。',
      loadingText: '正在加载客户端日志…',
      loadingSections,
      sectionErrors
    });
  }
  return `
          <ul class="user-audit-list">
            ${clientLogs.slice(0, 50).map((log) => {
              const meta = log.meta ? JSON.stringify(log.meta) : '';
              return `
                <li>
                  <span class="chip ${logLevelChipClass(log.level)}">${escapeHtml(log.level || '-')}</span>
                  <small>${escapeHtml(formatTime(log.receivedAt))}</small>
                  ${log.clientTs ? `<small>客户端：${escapeHtml(formatTime(log.clientTs))}</small>` : ''}
                  <small>${escapeHtml(log.message || '-')}</small>
                  ${log.pageUrl ? `<small class="client-log-url">${escapeHtml(log.pageUrl)}</small>` : ''}
                  ${meta ? `<code class="user-audit-meta">${escapeHtml(meta)}</code>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        `;
}

function renderAuditList(items = [], {
  key,
  emptyText,
  loadingText,
  actorText = (item) => item.actorName || item.actorId || '-',
  loadingSections,
  sectionErrors
} = {}) {
  if (!items.length) {
    return fallbackSection({ key, emptyText, loadingText, loadingSections, sectionErrors });
  }
  return `
          <ul class="user-audit-list">
            ${items.slice(0, 30).map((a) => `
              <li>
                <span class="chip">${escapeHtml(a.action)}</span>
                <small>${escapeHtml(formatTime(a.createdAt))}</small>
                <small>${escapeHtml(actorText(a))}</small>
                ${a.meta ? `<code class="user-audit-meta">${escapeHtml(JSON.stringify(a.meta))}</code>` : ''}
              </li>
            `).join('')}
          </ul>
        `;
}

export function renderUserDetailBody(detail = {}, {
  currentUserId = '',
  now = Date.now()
} = {}) {
  const u = detail?.user || {};
  const stats = detail?.stats || {};
  const sessionsList = Array.isArray(detail?.sessions) ? detail.sessions : [];
  const audits = Array.isArray(detail?.audits) ? detail.audits : [];
  const activityLogs = Array.isArray(detail?.activityLogs) ? detail.activityLogs : [];
  const jobs = Array.isArray(detail?.jobs) ? detail.jobs : [];
  const clientLogs = Array.isArray(detail?.clientLogs) ? detail.clientLogs : [];
  const loadingSections = new Set(Array.isArray(detail?.loadingSections) ? detail.loadingSections : []);
  const sectionErrors = detail?.sectionErrors && typeof detail.sectionErrors === 'object' ? detail.sectionErrors : {};
  const isSelf = u.id === currentUserId;

  return `
    <div class="user-detail">
      <section class="user-detail-block">
        <h3>基本资料</h3>
        <dl class="user-detail-grid">
          <dt>用户名</dt><dd>${escapeHtml(u.username || '-')}</dd>
          <dt>邮箱</dt><dd>${escapeHtml(u.email || '-')}</dd>
          <dt>ID</dt><dd><code>${escapeHtml(u.id || '-')}</code></dd>
          <dt>角色</dt><dd>${escapeHtml(roleLabel(u.role))}</dd>
          <dt>状态</dt><dd><span class="chip ${u.status === 'active' ? 'ok' : 'err'}">${statusLabel(u.status)}</span></dd>
          <dt>注册时间</dt><dd>${escapeHtml(formatTime(u.created_at || u.createdAt))}</dd>
          <dt>最后登录</dt><dd>${escapeHtml(formatTime(u.last_login_at || u.lastLoginAt))}</dd>
        </dl>
      </section>

      <section class="user-detail-block">
        <h3>资产统计</h3>
        <div class="user-detail-stats">
          <div><span>图片数</span><strong>${stats.imageCount || 0}</strong></div>
          <div><span>占用容量</span><strong>${formatBytes(stats.imageBytes)}</strong></div>
          <div><span>最近一张</span><strong>${escapeHtml(formatTime(stats.lastImageAt))}</strong></div>
          <div><span>活跃会话</span><strong>${stats.activeSessions || 0}</strong></div>
        </div>
      </section>

      <section class="user-detail-block">
        <h3>操作</h3>
        <div class="user-detail-actions">
          <button class="ghost small" data-detail-act="reset-password"${isSelf ? ' disabled title="不能在自己详情页重置密码"' : ''}>重置密码</button>
          <button class="ghost small" data-detail-act="logout"${isSelf ? ' disabled title="不能强制下线自己"' : ''}>强制下线</button>
          <button class="danger ghost small" data-detail-act="delete"${isSelf ? ' disabled title="不能删除自己"' : ''}>删除用户</button>
        </div>
        <p class="hint">删除用户将一并清理其图片目录与会话；不可恢复。</p>
      </section>

      <section class="user-detail-block">
        <h3>活跃会话 (${sessionsList.length})</h3>
        ${renderSessions(sessionsList)}
      </section>

      <section class="user-detail-block">
        <h3>生成记录 (${jobs.length})</h3>
        <p class="hint">这里显示服务端队列记录；用户浏览器日志见下方「客户端详细日志」。</p>
        ${renderJobs(jobs, { now, loadingSections, sectionErrors })}
      </section>

      <section class="user-detail-block">
        <h3>客户端详细日志 (${clientLogs.length})</h3>
        <p class="hint">用户浏览器「日志面板」自动同步的本地日志，包含前端错误和未处理异常；敏感字段会在上传前后脱敏。</p>
        ${renderClientLogs(clientLogs, { loadingSections, sectionErrors })}
      </section>

      <section class="user-detail-block">
        <h3>账户审计 (${audits.length})</h3>
        ${renderAuditList(audits, {
          key: 'audits',
          emptyText: '暂无账户审计记录',
          loadingText: '正在加载账户审计…',
          loadingSections,
          sectionErrors
        })}
      </section>

      <section class="user-detail-block">
        <h3>用户操作日志 (${activityLogs.length})</h3>
        ${renderAuditList(activityLogs, {
          key: 'activityLogs',
          emptyText: '暂无用户侧操作日志',
          loadingText: '正在加载用户操作日志…',
          actorText: (item) => [item.targetType, item.targetId].filter(Boolean).join(':') || '-',
          loadingSections,
          sectionErrors
        })}
      </section>
    </div>
  `;
}
