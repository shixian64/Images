export function truncateJsonText(value, maxChars) {
  const text = String(value ?? '');
  const max = Math.max(0, Math.floor(Number(maxChars) || 0));
  if (text.length <= max) return text;
  if (max <= 0) return '';
  if (max <= 3) return '.'.repeat(max);
  return `${text.slice(0, max - 3)}...`;
}

export function compactJsonValueForBudget(value, {
  maxJsonChars,
  alreadyJson = false
} = {}) {
  const max = Math.max(0, Math.floor(Number(maxJsonChars) || 0));
  const json = alreadyJson ? String(value ?? '') : JSON.stringify(value);
  const out = {
    truncated: true,
    originalJsonChars: json.length
  };
  const overhead = JSON.stringify(out).length;
  out.preview = truncateJsonText(json, Math.max(0, max - overhead - 1));
  while (JSON.stringify(out).length > max && out.preview.length > 0) {
    out.preview = truncateJsonText(out.preview, Math.max(0, out.preview.length - 256));
  }
  return out;
}
