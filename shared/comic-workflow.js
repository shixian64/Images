// Comic workflow primitives shared by the browser module and tests.
// Keep this file dependency-free so it can run in both Node.js and the browser.

export const DEFAULT_COMIC_STYLE_ID = 'webtoon-color';

export const COMIC_PANEL_LIMITS = Object.freeze({
  min: 1,
  max: 12,
  default: 6
});

export const COMIC_STYLE_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'webtoon-color',
    label: '彩色条漫 / Webtoon',
    tags: ['全彩', '竖屏', '强情绪'],
    summary: '适合手机阅读的竖向彩漫：明亮色块、干净线稿、夸张表情和清晰留白。',
    stylePrompt: [
      'vertical color webtoon comic style',
      'clean crisp line art',
      'bright cinematic color palette',
      'soft gradients and subtle rim light',
      'expressive faces, readable silhouettes',
      'mobile-first composition with breathing room'
    ].join(', '),
    consistencyPrompt: '角色脸型、发型、服装主色、线条粗细和高光方式必须跨格保持一致；每格都像同一部彩色条漫。',
    negativePrompt: 'no photorealism, no inconsistent costume, no random art style shift, no watermark, no logo, no gibberish text'
  }),
  Object.freeze({
    id: 'manhwa-romance',
    label: '韩漫恋爱风',
    tags: ['精致', '柔光', '都市'],
    summary: '偏韩漫/女性向彩漫：修长人物、精致五官、柔和皮肤光、时装感和浪漫氛围。',
    stylePrompt: [
      'Korean manhwa romance comic style',
      'elegant slim character proportions',
      'delicate facial features',
      'fashionable outfits',
      'soft bloom lighting',
      'pastel highlights, polished digital painting'
    ].join(', '),
    consistencyPrompt: '保持同一套精致五官比例、发型轮廓、服装搭配和柔光肤色；情绪变化主要通过眼神和姿态表达。',
    negativePrompt: 'no chibi unless requested, no gritty texture, no western superhero anatomy, no over-saturated neon, no watermark'
  }),
  Object.freeze({
    id: 'manga-bw',
    label: '黑白日漫',
    tags: ['黑白', '网点', '速度线'],
    summary: '传统黑白漫画感：清晰墨线、网点阴影、速度线和强烈黑白节奏。',
    stylePrompt: [
      'black and white manga panel',
      'sharp ink line art',
      'screentone shading',
      'dynamic speed lines when needed',
      'high contrast composition',
      'clean panel readability'
    ].join(', '),
    consistencyPrompt: '统一墨线粗细、网点密度、角色轮廓和黑白明暗逻辑；不要突然变成彩色或写实照片。',
    negativePrompt: 'no full color, no painterly oil texture, no muddy gray, no photographic lighting, no watermark'
  }),
  Object.freeze({
    id: 'ink-wash',
    label: '水墨国风',
    tags: ['水墨', '留白', '东方'],
    summary: '以笔墨、留白和淡彩构建氛围，适合古风、寓言、山水与诗意故事。',
    stylePrompt: [
      'Chinese ink wash comic illustration',
      'expressive brush strokes',
      'rice paper texture',
      'elegant negative space',
      'restrained mineral colors',
      'poetic cinematic framing'
    ].join(', '),
    consistencyPrompt: '统一纸张纹理、笔触浓淡、淡彩范围和角色服饰纹样；跨格保持同一水墨世界观。',
    negativePrompt: 'no glossy 3D render, no heavy western superhero ink, no noisy background, no watermark, no random typography'
  }),
  Object.freeze({
    id: 'american-comic',
    label: '美漫动作',
    tags: ['粗线', '高对比', '动作'],
    summary: '夸张透视、粗轮廓线、强对比阴影和英雄式动作节奏。',
    stylePrompt: [
      'American comic book action panel',
      'bold outlines',
      'dramatic perspective',
      'high contrast cel shading',
      'halftone texture accents',
      'dynamic action pose'
    ].join(', '),
    consistencyPrompt: '保持角色体型、服装标识、阴影块面和动作夸张程度一致；每格都像同一期美漫。',
    negativePrompt: 'no soft romance manhwa look, no photorealistic render, no inconsistent emblem, no watermark, no blurry anatomy'
  }),
  Object.freeze({
    id: 'children-picture-comic',
    label: '绘本漫画',
    tags: ['温暖', '低龄', '治愈'],
    summary: '柔和、友好、图形化的绘本式分格，适合童话、亲子和治愈小故事。',
    stylePrompt: [
      'children picture book comic panel',
      'warm soft colors',
      'rounded friendly shapes',
      'gentle paper texture',
      'clear simple composition',
      'whimsical details'
    ].join(', '),
    consistencyPrompt: '保持角色形状语言、温暖色盘、纸感纹理和低压叙事节奏一致；避免突然写实或阴暗。',
    negativePrompt: 'no scary horror mood, no harsh gore, no photorealism, no tiny unreadable text, no watermark'
  })
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

export function clampComicPanelCount(value, fallback = COMIC_PANEL_LIMITS.default) {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(COMIC_PANEL_LIMITS.max, Math.max(COMIC_PANEL_LIMITS.min, base));
}

export function buildComicStoryboardMessages({ story = '', styleId = DEFAULT_COMIC_STYLE_ID, panelCount } = {}) {
  const sourceStory = text(story);
  if (!sourceStory) throw new Error('Story is required.');

  const style = getComicStyleTemplate(styleId);
  const count = clampComicPanelCount(panelCount);
  const schema = {
    title: '短标题',
    logline: '一句话概括',
    style_id: style.id,
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
        dialogue: '如需对白，保持很短；否则空字符串',
        caption: '如需旁白，保持很短；否则空字符串',
        image_prompt: '可直接用于单格生图的完整提示词',
        continuity_notes: '需要与前后格保持一致的角色/道具/空间'
      }
    ]
  };

  return [
    {
      role: 'system',
      content: compactLines([
        '你是资深漫画分镜导演、角色设定师和 AI 生图提示词设计师。',
        `任务：把用户的小故事拆成 exactly ${count} 个漫画分镜，并输出严格 JSON。`,
        '设计原则：每格只表达一个清晰节拍；在远景/中景/近景/特写之间变化；用构图、景别、动作和表情推进叙事。',
        '一致性原则：先提炼角色设定表和 style_bible，再让每格 image_prompt 复用这些设定，避免角色服装、发型、色彩和画风漂移。',
        '文字原则：除非故事强依赖对白，否则 image_prompt 里要求不要生成文字、Logo、水印或复杂气泡；对白/旁白字段保持短句。',
        `风格模板：${style.label}`,
        `风格摘要：${style.summary}`,
        `风格关键词：${style.stylePrompt}`,
        `一致性锁定：${style.consistencyPrompt}`,
        `负面约束：${style.negativePrompt}`,
        '只输出 JSON 对象，不要 Markdown，不要代码围栏，不要解释。',
        `JSON 结构示例：${JSON.stringify(schema)}`
      ])
    },
    {
      role: 'user',
      content: compactLines([
        `故事：${sourceStory}`,
        `目标分镜数：${count}`,
        '请补全角色设定、风格圣经和每格分镜。'
      ])
    }
  ];
}

function stripJsonFence(raw) {
  let value = text(raw);
  const fence = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) value = fence[1].trim();
  return value;
}

export function extractJsonObject(textValue = '') {
  const value = stripJsonFence(textValue);
  if (!value) throw new Error('Storyboard response is empty.');
  if (value.startsWith('{') && value.endsWith('}')) return value;

  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first >= 0 && last > first) return value.slice(first, last + 1);
  throw new Error('Storyboard response does not contain a JSON object.');
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

function normalizePanel(item = {}, index = 0) {
  const panel = {
    index: Number(item.index) || index + 1,
    beat: text(item.beat ?? item.summary ?? item.description),
    shot: text(item.shot ?? item.shot_size ?? item.shotSize),
    camera: text(item.camera ?? item.angle),
    composition: text(item.composition),
    setting: text(item.setting ?? item.scene),
    action: text(item.action),
    emotion: text(item.emotion ?? item.mood),
    dialogue: text(item.dialogue),
    caption: text(item.caption),
    imagePrompt: text(item.image_prompt ?? item.imagePrompt ?? item.prompt),
    continuityNotes: text(item.continuity_notes ?? item.continuityNotes)
  };
  if (!panel.imagePrompt) panel.imagePrompt = panelPromptFromParts(panel);
  if (!panel.beat) panel.beat = panel.imagePrompt || `分镜 ${panel.index}`;
  return panel;
}

export function normalizeComicStoryboard(data = {}, { story = '', styleId = DEFAULT_COMIC_STYLE_ID, panelCount } = {}) {
  const source = data && typeof data === 'object' ? data : {};
  const rawPanels = Array.isArray(source.panel_plan)
    ? source.panel_plan
    : Array.isArray(source.panels)
      ? source.panels
      : [];
  const count = clampComicPanelCount(panelCount ?? rawPanels.length ?? COMIC_PANEL_LIMITS.default);
  const style = getComicStyleTemplate(source.style_id || source.styleId || styleId);
  const panels = rawPanels.slice(0, count).map(normalizePanel);
  while (panels.length < count) {
    panels.push(normalizePanel({
      beat: `根据故事继续推进第 ${panels.length + 1} 个节拍`,
      image_prompt: `根据故事“${text(story).slice(0, 160)}”生成第 ${panels.length + 1} 格漫画分镜`
    }, panels.length));
  }

  return {
    title: nonEmpty(source.title, '未命名漫画'),
    logline: text(source.logline),
    styleId: style.id,
    styleLabel: style.label,
    storyWorld: text(source.story_world ?? source.storyWorld),
    characters: normalizeCharacters(source.characters),
    styleBible: nonEmpty(source.style_bible ?? source.styleBible, `${style.summary}。${style.consistencyPrompt}`),
    panels
  };
}

export function parseComicStoryboardResponse(textValue = '', options = {}) {
  const jsonText = extractJsonObject(textValue);
  const parsed = JSON.parse(jsonText);
  return normalizeComicStoryboard(parsed, options);
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
  const dialogue = text(panel.dialogue);
  const caption = text(panel.caption);
  const textRule = dialogue || caption
    ? `如需文字，只预留干净对白/旁白区域；不要生成乱码。对白：${dialogue || '无'}；旁白：${caption || '无'}。`
    : '不要生成任何文字、对白框、Logo、水印或签名。';

  return compactLines([
    `漫画项目：${nonEmpty(storyboard.title, '未命名漫画')}`,
    `生成第 ${index}/${total} 格：单张完整漫画分镜图。`,
    `统一风格：${style.stylePrompt}`,
    `风格圣经：${nonEmpty(storyboard.styleBible, style.summary)}`,
    `角色设定表：\n${characterBible(storyboard)}`,
    storyboard.storyWorld ? `故事世界：${storyboard.storyWorld}` : '',
    '本格分镜：',
    `- 剧情节拍：${nonEmpty(panel.beat, panel.imagePrompt)}`,
    panel.setting ? `- 场景：${panel.setting}` : '',
    panel.action ? `- 动作：${panel.action}` : '',
    panel.emotion ? `- 情绪：${panel.emotion}` : '',
    panel.shot ? `- 景别：${panel.shot}` : '',
    panel.camera ? `- 镜头：${panel.camera}` : '',
    panel.composition ? `- 构图：${panel.composition}` : '',
    panel.continuityNotes ? `- 连续性：${panel.continuityNotes}` : '',
    `生图重点：${nonEmpty(panel.imagePrompt, panel.beat)}`,
    `一致性锁定：${style.consistencyPrompt}`,
    '如果请求携带参考图：参考图只用于锁定角色、服装、色彩、线条和世界观；本格必须按照上面的新分镜重新构图，不要复制上一格画面。',
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
