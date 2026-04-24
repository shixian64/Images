// 轻量结构化日志。保持与现有 server.js 输出一致：一行 JSON。
// 对应 §9.2 观测：结构化 JSON 日志优先。
// TAG: hmt---

function nowIso() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  const line = { ts: nowIso(), level, message, ...meta };
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(JSON.stringify(line));
}

export const logger = {
  debug: (message, meta = {}) => write('debug', message, meta),
  info: (message, meta = {}) => write('info', message, meta),
  warn: (message, meta = {}) => write('warn', message, meta),
  error: (message, meta = {}) => write('error', message, meta)
};
