import { escapeHtml } from './dom.js';
import { t } from './i18n.js';

const FINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);
const VIDEO_TIMELINE_SCALE = 1_000_000;
const VIDEO_DEFAULT_COARSE_COUNT = 4;

export function jobStatusLabel(status) {
  return t(`job.status.${status}`, {}, status || t('common.empty'));
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
  if (value <= 0) return t('duration.zero');
  const sec = Math.max(1, Math.round(value / 1000));
  if (sec < 60) return t('duration.seconds', { value: sec });
  return t('duration.minutesSeconds', {
    minutes: Math.floor(sec / 60),
    seconds: sec % 60
  });
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
  return { text: t('jobs.progress.running', { duration: formatJobDuration(elapsed) }) };
}

export function jobMeta(job = {}) {
  const payload = job.payload || {};
  if (payload.jobType === 'comic_storyboard') {
    const pageLimit = payload.pageLimit ?? payload.pageCount ?? payload.panelCount;
    return [
      t('jobs.meta.comicStoryboard'),
      job.model || payload.model,
      pageLimit ? t('jobs.meta.autoPages', { count: pageLimit }) : ''
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (payload.jobType === 'video_storyboard') {
    const keyframeLimit = payload.keyframeLimit ?? payload.keyframeCount;
    return [
      t('jobs.meta.videoStoryboard'),
      job.model || payload.model,
      keyframeLimit ? t('jobs.meta.autoKeyframes', { count: keyframeLimit }) : ''
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return [job.model || payload.model, payload.size, payload.quality, `n=${job.n || payload.n || 1}`]
    .filter(Boolean)
    .join(' · ');
}

function videoTimelineLabel(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return '?';
  const tick = raw < VIDEO_TIMELINE_SCALE
    ? Math.round(raw * VIDEO_TIMELINE_SCALE)
    : Math.round(raw);
  const whole = Math.floor(tick / VIDEO_TIMELINE_SCALE);
  const rest = tick - whole * VIDEO_TIMELINE_SCALE;
  if (!rest) return String(whole);

  const coarseDenominator = VIDEO_DEFAULT_COARSE_COUNT + 1;
  const coarseSlot = Math.round((rest / VIDEO_TIMELINE_SCALE) * coarseDenominator);
  const coarseTick = Math.round((coarseSlot * VIDEO_TIMELINE_SCALE) / coarseDenominator);
  if (coarseSlot > 0 && coarseSlot < coarseDenominator && Math.abs(rest - coarseTick) <= 2) {
    return `${whole}.${coarseSlot}`;
  }
  return (tick / VIDEO_TIMELINE_SCALE).toFixed(4).replace(/0+$/, '').replace(/[.]$/, '') || String(whole);
}

export function jobTitle(job = {}) {
  const payload = job.payload || {};
  if (payload.jobType === 'video_storyboard') return t('jobs.title.videoStoryboard');
  if (payload.videoFrameKind === 'keyframe') {
    const index = Number(payload.videoFrameIndex);
    return t('jobs.title.videoKeyframe', { index: Number.isInteger(index) && index > 0 ? index : '?' });
  }
  if (payload.videoFrameKind === 'between') {
    return t('jobs.title.videoBetween', { label: videoTimelineLabel(payload.videoFrameIndex) });
  }
  if (payload.videoFrameKind === 'reference') return t('jobs.title.videoReference');
  return job.promptPreview || payload.prompt || t('jobs.prompt.untitled');
}

export function jobQueueEmptyLine(text) {
  return `<div class="job-queue-empty">${escapeHtml(text)}</div>`;
}

export function jobQueueEmptyText(kind = '') {
  return {
    running: t('jobs.empty.running'),
    queued: t('jobs.empty.queued'),
    recent: t('jobs.empty.recent')
  }[kind] || t('jobs.empty.default');
}

export function jobQueueSummaryHtml({ queuedCount = 0, runningCount = 0 } = {}) {
  const queued = Number(queuedCount) || 0;
  const running = Number(runningCount) || 0;
  return `
      <span><strong>${queued}</strong> ${escapeHtml(t('jobs.summary.queued'))}</span>
      <span><strong>${running}</strong> ${escapeHtml(t('jobs.summary.running'))}</span>
    `;
}

export function renderJobCard(job = {}, kind = '', { nowMs = Date.now() } = {}) {
  const prompt = job.promptPreview || job.payload?.prompt || t('jobs.prompt.untitled');
  const title = jobTitle(job);
  const tone = jobStatusTone(job.status);
  const info = jobProgressInfo(job, { nowMs });
  const canCancel = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'failed' || job.status === 'timeout';
  const canDismiss = kind === 'recent' && FINAL_JOB_STATUSES.has(job.status);
  const thumb = jobFirstThumb(job);
  const position = job.status === 'queued' && job.position
    ? `<span>${escapeHtml(t('jobs.queued.position', { count: Math.max(0, Number(job.position) - 1) }))}</span>`
    : '';
  const error = job.error ? `<p class="job-card-error">${escapeHtml(job.error)}</p>` : '';
  const progress = job.status === 'running'
    ? `<div class="job-card-time">${escapeHtml(info.text)}</div>`
    : '';
  const resultThumb = thumb
    ? `<button class="job-thumb" type="button" data-job-act="preview" title="${escapeHtml(t('jobs.result.previewTitle'))}"><img src="${escapeHtml(thumb)}" alt="" /></button>`
    : `<span class="job-status-dot" data-tone="${escapeHtml(tone)}" aria-hidden="true"></span>`;

  return `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}" data-status="${escapeHtml(job.status)}" data-kind="${escapeHtml(kind)}">
      <div class="job-card-main">
        ${resultThumb}
        <div class="job-card-text">
          <div class="job-card-title" title="${escapeHtml(prompt)}">${escapeHtml(title)}</div>
          <div class="job-card-meta">${escapeHtml(jobMeta(job) || '-')}</div>
          <div class="job-card-sub"><span>${escapeHtml(jobStatusLabel(job.status))}</span>${position}</div>
          ${progress}
          ${error}
        </div>
      </div>
      <div class="job-card-actions">
        ${canCancel ? `<button class="ghost small" data-job-act="cancel" title="${escapeHtml(t('jobs.action.cancelTitle'))}">×</button>` : ''}
        ${canRetry ? `<button class="ghost small" data-job-act="retry">${escapeHtml(t('jobs.action.retry'))}</button>` : ''}
        ${canDismiss ? `<button class="ghost small" data-job-act="dismiss" title="${escapeHtml(t('jobs.action.dismissTitle'))}">${escapeHtml(t('jobs.action.dismiss'))}</button>` : ''}
      </div>
    </article>
  `;
}

export function renderJobListSection(jobs = [], kind = '', emptyText = '', { nowMs = Date.now() } = {}) {
  if (emptyText && typeof emptyText === 'object') {
    ({ nowMs = Date.now() } = emptyText);
    emptyText = '';
  }
  const rows = Array.isArray(jobs) ? jobs : [];
  return rows.length
    ? rows.map((job) => renderJobCard(job, kind, { nowMs })).join('')
    : jobQueueEmptyLine(emptyText || jobQueueEmptyText(kind));
}
