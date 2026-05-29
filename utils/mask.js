// API Key 脱敏工具。任何出现在日志 / 错误体 / 响应里的密钥都必须经过这里。
// 对应 docs/PRODUCT_DESIGN.md §8.6 SRE：不把 API Key 写进日志。
export { maskApiKey, redactSecrets } from '../shared/redaction.js';
