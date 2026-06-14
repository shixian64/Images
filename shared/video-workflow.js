// Video workflow primitives shared by browser and server.
// The current product generates still keyframes and optional in-between stills.

export const VIDEO_KEYFRAME_LIMITS = Object.freeze({
  min: 2,
  max: 12,
  default: 5
});

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

export function clampVideoKeyframeCount(value, fallback = VIDEO_KEYFRAME_LIMITS.default) {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(VIDEO_KEYFRAME_LIMITS.max, Math.max(VIDEO_KEYFRAME_LIMITS.min, base));
}

function parseJsonObjectFromResponse(textValue = '') {
  const raw = text(textValue).replace(/^\uFEFF/, '');
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const value = fence ? fence[1].trim() : raw;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Video storyboard response does not contain a JSON object.');
  const json = value.slice(start, end + 1)
    .replace(/,\s*([}\]])/g, '$1');
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Video storyboard response JSON must be an object.');
  }
  return parsed;
}

function normalizeStringList(value, max = 12) {
  const source = Array.isArray(value)
    ? value
    : text(value)
      ? text(value).split(/[，,、;；\n]/)
      : [];
  return source.map((item) => text(item)).filter(Boolean).slice(0, max);
}

function normalizeReferenceIndexes(value, maxReferenceCount = 0) {
  const source = Array.isArray(value) ? value : normalizeStringList(value);
  const ids = [];
  for (const item of source) {
    const n = Number(item?.index ?? item);
    if (!Number.isInteger(n) || n < 1) continue;
    if (maxReferenceCount && n > maxReferenceCount) continue;
    if (!ids.includes(n)) ids.push(n);
  }
  return ids.slice(0, Math.max(0, maxReferenceCount || 12));
}

function normalizeKeyframe(item = {}, index = 0, { maxReferenceCount = 0 } = {}) {
  const source = item && typeof item === 'object' ? item : {};
  const keyframe = {
    index: Number(source.index) || index + 1,
    beat: text(source.beat ?? source.summary ?? source.description),
    shot: text(source.shot ?? source.shot_size ?? source.shotSize),
    camera: text(source.camera ?? source.angle),
    composition: text(source.composition),
    action: text(source.action ?? source.motion),
    emotion: text(source.emotion ?? source.mood),
    imagePrompt: text(source.image_prompt ?? source.imagePrompt ?? source.prompt),
    referenceIndexes: normalizeReferenceIndexes(
      source.reference_indexes ?? source.referenceIndexes ?? source.references,
      maxReferenceCount
    ),
    notes: text(source.notes ?? source.continuity_notes ?? source.continuityNotes)
  };
  if (!keyframe.imagePrompt) {
    keyframe.imagePrompt = compactLines([
      keyframe.beat,
      keyframe.action ? `动作：${keyframe.action}` : '',
      keyframe.emotion ? `情绪：${keyframe.emotion}` : '',
      keyframe.shot ? `景别：${keyframe.shot}` : '',
      keyframe.camera ? `镜头：${keyframe.camera}` : '',
      keyframe.composition ? `构图：${keyframe.composition}` : ''
    ]).replace(/\n/g, '；');
  }
  if (!keyframe.beat) keyframe.beat = keyframe.imagePrompt || `关键帧 ${keyframe.index}`;
  return keyframe;
}

function normalizeTransition(item = {}, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const from = Number(source.from ?? source.from_index ?? source.fromIndex ?? index + 1);
  const to = Number(source.to ?? source.to_index ?? source.toIndex ?? index + 2);
  return {
    from: Number.isInteger(from) && from > 0 ? from : index + 1,
    to: Number.isInteger(to) && to > 0 ? to : index + 2,
    motion: text(source.motion ?? source.action),
    camera: text(source.camera),
    imagePrompt: text(source.image_prompt ?? source.imagePrompt ?? source.prompt),
    notes: text(source.notes ?? source.continuity_notes ?? source.continuityNotes)
  };
}

export function normalizeVideoStoryboard(data = {}, {
  prompt = '',
  keyframeLimit,
  maxReferenceCount = 0
} = {}) {
  const source = data && typeof data === 'object' ? data : {};
  const rawKeyframes = Array.isArray(source.keyframes)
    ? source.keyframes
    : Array.isArray(source.keyframe_plan)
      ? source.keyframe_plan
      : [];
  const declared = Number(source.keyframe_count ?? source.keyframeCount);
  const upper = clampVideoKeyframeCount(keyframeLimit);
  const count = Math.min(
    upper,
    clampVideoKeyframeCount(Number.isFinite(declared) && declared > 0 ? declared : (rawKeyframes.length || upper))
  );
  const keyframes = rawKeyframes
    .slice(0, count)
    .map((item, index) => normalizeKeyframe(item, index, { maxReferenceCount }));
  while (keyframes.length < count) {
    keyframes.push(normalizeKeyframe({
      beat: `根据视频提示词推进第 ${keyframes.length + 1} 个关键画面`,
      image_prompt: `根据视频提示词“${text(prompt).slice(0, 160)}”生成第 ${keyframes.length + 1} 个关键帧`
    }, keyframes.length, { maxReferenceCount }));
  }

  const rawTransitions = Array.isArray(source.transitions) ? source.transitions : [];
  const transitions = [];
  for (let i = 0; i < Math.max(0, keyframes.length - 1); i += 1) {
    const existing = rawTransitions.find((item) => Number(item?.from ?? item?.fromIndex) === i + 1 && Number(item?.to ?? item?.toIndex) === i + 2)
      || rawTransitions[i]
      || {};
    const transition = normalizeTransition(existing, i);
    transition.from = i + 1;
    transition.to = i + 2;
    if (!transition.imagePrompt) {
      transition.imagePrompt = `生成第 ${i + 1} 到第 ${i + 2} 个关键帧之间的过渡画面，保持主体、服装、空间关系一致，动作和镜头自然承接。`;
    }
    transitions.push(transition);
  }

  return {
    title: nonEmpty(source.title, text(prompt).slice(0, 40) || '未命名视频'),
    logline: text(source.logline ?? source.summary),
    visualStyle: text(source.visual_style ?? source.visualStyle ?? source.style_bible ?? source.styleBible),
    continuityRules: text(source.continuity_rules ?? source.continuityRules),
    keyframeCount: keyframes.length,
    keyframes,
    transitions
  };
}

export function parseVideoStoryboardResponse(textValue = '', options = {}) {
  const parsed = parseJsonObjectFromResponse(textValue);
  return normalizeVideoStoryboard(parsed, options);
}

function normalizeGlobalConfig(config = {}) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  return {
    style: text(source.style),
    motion: text(source.motion),
    negative: text(source.negative),
    notes: text(source.notes)
  };
}

function globalConfigLines(config = {}) {
  const globalConfig = normalizeGlobalConfig(config);
  return [
    globalConfig.style ? `项目统一画风 / 角色 / 场景约束：${globalConfig.style}` : '',
    globalConfig.motion ? `项目统一运动与镜头规则：${globalConfig.motion}` : '',
    globalConfig.negative ? `项目统一负面约束：${globalConfig.negative}` : '',
    globalConfig.notes ? `项目统一备注：${globalConfig.notes}` : ''
  ].filter(Boolean);
}

function clippedText(value = '', max = 8000) {
  const out = text(value);
  return out.length > max ? `${out.slice(0, max)}\n...` : out;
}

function videoStoryboardOutputSchema(limit, refs) {
  return {
    title: '短标题',
    logline: '一句话概括视频',
    visual_style: '全局视觉风格、质感、色彩和镜头语言',
    continuity_rules: '角色、服装、道具、空间关系、光线的一致性要求',
    keyframe_count: `模型决定的关键帧数量，2-${limit}，必须等于 keyframes.length`,
    keyframes: [
      {
        index: 1,
        beat: '关键画面承担的叙事/动作节点',
        shot: '远景/中景/近景/特写',
        camera: '镜头角度、运动感',
        composition: '主体位置、前中后景、留白、视觉焦点',
        action: '人物/物体动作',
        emotion: '情绪与氛围',
        image_prompt: '可直接用于生图的完整提示词，不生成文字/Logo/水印',
        reference_indexes: refs ? [1] : [],
        notes: '与前后关键帧的连续性注意事项'
      }
    ],
    transitions: [
      {
        from: 1,
        to: 2,
        motion: '两个关键帧之间的动作/镜头如何过渡',
        camera: '帧间镜头运动或视角变化',
        image_prompt: '用于生成 from-to 帧间图的提示词',
        notes: '帧间一致性注意事项'
      }
    ]
  };
}

export function buildVideoStoryboardMessages({
  prompt = '',
  keyframeLimit,
  referenceCount = 0,
  referenceLabels = [],
  config = {}
} = {}) {
  const sourcePrompt = text(prompt);
  if (!sourcePrompt) throw new Error('Prompt is required.');
  const limit = clampVideoKeyframeCount(keyframeLimit);
  const refs = Math.max(0, Math.floor(Number(referenceCount) || 0));
  const labels = (Array.isArray(referenceLabels) ? referenceLabels : [])
    .slice(0, refs)
    .map((label, index) => `${index + 1}. ${text(label, `参考图 ${index + 1}`)}`)
    .join('\n');
  const schema = videoStoryboardOutputSchema(limit, refs);

  return [
    {
      role: 'system',
      content: compactLines([
        '你是资深视频分镜导演、关键帧美术指导和 AI 生图提示词设计师。',
        `任务：把用户的视频提示词拆成 2-${limit} 个关键帧，由你决定实际关键帧数量，并输出严格 JSON。`,
        '关键帧原则：只选动作/情绪/镜头变化的决定性画面，避免重复；每个关键帧都要有可直接用于生图的 image_prompt。',
        '帧间原则：为每对相邻关键帧补充 transition，用于以后生成 1-2、2-3 这种帧间图；帧间图必须自然承接两端关键帧，不另起一个镜头。',
        '一致性原则：输出全局 visual_style 和 continuity_rules；所有 image_prompt 都要继承这些规则。',
        refs
          ? `参考图原则：用户提供了 ${refs} 张项目参考图。每个关键帧的 reference_indexes 只能从 1-${refs} 中选择；只选择确实需要附带的参考图，不需要可为空数组。`
          : '参考图原则：用户没有提供参考图，reference_indexes 必须为空数组。',
        labels ? `参考图列表：\n${labels}` : '',
        ...globalConfigLines(config),
        '文字原则：画面保持纯视觉叙事，不生成任何画面文字、Logo、水印、签名或悬浮图形容器。',
        '只输出 JSON 对象，不要 Markdown，不要代码围栏，不要解释。',
        `JSON 结构示例：${JSON.stringify(schema)}`
      ])
    },
    {
      role: 'user',
      content: compactLines([
        `视频提示词：${sourcePrompt}`,
        `最多关键帧数（安全上限）：${limit}`,
        ...globalConfigLines(config),
        '请自动决定实际 keyframe_count，补全全局风格、一致性规则、关键帧和相邻关键帧 transitions。'
      ])
    }
  ];
}

export function buildVideoStoryboardRepairMessages({
  prompt = '',
  keyframeLimit,
  referenceCount = 0,
  referenceLabels = [],
  config = {},
  badResponse = '',
  parseError = ''
} = {}) {
  const sourcePrompt = text(prompt);
  if (!sourcePrompt) throw new Error('Prompt is required.');
  const limit = clampVideoKeyframeCount(keyframeLimit);
  const refs = Math.max(0, Math.floor(Number(referenceCount) || 0));
  const labels = (Array.isArray(referenceLabels) ? referenceLabels : [])
    .slice(0, refs)
    .map((label, index) => `${index + 1}. ${text(label, `参考图 ${index + 1}`)}`)
    .join('\n');
  const schema = videoStoryboardOutputSchema(limit, refs);

  return [
    {
      role: 'system',
      content: compactLines([
        '你是 JSON 语法修复器、视频分镜导演和 AI 生图提示词设计师。',
        '任务：把用户的视频提示词和上一轮模型输出转换成一个可被 JSON.parse 解析的最终 JSON 对象。',
        '如果上一轮输出没有可用 JSON、JSON 被截断或语法错误，就根据原始视频提示词重新生成完整 JSON；不要复述错误。',
        `关键帧数量必须由你决定，范围 2-${limit}，并且 keyframe_count 必须等于 keyframes.length；transitions.length 必须等于 keyframes.length - 1。`,
        refs
          ? `参考图原则：reference_indexes 只能从 1-${refs} 中选择；不需要参考图的关键帧使用空数组。`
          : '参考图原则：用户没有提供参考图，reference_indexes 必须为空数组。',
        labels ? `参考图列表：\n${labels}` : '',
        ...globalConfigLines(config),
        'JSON 语法硬性要求：所有键和字符串必须使用英文双引号；数组/对象元素之间必须有逗号；禁止尾逗号、注释、省略号、NaN、Infinity、undefined；不要把 JSON 放进字符串里。',
        '只输出 JSON 对象，不要 Markdown，不要代码围栏，不要解释。',
        `JSON 结构示例：${JSON.stringify(schema)}`
      ])
    },
    {
      role: 'user',
      content: compactLines([
        `视频提示词：${sourcePrompt}`,
        `最多关键帧数（安全上限）：${limit}`,
        ...globalConfigLines(config),
        parseError ? `上一轮解析错误：${parseError}` : '',
        badResponse
          ? `上一轮原始输出（仅供修复/补全参考）：\n${clippedText(badResponse)}`
          : '上一轮没有可用 JSON，请直接根据视频提示词重新生成。',
        '请输出修复后的最终 JSON 对象。'
      ])
    }
  ];
}

function referenceRule(referenceCount = 0) {
  return referenceCount
    ? '如果请求携带参考图：参考图只用于锁定角色、服装、道具、空间和画风；仍必须按照本关键帧提示词重新构图，不要机械复制参考图。'
    : '';
}

export function buildVideoKeyframePrompt({ storyboard = {}, keyframe = {}, index = 1, total = 1, projectPrompt = '', referenceCount = 0, config = {} } = {}) {
  return compactLines([
    `视频项目：${nonEmpty(storyboard.title, '未命名视频')}`,
    `生成第 ${index}/${total} 个关键帧：单张电影感关键画面。`,
    projectPrompt ? `用户原始视频提示词：${projectPrompt}` : '',
    ...globalConfigLines(config),
    storyboard.visualStyle ? `全局视觉风格：${storyboard.visualStyle}` : '',
    storyboard.continuityRules ? `全局一致性规则：${storyboard.continuityRules}` : '',
    `关键帧内容：${nonEmpty(keyframe.beat, keyframe.imagePrompt)}`,
    keyframe.shot ? `景别：${keyframe.shot}` : '',
    keyframe.camera ? `镜头：${keyframe.camera}` : '',
    keyframe.composition ? `构图：${keyframe.composition}` : '',
    keyframe.action ? `动作：${keyframe.action}` : '',
    keyframe.emotion ? `情绪：${keyframe.emotion}` : '',
    keyframe.notes ? `连续性备注：${keyframe.notes}` : '',
    `生图重点：${nonEmpty(keyframe.imagePrompt, keyframe.beat)}`,
    referenceRule(referenceCount),
    '画面保持纯视觉叙事：不要生成任何文字、Logo、水印、签名或 UI/边框容器。'
  ]);
}

export function buildVideoBetweenPrompt({
  storyboard = {},
  fromFrame = {},
  toFrame = {},
  transition = {},
  projectPrompt = '',
  config = {},
  fromLabel = '',
  toLabel = '',
  targetLabel = '',
  segmentLabel = ''
} = {}) {
  const fromText = text(fromLabel || transition.from || '');
  const toText = text(toLabel || transition.to || '');
  const segmentText = text(segmentLabel || [fromText, toText].filter(Boolean).join('-') || `${transition.from}-${transition.to}`);
  return compactLines([
    `视频项目：${nonEmpty(storyboard.title, '未命名视频')}`,
    `生成 ${segmentText} 之间的帧间图：单张过渡画面。`,
    targetLabel ? `目标时间点：${targetLabel}，画面必须位于 ${segmentText} 的动作中间状态。` : '',
    projectPrompt ? `用户原始视频提示词：${projectPrompt}` : '',
    ...globalConfigLines(config),
    storyboard.visualStyle ? `全局视觉风格：${storyboard.visualStyle}` : '',
    storyboard.continuityRules ? `全局一致性规则：${storyboard.continuityRules}` : '',
    '两端关键帧将作为参考图：必须保持主体、服装、空间关系、光线和画风一致。',
    `前一关键帧：${nonEmpty(fromFrame.beat, fromFrame.imagePrompt)}`,
    `后一关键帧：${nonEmpty(toFrame.beat, toFrame.imagePrompt)}`,
    transition.motion ? `过渡动作：${transition.motion}` : '',
    transition.camera ? `过渡镜头：${transition.camera}` : '',
    transition.notes ? `帧间备注：${transition.notes}` : '',
    `生图重点：${nonEmpty(transition.imagePrompt, '自然承接两端关键帧的中间动作和构图')}`,
    '这不是新关键帧，不要改变角色设定、服装、场景或画风；不要生成任何文字、Logo、水印、签名或 UI/边框容器。'
  ]);
}

export function videoReferenceSpecsFromIndexes(projectReferences = [], indexes = []) {
  const refs = Array.isArray(projectReferences) ? projectReferences : [];
  const ids = [];
  for (const n of Array.isArray(indexes) ? indexes : []) {
    const index = Number(n);
    if (!Number.isInteger(index) || index < 1) continue;
    const ref = refs[index - 1];
    const id = text(ref?.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => ({ type: 'gallery', id }));
}
