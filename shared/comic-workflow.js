// Comic workflow primitives shared by the browser module and tests.
// Keep this file dependency-free so it can run in both Node.js and the browser.

export const DEFAULT_COMIC_STYLE_ID = 'webtoon-color';

// 整部漫画的“页数”上限。历史上 API/DB 字段叫 panelCount，
// 但在页分镜模式下它表示 page limit/page count，不表示单页内画格数。
export const COMIC_PAGE_COUNT_LIMITS = Object.freeze({
  min: 1,
  max: 12,
  default: 6
});

// Backward-compatible alias for old callers/tests.
export const COMIC_PANEL_LIMITS = COMIC_PAGE_COUNT_LIMITS;

export const COMIC_PAGE_PANEL_LIMITS = Object.freeze({
  min: 1,
  max: 8,
  default: 4
});

export const COMIC_STYLE_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'webtoon-color',
    label: '彩色条漫 / Webtoon',
    tags: ['全彩', '竖屏', '强情绪'],
    summary: '适合手机阅读的竖向彩漫：明亮色块、干净线稿、夸张表情和清晰留白。',
    stylePrompt: [
      'vertical color webtoon illustration style',
      'clean crisp line art',
      'bright cinematic color palette',
      'soft gradients and subtle rim light',
      'expressive faces, readable silhouettes',
      'mobile-first composition with breathing room'
    ].join(', '),
    consistencyPrompt: '角色脸型、发型、服装主色、线条粗细和高光方式必须跨格保持一致；每格都像同一部彩色条漫。',
    negativePrompt: 'no photorealism, no inconsistent costume, no random art style shift, no watermark, no logo, no text, no typography, no floating graphic containers'
  }),
  Object.freeze({
    id: 'manhwa-romance',
    label: '韩漫恋爱风',
    tags: ['精致', '柔光', '都市'],
    summary: '偏韩漫/女性向彩漫：修长人物、精致五官、柔和皮肤光、时装感和浪漫氛围。',
    stylePrompt: [
      'Korean romance web illustration style',
      'elegant slim character proportions',
      'delicate facial features',
      'fashionable outfits',
      'soft bloom lighting',
      'pastel highlights, polished digital painting'
    ].join(', '),
    consistencyPrompt: '保持同一套精致五官比例、发型轮廓、服装搭配和柔光肤色；情绪变化主要通过眼神和姿态表达。',
    negativePrompt: 'no chibi unless requested, no gritty texture, no western superhero anatomy, no over-saturated neon, no watermark, no text, no typography, no floating graphic containers'
  }),
  Object.freeze({
    id: 'manga-bw',
    label: '黑白日漫',
    tags: ['黑白', '网点', '速度线'],
    summary: '传统黑白漫画感：清晰墨线、网点阴影、速度线和强烈黑白节奏。',
    stylePrompt: [
      'black and white manga-inspired illustration',
      'sharp ink line art',
      'screentone shading',
      'dynamic speed lines when needed',
      'high contrast composition',
      'clean visual readability'
    ].join(', '),
    consistencyPrompt: '统一墨线粗细、网点密度、角色轮廓和黑白明暗逻辑；不要突然变成彩色或写实照片。',
    negativePrompt: 'no full color, no painterly oil texture, no muddy gray, no photographic lighting, no watermark, no text, no typography, no floating graphic containers'
  }),
  Object.freeze({
    id: 'ink-wash',
    label: '水墨国风',
    tags: ['水墨', '留白', '东方'],
    summary: '以笔墨、留白和淡彩构建氛围，适合古风、寓言、山水与诗意故事。',
    stylePrompt: [
      'Chinese ink wash narrative illustration',
      'expressive brush strokes',
      'rice paper texture',
      'elegant negative space',
      'restrained mineral colors',
      'poetic cinematic framing'
    ].join(', '),
    consistencyPrompt: '统一纸张纹理、笔触浓淡、淡彩范围和角色服饰纹样；跨格保持同一水墨世界观。',
    negativePrompt: 'no glossy 3D render, no heavy western superhero ink, no noisy background, no watermark, no text, no typography, no floating graphic containers'
  }),
  Object.freeze({
    id: 'american-comic',
    label: '美漫动作',
    tags: ['粗线', '高对比', '动作'],
    summary: '夸张透视、粗轮廓线、强对比阴影和英雄式动作节奏。',
    stylePrompt: [
      'bold American action illustration',
      'bold outlines',
      'dramatic perspective',
      'high contrast cel shading',
      'halftone texture accents',
      'dynamic action pose'
    ].join(', '),
    consistencyPrompt: '保持角色体型、服装标识、阴影块面和动作夸张程度一致；每格都像同一期美漫。',
    negativePrompt: 'no soft romance manhwa look, no photorealistic render, no inconsistent emblem, no watermark, no text, no typography, no floating graphic containers'
  }),
  Object.freeze({
    id: 'children-picture-comic',
    label: '绘本漫画',
    tags: ['温暖', '低龄', '治愈'],
    summary: '柔和、友好、图形化的绘本式分格，适合童话、亲子和治愈小故事。',
    stylePrompt: [
      'children picture book illustration',
      'warm soft colors',
      'rounded friendly shapes',
      'gentle paper texture',
      'clear simple composition',
      'whimsical details'
    ].join(', '),
    consistencyPrompt: '保持角色形状语言、温暖色盘、纸感纹理和低压叙事节奏一致；避免突然写实或阴暗。',
    negativePrompt: 'no scary horror mood, no harsh gore, no photorealism, no text, no typography, no watermark, no floating graphic containers'
  })
]);

const COMIC_PAGE_STORYBOARD_LAYOUT_GUIDE = Object.freeze([
  '规整网格型：稳定、清楚、节奏均匀，适合日常、说明、连续动作。',
  '横向条带型：从上到下推进，阅读顺序明确，适合叙事推进和场景切换。',
  '竖向条带型：强调高度、压迫、坠落、人物登场和空间纵深。',
  '大格主视觉型：一个大画格统领页面，小格辅助，突出高潮、登场、爆发或关键情绪。',
  '单页大图型：整页作为冲击画面，适合高潮、世界观展示和人物高光。',
  '破格分镜：角色、武器或视觉特效冲出边界，增强动感和临场感。',
  '斜切分镜：斜向边界制造不稳定、速度感和紧张感，适合打斗、追逐、惊慌。',
  '碎片化分镜：大量小格，节奏快、信息密集，适合回忆、混乱、连续细节和多人反应。',
  '留白型分镜：低密度、空间大，表现安静、孤独、震惊后的余韵。',
  '电影镜头型：远景→中景→特写→爆发等镜头组接，强调镜头语言。',
  '表情反应型：半身、表情特写、反应格递进，重点呈现表情和肢体变化。',
  '动作连续型：小格铺垫→斜切加速→大格爆发→特写收尾，适合战斗/运动/追逐。',
  '蒙太奇型：拼接不同时间、地点、记忆和象征画面，适合回忆、心理、时间流逝。',
  '非规则自由型：格子大小、方向、形状自由，但必须保持清晰阅读顺序。'
]);

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function nonEmpty(value, fallback = '') {
  const out = text(value);
  return out || fallback;
}

function compactLines(parts) {
  return parts
    .flat()
    .map((part) => text(part))
    .filter(Boolean)
    .join('\n');
}

export function comicStyleOptions() {
  return COMIC_STYLE_TEMPLATES.map((item) => ({
    id: item.id,
    label: item.label,
    summary: item.summary,
    tags: [...item.tags]
  }));
}

export function getComicStyleTemplate(styleId = DEFAULT_COMIC_STYLE_ID) {
  return COMIC_STYLE_TEMPLATES.find((item) => item.id === styleId)
    || COMIC_STYLE_TEMPLATES.find((item) => item.id === DEFAULT_COMIC_STYLE_ID)
    || COMIC_STYLE_TEMPLATES[0];
}

export function clampComicPageCount(value, fallback = COMIC_PAGE_COUNT_LIMITS.default) {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(COMIC_PAGE_COUNT_LIMITS.max, Math.max(COMIC_PAGE_COUNT_LIMITS.min, base));
}

export const clampComicPanelCount = clampComicPageCount;

export function clampComicPagePanelCount(value, fallback = COMIC_PAGE_PANEL_LIMITS.default) {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(COMIC_PAGE_PANEL_LIMITS.max, Math.max(COMIC_PAGE_PANEL_LIMITS.min, base));
}

function pageStoryboardGuideText() {
  return COMIC_PAGE_STORYBOARD_LAYOUT_GUIDE.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function comicStoryboardOutputSchema(style, includePageStoryboards = false) {
  const pageStoryboardSchema = {
    layout_type: '页面布局类型，例如大格主视觉型/横向条带型/斜切分镜',
    layout_keywords: [
      'manga page layout',
      'dominant panel',
      'diagonal panels'
    ],
    reading_order: '读者阅读顺序，例如从左到右、从上到下，并说明视线引导',
    visual_hierarchy: '主视觉/次视觉/留白/视觉重心如何安排',
    narrative_function: '本页排版承担的叙事作用，例如铺垫/爆发/转场/情绪停顿',
    content: '本页可编辑分镜内容摘要，概括这一页内所有页内画格发生了什么',
    panel_count: '当前这一页内部画格数（1-8），不是整部漫画页数',
    sub_panels: [
      {
        id: 'A',
        role: '开场/反应/动作/特写/收尾',
        area: '页内画格在页面中的位置与面积，例如顶部通栏、右下小格、中央大格',
        shot: '远景/中景/近景/特写',
        camera: '俯视/仰视/过肩/斜切/运动方向',
        composition: '主体、前中后景、留白、速度线、破框等',
        content: '该页内画格具体画面内容',
        transition: '与上一页内画格/下一页内画格的阅读衔接'
      }
    ],
    design_notes: '给生图模型看的页面排版注意事项',
    ai_prompt_addon: '可直接拼入生图提示词的英文/中文排版关键词'
  };

  return {
    title: '短标题',
    logline: '一句话概括',
    style_id: style.id,
    ...(includePageStoryboards ? { page_count: '模型决定的整部漫画实际页数（1-最多页数安全上限），必须等于 panel_plan.length' } : {}),
    story_world: '故事世界与时间地点',
    characters: [
      {
        name: '角色名',
        role: '角色功能',
        visual_signature: '脸型/发型/年龄/体型/标志物',
        costume: '服装与颜色',
        expression_rules: '表情和肢体语言规律'
      }
    ],
    style_bible: '统一画风、线条、色彩、镜头、留白与禁止项',
    panel_plan: [
      {
        index: 1,
        beat: '剧情节拍',
        shot: '景别，例如远景/中景/近景/特写',
        camera: '镜头角度与运动感',
        composition: '主体位置、前中后景、留白、视觉焦点',
        setting: '地点/时间/天气/道具',
        action: '角色动作',
        emotion: '情绪',
        image_prompt: includePageStoryboards
          ? '可直接用于整页漫画页生图的完整提示词，必须服务于本页 page_storyboard'
          : '可直接用于单格生图的完整提示词',
        continuity_notes: '需要与前后格保持一致的角色/道具/空间',
        ...(includePageStoryboards ? { page_storyboard: pageStoryboardSchema } : {})
      }
    ]
  };
}

function clippedText(value, maxChars = 3600) {
  const raw = text(value);
  if (!raw || raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n...（原始输出过长，已截断）`;
}

export function buildComicStoryboardMessages({
  story = '',
  styleId = DEFAULT_COMIC_STYLE_ID,
  pageLimit,
  pageCount,
  panelCount,
  includePageStoryboards = false
} = {}) {
  const sourceStory = text(story);
  if (!sourceStory) throw new Error('Story is required.');

  const style = getComicStyleTemplate(styleId);
  const count = includePageStoryboards
    ? clampComicPageCount(pageLimit ?? pageCount ?? panelCount)
    : clampComicPanelCount(panelCount);
  const taskLine = includePageStoryboards
    ? `任务：把用户的小故事拆成适合阅读节奏的漫画页，整部漫画页数由你自动决定（1-${count} 页），并输出严格 JSON。`
    : `任务：把用户的小故事拆成 exactly ${count} 个漫画分镜，并输出严格 JSON。`;
  const schema = comicStoryboardOutputSchema(style, includePageStoryboards);

  return [
    {
      role: 'system',
      content: compactLines([
        '你是资深漫画分镜导演、角色设定师和 AI 生图提示词设计师。',
        taskLine,
        includePageStoryboards
          ? '设计原则：每页只推进一个清晰叙事段落；页内 sub_panels 再拆分节拍，并在远景/中景/近景/特写之间变化。'
          : '设计原则：每格只表达一个清晰节拍；在远景/中景/近景/特写之间变化；用构图、景别、动作和表情推进叙事。',
        includePageStoryboards
          ? '一致性原则：先提炼角色设定表和 style_bible，再让每页 image_prompt 与 page_storyboard 复用这些设定，避免角色服装、发型、色彩和画风漂移。'
          : '一致性原则：先提炼角色设定表和 style_bible，再让每格 image_prompt 复用这些设定，避免角色服装、发型、色彩和画风漂移。',
        '文字原则：所有 image_prompt 都必须要求画面保持纯视觉叙事，不生成任何画面文字、Logo、水印、签名或悬浮图形容器；不要创建文字排版留空，剧情信息只用动作、表情、构图和场景表达。',
        includePageStoryboards ? `页分镜模式：先自动决定整部漫画 page_count（1-${count} 页），panel_plan 的项目数必须等于 page_count；panel_plan 的每一项都代表一整页漫画，不是单个页内画格；页内画格只写在该页 page_storyboard.sub_panels 里；必须为每一页补充 page_storyboard JSON，用来描述“当前页”的格子结构、阅读节奏、视觉重心、叙事功能和本页内容。` : '',
        includePageStoryboards ? `漫画页分镜分类参考：\n${pageStoryboardGuideText()}` : '',
        includePageStoryboards ? `单页分镜模式：page_storyboard 要简洁但可执行；优先从规整网格型、横向条带型、竖向条带型、大格主视觉型、单页大图型、破格分镜、斜切分镜、碎片化分镜、留白型分镜、电影镜头型、表情反应型、动作连续型、蒙太奇型、非规则自由型中选择；由你自动决定当前页内部 panel_count（${COMIC_PAGE_PANEL_LIMITS.min}-${COMIC_PAGE_PANEL_LIMITS.max} 格），这个 panel_count 只表示单页内画格数，不能用来表示整部页数；让 sub_panels 数量与 panel_count 一致，并让 sub_panels 描述页面内部画格位置、画面内容和阅读衔接。` : '',
        `风格模板：${style.label}`,
        `风格摘要：${style.summary}`,
        `风格关键词：${style.stylePrompt}`,
        `一致性锁定：${style.consistencyPrompt}`,
        `负面约束：${style.negativePrompt}`,
        '只输出 JSON 对象，不要 Markdown，不要代码围栏，不要解释。',
        'JSON 语法硬性要求：所有键和字符串必须使用英文双引号；数组/对象元素之间必须有逗号；禁止尾逗号、注释、省略号、NaN、Infinity、undefined；不要把 JSON 放进字符串里。',
        `JSON 结构示例：${JSON.stringify(schema)}`
      ])
    },
    {
      role: 'user',
      content: compactLines([
        `故事：${sourceStory}`,
        includePageStoryboards ? `最多页数（安全上限）：${count}，请根据故事节奏自动决定实际 page_count。` : `目标分镜数：${count}`,
        includePageStoryboards ? '请补全角色设定、风格圣经、每页分镜，并为每一页额外生成 page_storyboard JSON；注意 page_count 是你决定的整部漫画实际页数，page_storyboard.panel_count 是你决定的当前单页内画格数。' : '请补全角色设定、风格圣经和每格分镜。'
      ])
    }
  ];
}

export function buildComicStoryboardRepairMessages({
  story = '',
  styleId = DEFAULT_COMIC_STYLE_ID,
  pageLimit,
  pageCount,
  panelCount,
  includePageStoryboards = false,
  badResponse = '',
  parseError = ''
} = {}) {
  const sourceStory = text(story);
  if (!sourceStory) throw new Error('Story is required.');

  const style = getComicStyleTemplate(styleId);
  const count = includePageStoryboards
    ? clampComicPageCount(pageLimit ?? pageCount ?? panelCount)
    : clampComicPanelCount(panelCount);
  const schema = comicStoryboardOutputSchema(style, includePageStoryboards);

  return [
    {
      role: 'system',
      content: compactLines([
        '你是 JSON 语法修复器和资深漫画分镜导演。',
        '任务：把用户故事和上一轮模型输出转换成一个可被 JSON.parse 解析的最终 JSON 对象。',
        '如果上一轮输出没有可用 JSON、JSON 被截断或语法错误，就根据原始故事重新生成完整 JSON；不要复述错误。',
        '只输出 JSON 对象，不要 Markdown，不要代码围栏，不要解释。',
        'JSON 语法硬性要求：所有键和字符串必须使用英文双引号；数组/对象元素之间必须有逗号；禁止尾逗号、注释、省略号、NaN、Infinity、undefined；不要把 JSON 放进字符串里。',
        includePageStoryboards
          ? `页分镜模式：自动决定整部漫画 page_count（1-${count} 页），panel_plan.length 必须等于 page_count；panel_plan 每项代表一整页漫画，不是单个页内画格；每页必须包含 page_storyboard，page_storyboard.panel_count 只表示当前页内部画格数，page_storyboard.sub_panels.length 必须等于 page_storyboard.panel_count。`
          : `普通分镜模式：panel_plan.length 必须 exactly ${count}。`,
        `style_id 必须是 "${style.id}"。`,
        `JSON 结构示例：${JSON.stringify(schema)}`
      ])
    },
    {
      role: 'user',
      content: compactLines([
        `故事：${sourceStory}`,
        includePageStoryboards ? `最多页数（安全上限）：${count}。` : `目标分镜数：${count}。`,
        parseError ? `上一轮解析错误：${parseError}` : '',
        badResponse
          ? `上一轮原始输出（仅供修复/补全参考）：\n${clippedText(badResponse)}`
          : '上一轮没有可用 JSON，请直接根据故事重新生成。',
        '请输出修复后的最终 JSON 对象。'
      ])
    }
  ];
}

function stripJsonFence(raw) {
  let value = text(raw).replace(/^\uFEFF/, '');
  const fence = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) value = fence[1].trim();
  const embeddedFence = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (embeddedFence && embeddedFence[1].includes('{')) value = embeddedFence[1].trim();
  return value;
}

function jsonObjectCandidates(textValue = '') {
  const value = stripJsonFence(textValue);
  if (!value) throw new Error('Storyboard response is empty.');

  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(value.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return { value, candidates };
}

export function extractJsonObject(textValue = '') {
  const { value, candidates } = jsonObjectCandidates(textValue);
  if (value.startsWith('{') && value.endsWith('}')) return value;
  if (candidates.length) return candidates[0];

  const first = value.indexOf('{');
  if (first >= 0) return value.slice(first).trim();
  throw new Error('Storyboard response does not contain a JSON object.');
}

function stripJsonComments(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

function insertMissingCommasBetweenCompositeValues(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    out += ch;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '}' || ch === ']') {
      let j = i + 1;
      while (/\s/.test(source[j] || '')) j += 1;
      if (source[j] === '{' || source[j] === '[') out += ',';
    }
  }

  return out;
}

function removeTrailingCommas(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (/\s/.test(source[j] || '')) j += 1;
      if (source[j] === '}' || source[j] === ']') continue;
    }

    out += ch;
  }

  return out;
}

function jsonRepairVariants(jsonText) {
  const trimmed = text(jsonText);
  const variants = [trimmed];
  let repaired = removeTrailingCommas(stripJsonComments(trimmed));
  repaired = insertMissingCommasBetweenCompositeValues(repaired);
  if (repaired !== trimmed) variants.push(repaired);
  return [...new Set(variants)];
}

function parseJsonObjectFromResponse(textValue = '') {
  const { value, candidates } = jsonObjectCandidates(textValue);
  const first = value.indexOf('{');
  const sources = candidates.length ? candidates : (first >= 0 ? [value.slice(first).trim()] : []);
  if (!sources.length) throw new Error('Storyboard response does not contain a JSON object.');

  let firstError = null;
  for (const source of sources) {
    for (const variant of jsonRepairVariants(source)) {
      try {
        const parsed = JSON.parse(variant);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (err) {
        firstError ||= err;
      }
    }
  }

  throw firstError || new Error('Storyboard response JSON is invalid.');
}

function normalizeCharacters(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => ({
      name: nonEmpty(item?.name, `角色${index + 1}`),
      role: text(item?.role),
      visualSignature: nonEmpty(item?.visual_signature ?? item?.visualSignature, '保持稳定的脸型、发型、体型和标志物'),
      costume: text(item?.costume),
      expressionRules: text(item?.expression_rules ?? item?.expressionRules)
    }))
    .filter((item) => item.name || item.visualSignature);
}

function normalizeStringList(value) {
  const source = Array.isArray(value)
    ? value
    : text(value)
      ? text(value).split(/[、,，;；|/]/)
      : [];
  return source
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizePageSubPanel(item = {}, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    id: nonEmpty(source.id ?? source.panel_id ?? source.panelId, String.fromCharCode(65 + index)),
    role: text(source.role),
    area: text(source.area ?? source.position ?? source.frame),
    shot: text(source.shot ?? source.shot_size ?? source.shotSize),
    camera: text(source.camera ?? source.angle),
    composition: text(source.composition),
    content: text(source.content ?? source.beat ?? source.description),
    transition: text(source.transition ?? source.flow)
  };
}

export function normalizeComicPageStoryboard(value, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawSubPanels = Array.isArray(value.sub_panels)
    ? value.sub_panels
    : Array.isArray(value.subPanels)
      ? value.subPanels
      : Array.isArray(value.panels)
        ? value.panels
        : Array.isArray(value.panel_layout)
          ? value.panel_layout
          : Array.isArray(value.panelLayout)
            ? value.panelLayout
            : [];
  const subPanels = rawSubPanels
    .map(normalizePageSubPanel)
    .filter((item) => item.role || item.area || item.content || item.composition);
  const rawCount = Number(value.panel_count ?? value.panelCount ?? subPanels.length);
  const panelCount = clampComicPagePanelCount(
    Number.isFinite(rawCount) && rawCount > 0 ? rawCount : subPanels.length,
    subPanels.length || COMIC_PAGE_PANEL_LIMITS.default
  );
  const result = {
    layoutType: nonEmpty(value.layout_type ?? value.layoutType ?? value.type, `单页分镜 ${index + 1}`),
    layoutKeywords: normalizeStringList(value.layout_keywords ?? value.layoutKeywords ?? value.keywords),
    readingOrder: text(value.reading_order ?? value.readingOrder),
    visualHierarchy: text(value.visual_hierarchy ?? value.visualHierarchy),
    narrativeFunction: text(value.narrative_function ?? value.narrativeFunction),
    content: text(value.content ?? value.page_content ?? value.pageContent ?? value.summary ?? value.description),
    panelCount,
    subPanels,
    designNotes: text(value.design_notes ?? value.designNotes ?? value.notes),
    aiPromptAddon: text(value.ai_prompt_addon ?? value.aiPromptAddon ?? value.prompt_addon ?? value.promptAddon)
  };
  if (!result.layoutKeywords.length && result.aiPromptAddon) {
    result.layoutKeywords = normalizeStringList(result.aiPromptAddon);
  }
  return result;
}

function panelPromptFromParts(panel) {
  return compactLines([
    panel.beat,
    panel.setting ? `场景：${panel.setting}` : '',
    panel.action ? `动作：${panel.action}` : '',
    panel.emotion ? `情绪：${panel.emotion}` : '',
    panel.shot ? `景别：${panel.shot}` : '',
    panel.camera ? `镜头：${panel.camera}` : '',
    panel.composition ? `构图：${panel.composition}` : ''
  ]).replace(/\n/g, '；');
}

function normalizePanel(item = {}, index = 0, pageStoryboardFallback = null) {
  const pageStoryboard = normalizeComicPageStoryboard(
    item.page_storyboard ?? item.pageStoryboard ?? item.page_layout ?? item.pageLayout ?? pageStoryboardFallback,
    index
  );
  const panel = {
    index: Number(item.index) || index + 1,
    beat: text(item.beat ?? item.summary ?? item.description),
    shot: text(item.shot ?? item.shot_size ?? item.shotSize),
    camera: text(item.camera ?? item.angle),
    composition: text(item.composition),
    setting: text(item.setting ?? item.scene),
    action: text(item.action),
    emotion: text(item.emotion ?? item.mood),
    imagePrompt: text(item.image_prompt ?? item.imagePrompt ?? item.prompt),
    continuityNotes: text(item.continuity_notes ?? item.continuityNotes)
  };
  if (pageStoryboard) panel.pageStoryboard = pageStoryboard;
  if (!panel.imagePrompt) panel.imagePrompt = panelPromptFromParts(panel);
  if (!panel.beat) panel.beat = panel.imagePrompt || `分镜 ${panel.index}`;
  return panel;
}

export function normalizeComicStoryboard(data = {}, { story = '', styleId = DEFAULT_COMIC_STYLE_ID, pageLimit, pageCount, panelCount, autoPageCount = false } = {}) {
  const source = data && typeof data === 'object' ? data : {};
  const rawPanels = Array.isArray(source.panel_plan)
    ? source.panel_plan
    : Array.isArray(source.panels)
      ? source.panels
      : [];
  const rawPageStoryboards = Array.isArray(source.page_storyboards)
    ? source.page_storyboards
    : Array.isArray(source.pageStoryboards)
      ? source.pageStoryboards
      : [];
  const declaredPageCount = Number(source.page_count ?? source.pageCount);
  const hasPageStoryboardInput = rawPageStoryboards.length > 0 || rawPanels.some((item) => (
    item && typeof item === 'object' && (
      item.page_storyboard || item.pageStoryboard || item.page_layout || item.pageLayout
    )
  ));
  const upperPageCount = clampComicPageCount(pageLimit ?? pageCount ?? panelCount, COMIC_PAGE_COUNT_LIMITS.max);
  const selectedPageCount = Number.isFinite(declaredPageCount) && declaredPageCount > 0
    ? declaredPageCount
    : (rawPanels.length || upperPageCount);
  const count = autoPageCount
    ? Math.min(upperPageCount, clampComicPageCount(selectedPageCount))
    : clampComicPanelCount(panelCount ?? rawPanels.length ?? COMIC_PANEL_LIMITS.default);
  const style = getComicStyleTemplate(source.style_id || source.styleId || styleId);
  const panels = rawPanels.slice(0, count).map((item, index) => normalizePanel(item, index, rawPageStoryboards[index]));
  while (panels.length < count) {
    panels.push(normalizePanel({
      beat: `根据故事继续推进第 ${panels.length + 1} 个节拍`,
      image_prompt: `根据故事“${text(story).slice(0, 160)}”生成第 ${panels.length + 1} ${autoPageCount || hasPageStoryboardInput ? '页' : '格'}漫画分镜`
    }, panels.length));
  }

  return {
    title: nonEmpty(source.title, '未命名漫画'),
    logline: text(source.logline),
    styleId: style.id,
    styleLabel: style.label,
    pageCount: panels.length,
    storyWorld: text(source.story_world ?? source.storyWorld),
    characters: normalizeCharacters(source.characters),
    styleBible: nonEmpty(source.style_bible ?? source.styleBible, `${style.summary}。${style.consistencyPrompt}`),
    panels
  };
}

export function parseComicStoryboardResponse(textValue = '', options = {}) {
  const parsed = parseJsonObjectFromResponse(textValue);
  return normalizeComicStoryboard(parsed, options);
}

export function comicPageStoryboardToJson(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  const normalized = normalizeComicPageStoryboard(value);
  return normalized ? JSON.stringify(normalized, null, 2) : '';
}

function characterBible(storyboard = {}) {
  const characters = Array.isArray(storyboard.characters) ? storyboard.characters : [];
  if (!characters.length) return '角色设定：保持同一角色的年龄、脸型、发型、体型、服装主色和标志物一致。';
  return characters.map((item) => {
    const parts = [
      item.name,
      item.role,
      item.visualSignature,
      item.costume ? `服装：${item.costume}` : '',
      item.expressionRules ? `表情规律：${item.expressionRules}` : ''
    ].filter(Boolean);
    return `- ${parts.join('；')}`;
  }).join('\n');
}

export function buildComicImagePrompt({ storyboard = {}, panel = {}, styleId = DEFAULT_COMIC_STYLE_ID, panelIndex, totalPanels } = {}) {
  const style = getComicStyleTemplate(storyboard.styleId || styleId);
  const index = Number(panelIndex ?? panel.index) || 1;
  const total = Number(totalPanels) || (Array.isArray(storyboard.panels) ? storyboard.panels.length : index);
  const pageStoryboardJson = comicPageStoryboardToJson(panel.pageStoryboard ?? panel.page_storyboard);
  const isPagePrompt = Boolean(pageStoryboardJson);
  const detailHeading = isPagePrompt ? '本页分镜：' : '本格分镜：';
  const referenceRule = isPagePrompt
    ? '如果请求携带参考图：参考图只用于锁定角色、服装、色彩、线条和世界观；本页必须按照上面的新页分镜重新构图，不要复制上一页画面。'
    : '如果请求携带参考图：参考图只用于锁定角色、服装、色彩、线条和世界观；本格必须按照上面的新分镜重新构图，不要复制上一格画面。';
  const textRule = '画面保持纯视觉叙事：不要生成任何文字、Logo、水印、签名或悬浮图形容器；不要预留文字排版空间。';

  return compactLines([
    `漫画项目：${nonEmpty(storyboard.title, '未命名漫画')}`,
    isPagePrompt
      ? `生成第 ${index}/${total} 页：一张完整漫画页面，内部可包含多个画格；不是单独画格图。`
      : `生成第 ${index}/${total} 格：单张完整漫画分镜图。`,
    `统一风格：${style.stylePrompt}`,
    `风格圣经：${nonEmpty(storyboard.styleBible, style.summary)}`,
    `角色设定表：\n${characterBible(storyboard)}`,
    storyboard.storyWorld ? `故事世界：${storyboard.storyWorld}` : '',
    detailHeading,
    `- 剧情节拍：${nonEmpty(panel.beat, panel.imagePrompt)}`,
    panel.setting ? `- 场景：${panel.setting}` : '',
    panel.action ? `- 动作：${panel.action}` : '',
    panel.emotion ? `- 情绪：${panel.emotion}` : '',
    panel.shot ? `- 景别：${panel.shot}` : '',
    panel.camera ? `- 镜头：${panel.camera}` : '',
    panel.composition ? `- 构图：${panel.composition}` : '',
    panel.continuityNotes ? `- 连续性：${panel.continuityNotes}` : '',
    isPagePrompt ? compactLines([
      panel.pageStoryboard?.content ? `本页分镜内容：${panel.pageStoryboard.content}` : '',
      '当前页漫画页分镜 JSON（用于决定页面格子结构、阅读顺序、视觉层级和叙事节奏）：',
      pageStoryboardJson,
      '请把上面的 pageStoryboard 当作当前页排版约束：遵循 layoutType、readingOrder、visualHierarchy 和 subPanels 的位置/面积/镜头设计；如果有 aiPromptAddon，也要融入构图。'
    ]) : '',
    `生图重点：${nonEmpty(panel.imagePrompt, panel.beat)}`,
    `一致性锁定：${style.consistencyPrompt}`,
    referenceRule,
    textRule,
    `负面约束：${style.negativePrompt}`
  ]);
}

export function comicReferenceSpecs({ anchorId = '', previousId = '', enabled = true } = {}) {
  if (!enabled) return [];
  const ids = [];
  for (const id of [anchorId, previousId]) {
    const value = text(id);
    if (value && !ids.includes(value)) ids.push(value);
  }
  return ids.slice(0, 2).map((id) => ({ type: 'gallery', id }));
}
