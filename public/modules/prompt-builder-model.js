export function composePrompt(parts = {}) {
  const lines = [];
  if (parts.subject) lines.push(parts.subject);
  if (parts.style) lines.push(`风格与媒介：${parts.style}`);
  if (parts.composition) lines.push(`构图与镜头：${parts.composition}`);
  if (parts.lighting) lines.push(`光线与氛围：${parts.lighting}`);
  if (parts.palette) lines.push(`色彩与材质：${parts.palette}`);
  if (parts.text) lines.push(`画面文字：${parts.text}`);
  if (parts.negative) lines.push(`避免：${parts.negative}`);
  return lines.join('\n');
}

export function promptBuilderQualityChecks(parts = {}) {
  return {
    subject: Boolean(parts.subject),
    style: Boolean(parts.style),
    composition: Boolean(parts.composition),
    lighting: Boolean(parts.lighting),
    constraints: Boolean(parts.negative || parts.text)
  };
}
