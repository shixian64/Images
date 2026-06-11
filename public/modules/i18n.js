const DEFAULT_LOCALE = 'zh-CN';

const MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'common.empty': '-',
    'common.loadFailed': '加载失败',
    'admin.clientLogs.filter.allUsers': '全部用户',
    'admin.clientLogs.summary.count': '显示 {count} 条',
    'admin.clientLogs.empty': '暂无匹配的客户端日志。',
    'admin.clientLogs.header.time': '时间',
    'admin.clientLogs.header.user': '用户',
    'admin.clientLogs.header.level': '等级',
    'admin.clientLogs.header.messageContext': '消息 / 上下文',
    'admin.clientLogs.clientTs': '客户端：{time}',
    'job.status.queued': '排队',
    'job.status.running': '执行中',
    'job.status.succeeded': '成功',
    'job.status.failed': '失败',
    'job.status.cancelled': '已取消',
    'job.status.timeout': '超时',
    'gallery.comic.status.draft': '草稿',
    'gallery.comic.status.storyboard': '已生成页分镜',
    'gallery.comic.status.generating': '生成中',
    'gallery.comic.status.completed': '已完成',
    'gallery.comic.status.stopped': '已停止',
    'gallery.comic.status.failed': '失败',
    'gallery.comic.status.project': '项目',
    'gallery.comic.progress.images': '{completed}/{total} 张',
    'gallery.comic.progress.running': '{count} 个运行中',
    'gallery.comic.progress.queued': '{count} 个排队中',
    'gallery.comic.progress.failed': '{count} 个失败',
    'duration.ms': '{value}ms',
    'duration.seconds': '{value}s',
    'duration.minutesSeconds': '{minutes}m {seconds}s'
  }),
  'en-US': Object.freeze({
    'common.empty': '-',
    'common.loadFailed': 'Load failed',
    'admin.clientLogs.filter.allUsers': 'All users',
    'admin.clientLogs.summary.count': 'Showing {count}',
    'admin.clientLogs.empty': 'No matching client logs.',
    'admin.clientLogs.header.time': 'Time',
    'admin.clientLogs.header.user': 'User',
    'admin.clientLogs.header.level': 'Level',
    'admin.clientLogs.header.messageContext': 'Message / Context',
    'admin.clientLogs.clientTs': 'Client: {time}',
    'job.status.queued': 'Queued',
    'job.status.running': 'Running',
    'job.status.succeeded': 'Succeeded',
    'job.status.failed': 'Failed',
    'job.status.cancelled': 'Cancelled',
    'job.status.timeout': 'Timed out',
    'gallery.comic.status.draft': 'Draft',
    'gallery.comic.status.storyboard': 'Storyboard ready',
    'gallery.comic.status.generating': 'Generating',
    'gallery.comic.status.completed': 'Completed',
    'gallery.comic.status.stopped': 'Stopped',
    'gallery.comic.status.failed': 'Failed',
    'gallery.comic.status.project': 'Project',
    'gallery.comic.progress.images': '{completed}/{total} images',
    'gallery.comic.progress.running': '{count} running',
    'gallery.comic.progress.queued': '{count} queued',
    'gallery.comic.progress.failed': '{count} failed',
    'duration.ms': '{value}ms',
    'duration.seconds': '{value}s',
    'duration.minutesSeconds': '{minutes}m {seconds}s'
  })
});

let currentLocale = DEFAULT_LOCALE;

export function supportedLocales() {
  return Object.keys(MESSAGES);
}

export function normalizeLocale(locale = '') {
  const raw = String(locale || '').trim();
  if (!raw) return DEFAULT_LOCALE;
  if (MESSAGES[raw]) return raw;
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  return DEFAULT_LOCALE;
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

function interpolate(template, params = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => (
    params[key] === undefined || params[key] === null ? '' : String(params[key])
  ));
}

export function t(key, params = {}, fallback = '') {
  const id = String(key || '');
  const bundle = MESSAGES[currentLocale] || MESSAGES[DEFAULT_LOCALE];
  const template = bundle[id] ?? MESSAGES[DEFAULT_LOCALE][id] ?? fallback ?? id;
  return interpolate(template, params);
}

export function formatDateTime(value, options = {}) {
  if (!value) return t('common.empty');
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return t('common.empty');
  return date.toLocaleString(currentLocale, { hour12: false, ...options });
}

export function formatNumber(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return t('common.empty');
  return new Intl.NumberFormat(currentLocale, options).format(numeric);
}

export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return t('common.empty');
  if (n < 1000) return t('duration.ms', { value: Math.round(n) });
  const sec = Math.round(n / 1000);
  if (sec < 60) return t('duration.seconds', { value: sec });
  return t('duration.minutesSeconds', {
    minutes: Math.floor(sec / 60),
    seconds: sec % 60
  });
}
