import { escapeHtml } from './dom.js';

const FINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);

export function jobStatusLabel(status) {
  return {
    queued: '排队',
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时'
  }[status] || status || '-';
}

export function jobStatusTone(status) {
  if (status === 'succeeded') return 'ok';
  if (status === 'failed' || status === 'timeout') return 'err';
  if (status === 'running') return 'busy';
  if (status === 'cancelled') return 'muted';
  return 'queued';
}

export function formatJobDuration(ms) {
  const value = Number(ms) || 0;
  if (value <= 0) return '0s';
  const sec = Math.max(1, Math.round(value / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function jobImageSrcFromItem(item = {}) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

export function jobFirstThumb(job = {}) {
  const items = Array.isArray(job?.result?.data) ? job.result.data : [];
  return jobImageSrcFromItem(items[0] || {});
}

export function jobProgressInfo(job = {}, { nowMs = Date.now() } = {}) {
  if (job.status !== 'running') return { text: '' };
  const elapsed = Math.max(0, nowMs - (Number(job.startedAt) || nowMs));
  return { text: `已运行 ${formatJobDuration(elapsed)}` };
}

export function jobMeta(job = {}) {
  const payload = job.payload || {};
  if (payload.jobType === 'comic_storyboard') {
    const pageLimit = payload.pageLimit ?? payload.pageCount ?? payload.panelCount;
    return ['漫画页分镜', job.model || payload.model, pageLimit ? `模型自动页数 · 最多 ${pageLimit} 页` : '']
      .filter(Boolean)
      .join(' · ');
  }
  return [job.model || payload.model, payload.size, payload.quality, `n=${job.n || payload.n || 1}`]
    .filter(Boolean)
    .join(' · ');
}

export function jobQueueEmptyLine(text) {
  return `<div class="job-queue-empty">${escapeHtml(text)}</div>`;
}

export function jobQueueSummaryHtml({ queuedCount = 0, runningCount = 0 } = {}) {
  const queued = Number(queuedCount) || 0;
  const running = Number(runningCount) || 0;
  return `
      <span><strong>${queued}</strong> 排队</span>
      <span><strong>${running}</strong> 进行中</span>
    `;
}

export function renderJobCard(job = {}, kind = '', { nowMs = Date.now() } = {}) {
  const prompt = job.promptPreview || job.payload?.prompt || '未命名任务';
  const tone = jobStatusTone(job.status);
  const info = jobProgressInfo(job, { nowMs });
  const canCancel = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'failed' || job.status === 'timeout';
  const canDismiss = kind === 'recent' && FINAL_JOB_STATUSES.has(job.status);
  const thumb = jobFirstThumb(job);
  const position = job.status === 'queued' && job.position ? `<span>前面还有 ${Math.max(0, Number(job.position) - 1)} 位</span>` : '';
  const error = job.error ? `<p class="job-card-error">${escapeHtml(job.error)}</p>` : '';
  const progress = job.status === 'running'
    ? `<div class="job-card-time">${escapeHtml(info.text)}</div>`
    : '';
  const resultThumb = thumb
    ? `<button class="job-thumb" type="button" data-job-act="preview" title="查看结果"><img src="${escapeHtml(thumb)}" alt="" /></button>`
    : `<span class="job-status-dot" data-tone="${escapeHtml(tone)}" aria-hidden="true"></span>`;

  return `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}" data-status="${escapeHtml(job.status)}" data-kind="${escapeHtml(kind)}">
      <div class="job-card-main">
        ${resultThumb}
        <div class="job-card-text">
          <div class="job-card-title" title="${escapeHtml(prompt)}">${escapeHtml(prompt)}</div>
          <div class="job-card-meta">${escapeHtml(jobMeta(job) || '-')}</div>
          <div class="job-card-sub"><span>${escapeHtml(jobStatusLabel(job.status))}</span>${position}</div>
          ${progress}
          ${error}
        </div>
      </div>
      <div class="job-card-actions">
        ${canCancel ? '<button class="ghost small" data-job-act="cancel" title="取消任务">×</button>' : ''}
        ${canRetry ? '<button class="ghost small" data-job-act="retry">重试</button>' : ''}
        ${canDismiss ? '<button class="ghost small" data-job-act="dismiss" title="从最近完成删除">删除</button>' : ''}
      </div>
    </article>
  `;
}

export function renderJobListSection(jobs = [], kind = '', emptyText = '', { nowMs = Date.now() } = {}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  return rows.length
    ? rows.map((job) => renderJobCard(job, kind, { nowMs })).join('')
    : jobQueueEmptyLine(emptyText);
}
