// 前后端共享的常量。浏览器与 Node.js 18+ 都能直接以 ESM 引入，无需打包。
// 对应 docs/PRODUCT_DESIGN.md §13.1 第 4 条：把尺寸/质量等选项抽成常量。

export const DEFAULT_MODEL = 'gpt-image-2';

export const SIZES = [
  { value: 'auto', label: 'auto（由模型决定）' },
  { value: '1024x1024', label: '1024 × 1024 · 正方形' },
  { value: '1536x1024', label: '1536 × 1024 · 横向' },
  { value: '1024x1536', label: '1024 × 1536 · 纵向' }
];

export const QUALITIES = [
  { value: 'auto', label: 'auto' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' }
];

export const BACKGROUNDS = [
  { value: 'auto', label: 'auto' },
  { value: 'opaque', label: 'opaque · 实心' },
  { value: 'transparent', label: 'transparent · 透明' }
];

export const OUTPUT_FORMATS = [
  { value: 'auto', label: 'auto' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' }
];

// 上游请求中只在非 auto 时才带上的参数名。
// services/upstream.js 和前端表单都依赖这份清单。
export const OPTIONAL_PASSTHROUGH_KEYS = Object.freeze([
  'size',
  'quality',
  'background',
  'output_format',
  'moderation'
]);

// 预估耗时表（毫秒），仅用于 UI 提示，不是真实计费。
// 粗粒度：size × quality 的查找表。
export const ESTIMATED_DURATION_MS = {
  'auto|auto': 8000,
  '1024x1024|auto': 8000,
  '1024x1024|low': 4000,
  '1024x1024|medium': 8000,
  '1024x1024|high': 14000,
  '1536x1024|auto': 10000,
  '1536x1024|high': 18000,
  '1024x1536|auto': 10000,
  '1024x1536|high': 18000
};

export function estimateDurationMs(size, quality) {
  const key = `${size || 'auto'}|${quality || 'auto'}`;
  return ESTIMATED_DURATION_MS[key] || ESTIMATED_DURATION_MS[`${size || 'auto'}|auto`] || 8000;
}
