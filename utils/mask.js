// API Key 脱敏工具。任何出现在日志 / 错误体 / 响应里的密钥都必须经过这里。
// 对应 docs/PRODUCT_DESIGN.md §8.6 SRE：不把 API Key 写进日志。

export function maskApiKey(key) {
  const value = String(key || '');
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
