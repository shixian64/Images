const DEFAULT_LOCALE = 'zh-CN';

const MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'common.empty': '-',
    'job.status.queued': '排队',
    'job.status.running': '执行中',
    'job.status.succeeded': '成功',
    'job.status.failed': '失败',
    'job.status.cancelled': '已取消',
    'job.status.timeout': '超时',
    'duration.ms': '{value}ms',
    'duration.seconds': '{value}s',
    'duration.minutesSeconds': '{minutes}m {seconds}s'
  }),
  'en-US': Object.freeze({
    'common.empty': '-',
    'job.status.queued': 'Queued',
    'job.status.running': 'Running',
    'job.status.succeeded': 'Succeeded',
    'job.status.failed': 'Failed',
    'job.status.cancelled': 'Cancelled',
    'job.status.timeout': 'Timed out',
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
