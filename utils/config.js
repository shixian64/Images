const POSITIVE_INT_ENV_SPECS = new Map([
  ['MAX_JSON_BODY_BYTES', { fallback: 1024 * 1024 }],
  ['MAX_MULTIPART_BODY_BYTES', { fallback: 100 * 1024 * 1024 }],
  ['MAX_UPSTREAM_RESPONSE_BYTES', { fallback: 64 * 1024 * 1024 }],
  ['MAX_IMAGES_PER_REQUEST', { fallback: 4 }],
  ['IMAGE_GENERATION_BATCH_CONCURRENCY', { fallback: 2 }],
  ['GLOBAL_CONCURRENT_GENERATIONS', { fallback: 4 }],
  ['DEFAULT_DAILY_LIMIT', { fallback: 10 }],
  ['DEFAULT_MONTHLY_LIMIT', { fallback: 200 }],
  ['DEFAULT_STORAGE_LIMIT_MB', { fallback: 500 }],
  ['DEFAULT_CONCURRENT_LIMIT', { fallback: 1 }],
  ['REGISTRATION_IP_MAX_PER_10MIN', { fallback: 3 }],
  ['REGISTRATION_IP_MAX_PER_DAY', { fallback: 5 }],
  ['SIGNUP_IP_DAILY_LIMIT', { fallback: 20, allowZero: true }],
  ['SIGNUP_IP_MONTHLY_LIMIT', { fallback: 400, allowZero: true }],
  ['IMAGE_GENERATION_TIMEOUT_MS', { fallback: 10 * 60 * 1000 }],
  ['IMAGE_DOWNLOAD_TIMEOUT_MS', { fallback: 60_000 }],
  ['MAX_IMAGE_DOWNLOAD_BYTES', { fallback: 25 * 1024 * 1024 }],
  ['MAX_REFERENCE_IMAGES', { fallback: 4 }],
  ['MAX_REFERENCE_IMAGE_BYTES', { fallback: 20 * 1024 * 1024 }],
  ['MAX_REFERENCE_IMAGE_TOTAL_BYTES', { fallback: 80 * 1024 * 1024 }],
  ['REFERENCE_JOB_FILE_TTL_HOURS', { fallback: 24 }],
  ['GENERATE_STREAM_HEARTBEAT_MS', { fallback: 15 * 1000 }],
  ['SHUTDOWN_TIMEOUT_MS', { fallback: 10_000 }],
  ['SQLITE_BUSY_TIMEOUT_MS', { fallback: 5_000, allowZero: true }],
  ['SQLITE_WAL_AUTOCHECKPOINT_PAGES', { fallback: 1_000, allowZero: true }],
  ['DATA_CLEANUP_INTERVAL_MS', { fallback: 60 * 60 * 1000, allowZero: true }],
  ['AUDIT_LOG_RETENTION_DAYS', { fallback: 180, allowZero: true }],
  ['CLIENT_LOG_RETENTION_DAYS', { fallback: 30, allowZero: true }],
  ['USAGE_DAILY_RETENTION_DAYS', { fallback: 400, allowZero: true }],
  ['LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE', { fallback: 20 }],
  ['LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE', { fallback: 8 }],
  ['LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE', { fallback: 5 }],
  ['CHAT_RATE_LIMIT_MAX_PER_MINUTE', { fallback: 20 }],
  ['CHAT_GLOBAL_CONCURRENT_REQUESTS', { fallback: 4 }],
  ['CHAT_MAX_MESSAGES', { fallback: 12 }],
  ['CHAT_MAX_INPUT_CHARS', { fallback: 12_000 }],
  ['CHAT_DEFAULT_MAX_COMPLETION_TOKENS', { fallback: 1200 }],
  ['CHAT_MAX_COMPLETION_TOKENS', { fallback: 2000 }],
  ['CHAT_COMPLETION_TIMEOUT_MS', { fallback: 180_000 }],
  ['TEST_PROFILE_TIMEOUT_MS', { fallback: 30_000 }],
  ['PORT', { fallback: 8787 }]
]);

export function parsePositiveInt(value, fallback, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (allowZero && n === 0) return 0;
  return n > 0 ? Math.floor(n) : fallback;
}

function normalizePositiveIntSpec(name, fallback, options = {}) {
  const normalized = {
    fallback,
    allowZero: options.allowZero === true
  };
  POSITIVE_INT_ENV_SPECS.set(name, normalized);
  return normalized;
}

export function positiveIntFromEnv(name, fallback, options = {}) {
  const spec = normalizePositiveIntSpec(name, fallback, options);
  return parsePositiveInt(process.env[name], spec.fallback, spec);
}

function invalidPositiveIntValue(value, { allowZero = false } = {}) {
  if (value === undefined || value === '') return false;
  const n = Number(value);
  if (!Number.isFinite(n)) return true;
  if (allowZero && n === 0) return false;
  return n <= 0;
}

export function validateEnvConfig({ logger } = {}) {
  const warnings = [];
  for (const [name, spec] of POSITIVE_INT_ENV_SPECS.entries()) {
    const value = process.env[name];
    if (!invalidPositiveIntValue(value, spec)) continue;
    warnings.push({
      name,
      value: String(value),
      fallback: spec.fallback,
      code: 'invalid_positive_int_env'
    });
  }
  if (logger && typeof logger.warn === 'function') {
    for (const warning of warnings) {
      logger.warn('config.env.invalid_positive_int', warning);
    }
  }
  return warnings;
}

export function knownPositiveIntEnvNames() {
  return Array.from(POSITIVE_INT_ENV_SPECS.keys()).sort();
}
