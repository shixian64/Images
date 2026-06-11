export function buildPromptOptimizationMessages(prompt) {
  return [
    {
      role: 'system',
      content: [
        '你是专业的 AI 生图提示词优化助手。',
        '将用户的中文想法改写成更稳定、更具体、更适合图像生成模型的提示词。',
        '保留用户明确指定的主体、风格、构图、文字、禁忌和语种；不要改变核心意图。',
        '补足画面主体、环境、构图、镜头、光线、色彩、材质、细节和负面约束。',
        '按 3-5 个自然段组织输出，每段聚焦一个维度，段落之间用空行分隔。',
        '只输出优化后的完整提示词，不要解释，不要 Markdown，不要编号。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `请优化下面的生图提示词：\n\n${prompt}`
    }
  ];
}

export function extractChatText(data = {}) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content ?? data?.choices?.[0]?.text ?? data?.output_text ?? data?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('');
  }
  return String(content || '');
}

export function cleanOptimizedPrompt(text) {
  let value = String(text || '').trim();
  const fence = value.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fence) value = fence[1].trim();
  const quotePairs = [
    ['"', '"'],
    ['“', '”'],
    ["'", "'"]
  ];
  for (const [left, right] of quotePairs) {
    if (value.startsWith(left) && value.endsWith(right)) {
      value = value.slice(left.length, -right.length).trim();
      break;
    }
  }
  return value;
}

export function splitLongParagraph(paragraph, maxLength = 96) {
  const text = String(paragraph || '').trim();
  if (!text || text.length <= maxLength) return text ? [text] : [];

  const parts = text.match(/[^，,、]+[，,、]?/g) || [text];
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (current && current.length + piece.length > maxLength) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function formatOptimizedPromptParagraphs(text) {
  const value = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!value) return '';

  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  const paragraphs = [];
  for (const block of blocks.length ? blocks : [value]) {
    const sentences = block.match(/[^。！？!?；;：:]+[。！？!?；;：:]?/g) || [block];
    let current = '';

    for (const sentence of sentences) {
      const piece = sentence.trim();
      if (!piece) continue;
      if (current && current.length + piece.length > 110) {
        paragraphs.push(...splitLongParagraph(current));
        current = piece;
      } else {
        current += piece;
      }

      if (/[。！？!?；;：:]$/.test(piece) && current.length >= 38) {
        paragraphs.push(...splitLongParagraph(current));
        current = '';
      }
    }

    if (current.trim()) paragraphs.push(...splitLongParagraph(current));
  }

  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}
