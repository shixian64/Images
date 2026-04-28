// 提示词广场默认精选数据。
// 来源页面是 SREF 热门榜单；这里将“参考代码 + 风格标签 + 热度”整理成通用图片提示词。
// 2026-04-28 从全部时间、近期趋势和风格分类榜单抽取 1300 行，去重后取前 260 个 SREF。

export const PROMPTSREF_SREF_SOURCE_URL = 'https://promptsref.com/zh/guide/Best-trending-Sref-Codes';
export const PROMPT_SQUARE_SEED_KEY = 'prompt_square.seed.promptsref_sref_v5_260';

export const PROMPT_SQUARE_SEEDS = [
  {
    "rank": 1,
    "sref": "4169240941",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/416924094-2-2eaafa89",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/416924094-1-341b0703",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/416924094-3-56420818",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/416924094-4-ec2bd1f9"
    ],
    "tags": [
      "超现实主义",
      "摄影",
      "粉色",
      "珠宝设计"
    ],
    "sourceHot": 1089,
    "title": "粉色超现实主义珠宝视觉",
    "prompt": "以人物肖像为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，写实摄影镜头语言、真实质感和自然景深，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 2,
    "sref": "680572301",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/680572301-3-f770a572",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/680572301-2-2dff1dd8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/680572301-1-4f95a0e5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/680572301-4-be19edfc"
    ],
    "tags": [
      "卡通",
      "插图",
      "极简主义",
      "可爱"
    ],
    "sourceHot": 903,
    "title": "极简主义可爱卡通",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间，柔软可爱的形体、亲和情绪和明快节奏。构图采用少元素中心构图，大面积留白，层级关系清楚；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 3,
    "sref": "2252558232",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2252558232-1-c6a1c701",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2252558232-2-52a2297c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2252558232-3-414c2fdc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2252558232-4-09fddab1"
    ],
    "tags": [
      "动漫",
      "漫画风格",
      "插图"
    ],
    "sourceHot": 882,
    "title": "漫画风格动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画分镜感、动态姿态和有力轮廓线，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 4,
    "sref": "20240813",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240813-1-e7ca1c07",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240813-2-e1c3bf0b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240813-3-4e0d2797",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240813-4-5c1a6697"
    ],
    "tags": [
      "摄影",
      "复古"
    ],
    "sourceHot": 786,
    "title": "复古摄影",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 5,
    "sref": "1872206420",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1872206420-1-ba2fa909",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1872206420-2-aec97834",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1872206420-3-09813163",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1872206420-4-c46262fb"
    ],
    "tags": [
      "摄影"
    ],
    "sourceHot": 785,
    "title": "摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 6,
    "sref": "1742554747",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1742554747-1-057e53a4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1742554747-2-799aa8bc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1742554747-3-9216c918",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1742554747-4-c247a8cb"
    ],
    "tags": [
      "卡通",
      "蓝色",
      "复古",
      "迪士尼"
    ],
    "sourceHot": 782,
    "title": "蓝色复古卡通插画",
    "prompt": "以趣味物件为核心创作，融合圆润卡通造型、轻松幽默的角色表情，复古胶片颗粒、怀旧配色和年代感构图，经典童话动画般亲和角色与温暖故事感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 7,
    "sref": "420945468",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/420945468-1-20343b2b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/420945468-2-ba1c33f1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/420945468-3-7da7e612",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/420945468-4-bd880e9e"
    ],
    "tags": [
      "摄影",
      "写实",
      "时尚",
      "电影"
    ],
    "sourceHot": 771,
    "title": "时尚电影摄影",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，精致造型、服饰材质与杂志大片气质，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 8,
    "sref": "3556861680",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3556861680-1-c9881e4b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3556861680-2-4e4c0498",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3556861680-3-f0dc0234",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3556861680-4-ca48e310"
    ],
    "tags": [
      "3D",
      "粉色",
      "可爱",
      "极简主义",
      "渐变"
    ],
    "sourceHot": 739,
    "title": "粉色极简主义3D 视觉",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质，柔软可爱的形体、亲和情绪和明快节奏，极简构图、克制元素和充足负空间，柔和渐变过渡、通透色带和现代视觉层次。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；柔和漫反射光，整体明亮亲和。色彩突出粉色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 9,
    "sref": "3925873398",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3925873398-1-9662d2b7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3925873398-2-0b9c07ee",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3925873398-3-127b16b0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3925873398-4-e5fbf5a3"
    ],
    "tags": [
      "动漫",
      "复古",
      "吉卜力工作室"
    ],
    "sourceHot": 704,
    "title": "复古动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，手绘动画气息、自然场景和治愈冒险感。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 10,
    "sref": "2992812218",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2992812218-1-5593b9a4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2992812218-2-c5dfb9c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2992812218-3-85d26bbd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2992812218-4-c076a4ba"
    ],
    "tags": [
      "动漫",
      "漫画风格",
      "绿色",
      "吉卜力工作室"
    ],
    "sourceHot": 693,
    "title": "绿色动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画分镜感、动态姿态和有力轮廓线，手绘动画气息、自然场景和治愈冒险感。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 11,
    "sref": "237086219",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/237086219-1-b7dc1244",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/237086219-2-ebcf8deb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/237086219-3-69d5437a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/237086219-4-0069ffb6"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 688,
    "title": "复古电影摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 12,
    "sref": "442161672",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/442161672-1-f465723b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/442161672-2-76022c47",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/442161672-3-7449b412",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/442161672-4-59a600c5"
    ],
    "tags": [
      "圣诞节",
      "卡通",
      "可爱",
      "扁平设计"
    ],
    "sourceHot": 670,
    "title": "圣诞节可爱卡通",
    "prompt": "以小动物伙伴为核心创作，融合节日装饰、冬日灯光和温暖庆典气氛，圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 13,
    "sref": "698401885",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/698401885-1-767e8362",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/698401885-2-36983dc7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/698401885-3-027e2054",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/698401885-4-6ff56ff5"
    ],
    "tags": [
      "超现实主义",
      "粉色",
      "蓝色",
      "珠宝设计",
      "渐变",
      "时尚"
    ],
    "sourceHot": 624,
    "title": "粉色超现实主义珠宝视觉主视觉",
    "prompt": "以宝石装置为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，宝石、金属、玻璃反射与奢华高光细节，柔和渐变过渡、通透色带和现代视觉层次，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩突出粉色、蓝色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合珠宝广告、产品海报或奢侈品视觉。"
  },
  {
    "rank": 14,
    "sref": "4059834270",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4059834270-1-8cbda270",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4059834270-2-8c4bcdb2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4059834270-3-674ba5b9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4059834270-4-8eeca6c1"
    ],
    "tags": [
      "卡通",
      "涂色书",
      "极简主义",
      "线条艺术",
      "儿童书籍"
    ],
    "sourceHot": 619,
    "title": "极简主义儿童书籍卡通插画",
    "prompt": "以趣味物件为核心创作，融合圆润卡通造型、轻松幽默的角色表情，黑白或低色彩线稿、可涂色留白和儿童活动页感，极简构图、克制元素和充足负空间，线条艺术结构、明确轮廓和手绘笔触。构图采用少元素中心构图，大面积留白，层级关系清楚；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 15,
    "sref": "3154438697",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3154438697-1-56f55cf9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3154438697-2-94561d58",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3154438697-3-56ddc695",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3154438697-4-c99259e8"
    ],
    "tags": [
      "超现实主义",
      "粉色",
      "插图",
      "复古"
    ],
    "sourceHot": 609,
    "title": "粉色超现实主义插图",
    "prompt": "以可替换的视觉主角为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，高完成度商业插画质感和清晰叙事层次，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 16,
    "sref": "569235527",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/569235527-1-4aaf6ede",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/569235527-2-da87129a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/569235527-3-90978f7f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/569235527-4-3ebd9d50"
    ],
    "tags": [
      "摄影"
    ],
    "sourceHot": 608,
    "title": "摄影主视觉",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 17,
    "sref": "3022677299",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3022677299-1-09def832",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3022677299-2-eb78686e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3022677299-3-f9cad4cd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3022677299-4-c7ad5c55"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 595,
    "title": "复古电影摄影主视觉",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 18,
    "sref": "2390036421",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2390036421-1-becfc6de",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2390036421-2-62f2cca7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2390036421-3-e57f5d02",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2390036421-4-d1493a79"
    ],
    "tags": [
      "摄影",
      "写实"
    ],
    "sourceHot": 589,
    "title": "写实摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 19,
    "sref": "2960821057",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2960821057-1-34459b5e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2960821057-2-4d8644c4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2960821057-3-9c5688a3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2960821057-4-439441b6"
    ],
    "tags": [
      "卡通",
      "可爱",
      "吉卜力工作室",
      "漫画书"
    ],
    "sourceHot": 576,
    "title": "可爱漫画书视觉",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，手绘动画气息、自然场景和治愈冒险感，漫画书式叙事框架、夸张表情和戏剧动作。构图采用动态角度和分镜感，姿态有速度与冲击力；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 20,
    "sref": "4227520489",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4227520489-1-63349015",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4227520489-2-30d042d7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4227520489-3-d2c0ab90",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4227520489-4-31e27d73"
    ],
    "tags": [
      "扁平设计",
      "极简主义",
      "插图"
    ],
    "sourceHot": 542,
    "title": "极简主义扁平插图",
    "prompt": "以活动 banner 元素为核心创作，融合扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 21,
    "sref": "1612582939",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1612582939-1-028fd87d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1612582939-2-c84c42f4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1612582939-3-56747ba2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1612582939-4-8837b058"
    ],
    "tags": [
      "卡通",
      "蓝色",
      "可爱",
      "插图",
      "极简主义"
    ],
    "sourceHot": 533,
    "title": "蓝色极简主义可爱卡通",
    "prompt": "以趣味物件为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间。构图采用少元素中心构图，大面积留白，层级关系清楚；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 22,
    "sref": "2453165002",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2453165002-1-4fe21e88",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2453165002-2-ffd05045",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2453165002-3-81858b89",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2453165002-4-c5da1a38"
    ],
    "tags": [
      "超现实主义",
      "粉色",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 531,
    "title": "粉色超现实主义珠宝视觉海报",
    "prompt": "以秀场瞬间为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 23,
    "sref": "3986738193",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986738193-1-05dc3851",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986738193-2-f668e1db",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986738193-3-4f7bab1a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986738193-4-985038a2"
    ],
    "tags": [
      "动漫",
      "复古",
      "赛博朋克"
    ],
    "sourceHot": 526,
    "title": "复古赛博朋克动漫",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，霓虹灯牌、未来城市和高对比科幻细节。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 24,
    "sref": "811417151",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/811417151-1-41d480a0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/811417151-2-f16b2a9b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/811417151-3-31877b79",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/811417151-4-cb492f66"
    ],
    "tags": [
      "红色",
      "扁平设计",
      "极简主义",
      "插图"
    ],
    "sourceHot": 526,
    "title": "红色极简主义扁平插图",
    "prompt": "以网页插画场景为核心创作，融合扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 25,
    "sref": "330820041",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/330820041-1-ca37edaf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/330820041-2-2d6246a2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/330820041-3-eb153815",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/330820041-4-f3c6d24a"
    ],
    "tags": [
      "摄影",
      "粉色"
    ],
    "sourceHot": 504,
    "title": "粉色摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 26,
    "sref": "20240916",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240916-1-099ef71b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240916-2-30608bdb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240916-3-ad5b6ebe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240916-4-7a987d59"
    ],
    "tags": [
      "摄影",
      "粉色",
      "时尚"
    ],
    "sourceHot": 500,
    "title": "粉色时尚摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 27,
    "sref": "2131889852",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2131889852-1-bfeee0d8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2131889852-2-db38d8c7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2131889852-3-3011892c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2131889852-4-31ce6cc8"
    ],
    "tags": [
      "动漫",
      "复古",
      "吉卜力工作室"
    ],
    "sourceHot": 498,
    "title": "复古动漫插图主视觉",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，手绘动画气息、自然场景和治愈冒险感。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 28,
    "sref": "2206251055",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2206251055-1-0e812a61",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2206251055-2-d881d8b5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2206251055-3-41d44891",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2206251055-4-15e1b1db"
    ],
    "tags": [
      "动漫",
      "复古",
      "插图",
      "粉色"
    ],
    "sourceHot": 491,
    "title": "粉色复古动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 29,
    "sref": "935888290",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/935888290-1-68deffad",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/935888290-2-26fd5d55",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/935888290-3-b61ae973",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/935888290-4-aaeabcca"
    ],
    "tags": [
      "插图",
      "涂色书",
      "2D",
      "扁平设计",
      "黑色"
    ],
    "sourceHot": 490,
    "title": "黑色2D 插图",
    "prompt": "以品牌吉祥物为核心创作，融合高完成度商业插画质感和清晰叙事层次，黑白或低色彩线稿、可涂色留白和儿童活动页感，平面 2D 造型、简洁色块和明确轮廓，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 30,
    "sref": "20032025",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20032025-1-290a0fcd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20032025-2-ac8fae4b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20032025-3-9c59021f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20032025-4-3ca4fe85"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 481,
    "title": "复古电影摄影海报",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 31,
    "sref": "3846026342",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3846026342-1-bd1f4434",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3846026342-2-fbcb25c9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3846026342-3-75392f73",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3846026342-4-fc6e299f"
    ],
    "tags": [
      "粉色",
      "扁平设计",
      "插图",
      "复古"
    ],
    "sourceHot": 480,
    "title": "粉色复古扁平插图",
    "prompt": "以信息图主角为核心创作，融合扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次，复古胶片颗粒、怀旧配色和年代感构图。构图采用几何化布局，块面均衡，信息层级清晰；暖色胶片光、轻微颗粒和年代感色偏。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 32,
    "sref": "395232092",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/395232092-1-8e2548d5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/395232092-2-2ce178c2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/395232092-3-b90a017d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/395232092-4-90e5d9ca"
    ],
    "tags": [
      "摄影",
      "黑暗幻想",
      "黑色",
      "电影",
      "时尚"
    ],
    "sourceHot": 478,
    "title": "黑色时尚电影摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，黑暗奇幻气质、神秘轮廓和史诗阴影，电影剧照般叙事构图、景深和氛围光，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 33,
    "sref": "4045456694",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4045456694-1-b7658146",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4045456694-2-fe0f1e87",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4045456694-3-68547bdf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4045456694-4-81f7bc74"
    ],
    "tags": [
      "绿色",
      "蓝色",
      "插图"
    ],
    "sourceHot": 477,
    "title": "蓝色插图",
    "prompt": "以人物、产品或场景主体为核心创作，融合高完成度商业插画质感和清晰叙事层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色、蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 34,
    "sref": "2700920344",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2700920344-1-9850d1c4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2700920344-2-80bc6a7c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2700920344-3-63c9781a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2700920344-4-c8e09283"
    ],
    "tags": [
      "蓝色",
      "动漫",
      "超现实主义",
      "渐变"
    ],
    "sourceHot": 467,
    "title": "蓝色超现实主义动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，梦境般超现实布景、错位物体关系和强视觉记忆点，柔和渐变过渡、通透色带和现代视觉层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 35,
    "sref": "3612798423",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3612798423-1-8e38b418",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3612798423-2-cadf04fb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3612798423-3-c83bd19a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3612798423-4-12f56e76"
    ],
    "tags": [
      "水墨",
      "蓝色",
      "极简主义"
    ],
    "sourceHot": 466,
    "title": "蓝色极简主义水墨插画",
    "prompt": "以人物、产品或场景主体为核心创作，融合水墨晕染、宣纸纹理和东方笔意，极简构图、克制元素和充足负空间。构图采用少元素中心构图，大面积留白，层级关系清楚；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 36,
    "sref": "1923246294",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1923246294-1-37285f89",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1923246294-2-f376c4fa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1923246294-3-5b20d95d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1923246294-4-41aea819"
    ],
    "tags": [
      "3D",
      "卡通",
      "粉色",
      "迪士尼"
    ],
    "sourceHot": 461,
    "title": "粉色卡通插画",
    "prompt": "以玩具角色为核心创作，融合柔和 3D 体块、圆角造型和干净材质，圆润卡通造型、轻松幽默的角色表情，经典童话动画般亲和角色与温暖故事感。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；均匀柔光，色块干净无脏边。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 37,
    "sref": "1357817515",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1357817515-1-f5e20e69",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1357817515-2-18935329",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1357817515-3-2645307f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1357817515-4-001b3651"
    ],
    "tags": [
      "插图",
      "橙色",
      "扁平设计"
    ],
    "sourceHot": 458,
    "title": "橙色扁平插图",
    "prompt": "以活动 banner 元素为核心创作，融合高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 38,
    "sref": "494492",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/494492-1-90e953ac",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/494492-2-51cb876d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/494492-3-1bc7618e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/494492-4-72383049"
    ],
    "tags": [
      "卡通",
      "可爱",
      "插图"
    ],
    "sourceHot": 454,
    "title": "可爱卡通",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 39,
    "sref": "1745310544",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1745310544-1-48692634",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1745310544-2-08ebf3e1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1745310544-3-b97ffb45",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1745310544-4-eb4a382d"
    ],
    "tags": [
      "动漫",
      "复古",
      "黑暗幻想",
      "赛博朋克"
    ],
    "sourceHot": 451,
    "title": "复古黑暗幻想赛博朋克动漫",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，黑暗奇幻气质、神秘轮廓和史诗阴影，霓虹灯牌、未来城市和高对比科幻细节。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 40,
    "sref": "710577130",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/710577130-1-e22a79ab",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/710577130-2-43deed32",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/710577130-3-59f956a3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/710577130-4-37ae2a7e"
    ],
    "tags": [
      "摄影"
    ],
    "sourceHot": 443,
    "title": "摄影海报",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 41,
    "sref": "1567159629",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1567159629680572301-img-1-6761a5b2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1567159629680572301-img-2-bdbf64e7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1567159629680572301-img-3-b08d4f19",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1567159629680572301-img-4-1def85d6"
    ],
    "tags": [
      "插图",
      "儿童书籍",
      "可爱",
      "卡通",
      "复古"
    ],
    "sourceHot": 440,
    "title": "复古儿童书籍可爱卡通",
    "prompt": "以轻松生活场景为核心创作，融合高完成度商业插画质感和清晰叙事层次，儿童绘本氛围、柔和故事性与安全温暖画面，柔软可爱的形体、亲和情绪和明快节奏，圆润卡通造型、轻松幽默的角色表情。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 42,
    "sref": "1752248457",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1752248457-1-f02de974",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1752248457-2-71ae29ff",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1752248457-3-f5d95a36",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1752248457-4-a773a1e6"
    ],
    "tags": [
      "油画",
      "黑色",
      "极简主义",
      "插图",
      "儿童书籍"
    ],
    "sourceHot": 437,
    "title": "黑色极简主义油画视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合油画笔触、厚涂层次和画布质感，极简构图、克制元素和充足负空间，高完成度商业插画质感和清晰叙事层次，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用少元素中心构图，大面积留白，层级关系清楚；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 43,
    "sref": "247250114",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/247250114-1-d2f694c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/247250114-2-75c3ceb6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/247250114-3-7f92daad",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/247250114-4-5d0318a5"
    ],
    "tags": [
      "3D",
      "卡通",
      "迪士尼"
    ],
    "sourceHot": 437,
    "title": "3D卡通插画",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质，圆润卡通造型、轻松幽默的角色表情，经典童话动画般亲和角色与温暖故事感。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 44,
    "sref": "3322162017",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3322162017-1-7fdddd77",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3322162017-2-84e9e9a2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3322162017-3-1057f1e3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3322162017-4-fe857781"
    ],
    "tags": [
      "卡通",
      "蓝色",
      "粉色",
      "渐变"
    ],
    "sourceHot": 437,
    "title": "粉色渐变卡通插画",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔和渐变过渡、通透色带和现代视觉层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出蓝色、粉色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 45,
    "sref": "495902552",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/495902552-1-d85f6df4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/495902552-2-595abf97",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/495902552-3-c91647fc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/495902552-4-34f8db59"
    ],
    "tags": [
      "卡通",
      "插图",
      "漫画书",
      "漫画风格",
      "水墨",
      "可爱",
      "复古"
    ],
    "sourceHot": 435,
    "title": "复古可爱漫画插图",
    "prompt": "以小动物伙伴为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，漫画书式叙事框架、夸张表情和戏剧动作，漫画分镜感、动态姿态和有力轮廓线。构图采用动态角度和分镜感，姿态有速度与冲击力；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 46,
    "sref": "712438293",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/712438293-1-82c939b6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/712438293-2-8cda4d70",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/712438293-3-0a9d8aa9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/712438293-4-e1de1cab"
    ],
    "tags": [
      "卡通",
      "漫画书",
      "插图",
      "绿色",
      "黄色"
    ],
    "sourceHot": 431,
    "title": "绿色漫画书视觉",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，漫画书式叙事框架、夸张表情和戏剧动作，高完成度商业插画质感和清晰叙事层次。构图采用动态角度和分镜感，姿态有速度与冲击力；均匀柔光，色块干净无脏边。色彩突出绿色、黄色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 47,
    "sref": "2844616446",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2844616446-1-2aa78a3c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2844616446-2-1007a7c9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2844616446-3-ff41510d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2844616446-4-011461d1"
    ],
    "tags": [
      "摄影",
      "紫色",
      "复古"
    ],
    "sourceHot": 430,
    "title": "紫色复古摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 48,
    "sref": "2818027581",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2818027581-1-662faf7a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2818027581-2-1d3d158b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2818027581-3-21a90310",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2818027581-4-976966ff"
    ],
    "tags": [
      "动漫",
      "超现实主义",
      "漫画风格",
      "插图"
    ],
    "sourceHot": 426,
    "title": "超现实主义动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，梦境般超现实布景、错位物体关系和强视觉记忆点，漫画分镜感、动态姿态和有力轮廓线，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 49,
    "sref": "567483527",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/567483527-1-c431093b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/567483527-2-955b52e4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/567483527-3-fb7aac05",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/567483527-4-92aadf46"
    ],
    "tags": [
      "超现实主义",
      "粉色"
    ],
    "sourceHot": 421,
    "title": "粉色超现实主义创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 50,
    "sref": "388732857",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/388732857-1-faedeb12",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/388732857-2-42e4558a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/388732857-3-4154299c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/388732857-4-4ec72970"
    ],
    "tags": [
      "复古",
      "电影",
      "摄影"
    ],
    "sourceHot": 418,
    "title": "复古电影摄影场景",
    "prompt": "以生活方式画面为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光，写实摄影镜头语言、真实质感和自然景深。构图采用横向电影画幅，前中后景有层次，情绪叙事明确；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 51,
    "sref": "1454511430",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1454511430-1-8c0e0b35",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1454511430-2-d20d9ff8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1454511430-3-a98bab33",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1454511430-4-13306ecd"
    ],
    "tags": [
      "动漫",
      "卡通",
      "漫画书",
      "复古"
    ],
    "sourceHot": 417,
    "title": "复古动漫插图海报",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，漫画书式叙事框架、夸张表情和戏剧动作，复古胶片颗粒、怀旧配色和年代感构图。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 52,
    "sref": "2537893372",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2537893372-1-89e4724e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2537893372-2-62659ec6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2537893372-3-8b1ff3e6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2537893372-4-920c7c25"
    ],
    "tags": [
      "超现实主义",
      "摄影",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 416,
    "title": "超现实主义时尚珠宝视觉",
    "prompt": "以建筑空间为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 53,
    "sref": "2824473958",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2824473958-1-d0820328",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2824473958-2-60e1dd5e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2824473958-3-c3439a38",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2824473958-4-e6550cc3"
    ],
    "tags": [
      "卡通",
      "插图",
      "儿童书籍"
    ],
    "sourceHot": 416,
    "title": "儿童书籍卡通插画",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 54,
    "sref": "3326977824",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3326977824-1-ce0a8400",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3326977824-2-1a1bd533",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3326977824-3-134b5e40",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3326977824-4-6c1fbbda"
    ],
    "tags": [
      "摄影",
      "写实",
      "复古"
    ],
    "sourceHot": 416,
    "title": "复古摄影主视觉",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 55,
    "sref": "3386075113",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3386075113-1-16088cd1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3386075113-2-51763d7e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3386075113-3-3681c549",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3386075113-4-214b0753"
    ],
    "tags": [
      "2D",
      "矢量",
      "蓝色",
      "可爱"
    ],
    "sourceHot": 415,
    "title": "蓝色可爱2D 插图",
    "prompt": "以简洁人物为核心创作，融合平面 2D 造型、简洁色块和明确轮廓，矢量插画线面结合、边缘干净可缩放，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 56,
    "sref": "211930203",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/211930203-1-1d688ac1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/211930203-2-f5851afd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/211930203-3-d92f757d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/211930203-4-4cbb13cd"
    ],
    "tags": [
      "动漫",
      "粉色",
      "插图",
      "时尚"
    ],
    "sourceHot": 413,
    "title": "粉色时尚动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次，精致造型、服饰材质与杂志大片气质。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 57,
    "sref": "126701066",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/126701066-1-8b61afd7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/126701066-2-1176f55c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/126701066-3-e42f66df",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/126701066-4-749fe936"
    ],
    "tags": [
      "摄影"
    ],
    "sourceHot": 409,
    "title": "摄影场景",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 58,
    "sref": "2581180571",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2581180571-1-f4e24371",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2581180571-2-3a942ca5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2581180571-3-8b68af17",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2581180571-4-80d8a96a"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 407,
    "title": "复古电影摄影肖像",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 59,
    "sref": "2889748792",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2889748792-1-f2cfdc63",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2889748792-2-6aeebd5b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2889748792-3-fbdf4d47",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2889748792-4-28c76556"
    ],
    "tags": [
      "复古",
      "珠宝设计"
    ],
    "sourceHot": 407,
    "title": "复古珠宝视觉",
    "prompt": "以珠宝静物为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，宝石、金属、玻璃反射与奢华高光细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合珠宝广告、产品海报或奢侈品视觉。"
  },
  {
    "rank": 60,
    "sref": "2474514122",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2474514122-1-d80b30bb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2474514122-2-1c0cde84",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2474514122-3-e4505374",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2474514122-4-d113aab8"
    ],
    "tags": [
      "动漫",
      "漫画风格",
      "漫画书",
      "线条艺术"
    ],
    "sourceHot": 404,
    "title": "漫画风格动漫插图主视觉",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画分镜感、动态姿态和有力轮廓线，漫画书式叙事框架、夸张表情和戏剧动作，线条艺术结构、明确轮廓和手绘笔触。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 61,
    "sref": "3196580341",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3196580341-1-5ad06a08",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3196580341-2-d91c1a00",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3196580341-3-e7c29a71",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3196580341-4-e5c2b611"
    ],
    "tags": [
      "动漫",
      "卡通",
      "橙色",
      "复古"
    ],
    "sourceHot": 404,
    "title": "橙色复古动漫插图",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，复古胶片颗粒、怀旧配色和年代感构图。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 62,
    "sref": "962970979",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/962970979-1-07485563",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/962970979-2-d5e6a1c6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/962970979-3-561cd423",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/962970979-4-0daee355"
    ],
    "tags": [
      "摄影",
      "珠宝设计"
    ],
    "sourceHot": 402,
    "title": "摄影珠宝设计珠宝视觉",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 63,
    "sref": "3193102811",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3193102811-1-e7ea6050",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3193102811-2-fb089d7f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3193102811-3-fca01470",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3193102811-4-dfd91c22"
    ],
    "tags": [
      "卡通",
      "动漫",
      "迪士尼",
      "插图"
    ],
    "sourceHot": 400,
    "title": "卡通动漫插图",
    "prompt": "以小动物伙伴为核心创作，融合圆润卡通造型、轻松幽默的角色表情，动漫角色比例、清晰线条与情绪化画面，经典童话动画般亲和角色与温暖故事感，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 64,
    "sref": "1765287762",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1765287762-1-0807345e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1765287762-2-2107fe77",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1765287762-3-6270a691",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1765287762-4-0a90f3fc"
    ],
    "tags": [
      "卡通",
      "蓝色",
      "可爱",
      "迪士尼",
      "水墨"
    ],
    "sourceHot": 396,
    "title": "蓝色可爱卡通",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，经典童话动画般亲和角色与温暖故事感，水墨晕染、宣纸纹理和东方笔意。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 65,
    "sref": "1809476652",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809476652-1-ed0c1cc7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809476652-2-297eb3a1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809476652-3-05371aab",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809476652-4-e512aaf0"
    ],
    "tags": [
      "摄影",
      "复古"
    ],
    "sourceHot": 396,
    "title": "复古摄影海报",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 66,
    "sref": "407997125",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/407997125-1-77ac9efe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/407997125-2-90499b22",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/407997125-3-3973a14d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/407997125-4-db8bb5cb"
    ],
    "tags": [
      "卡通",
      "扁平设计",
      "插图"
    ],
    "sourceHot": 395,
    "title": "扁平设计卡通插画",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 67,
    "sref": "2917660624",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2917660624-1-a9887168",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2917660624-2-a7dc1793",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2917660624-3-f2ce5adb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2917660624-4-0b41d834"
    ],
    "tags": [
      "摄影",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 391,
    "title": "时尚珠宝视觉",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 68,
    "sref": "394482118",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/394482118-1-b4c4bbd6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/394482118-2-824270cf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/394482118-3-ba4f17d5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/394482118-4-e1c8fcda"
    ],
    "tags": [
      "插图",
      "漫画书",
      "卡通",
      "漫画风格",
      "可爱"
    ],
    "sourceHot": 391,
    "title": "可爱漫画插图",
    "prompt": "以可爱角色为核心创作，融合高完成度商业插画质感和清晰叙事层次，漫画书式叙事框架、夸张表情和戏剧动作，圆润卡通造型、轻松幽默的角色表情，漫画分镜感、动态姿态和有力轮廓线。构图采用动态角度和分镜感，姿态有速度与冲击力；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 69,
    "sref": "1616994548",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1616994548-1-4ce3f433",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1616994548-2-830b90bb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1616994548-3-b0d77490",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1616994548-4-6e67574c"
    ],
    "tags": [
      "动漫",
      "吉卜力工作室",
      "插图"
    ],
    "sourceHot": 387,
    "title": "吉卜力工作室动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，手绘动画气息、自然场景和治愈冒险感，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 70,
    "sref": "3918706962",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918706962-1-2d3b4ab4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918706962-2-e2ba3f97",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918706962-3-01a34960",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918706962-4-3dc80317"
    ],
    "tags": [
      "插图",
      "漫画风格"
    ],
    "sourceHot": 387,
    "title": "漫画风格漫画插图",
    "prompt": "以夸张表情特写为核心创作，融合高完成度商业插画质感和清晰叙事层次，漫画分镜感、动态姿态和有力轮廓线。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 71,
    "sref": "4188471348",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4188471348-1-e9d53bd2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4188471348-2-87dc1d00",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4188471348-3-dadf0c1a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4188471348-4-4f37304e"
    ],
    "tags": [
      "超现实主义",
      "粉色"
    ],
    "sourceHot": 386,
    "title": "粉色超现实主义创意视觉主视觉",
    "prompt": "以具有故事感的主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 72,
    "sref": "534505",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/534505-1-68b9c702",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/534505-2-b631098e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/534505-3-c3b6408f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/534505-4-bb68a1ad"
    ],
    "tags": [
      "摄影",
      "3D"
    ],
    "sourceHot": 383,
    "title": "3D摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，柔和 3D 体块、圆角造型和干净材质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 73,
    "sref": "2635889723",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/26358897231-1-ffdc71bc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/26358897231-2-7e55f2b6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/26358897231-3-4ac4df09",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/26358897231-4-7df35d82"
    ],
    "tags": [
      "动漫",
      "超现实主义",
      "渐变"
    ],
    "sourceHot": 380,
    "title": "超现实主义渐变动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，梦境般超现实布景、错位物体关系和强视觉记忆点，柔和渐变过渡、通透色带和现代视觉层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 74,
    "sref": "3829504366",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3829504366-1-4e093ad2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3829504366-2-0be6679e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3829504366-3-5353e951",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3829504366-4-1d4436dd"
    ],
    "tags": [
      "动漫",
      "橙色",
      "可爱",
      "扁平设计",
      "极简主义",
      "插图"
    ],
    "sourceHot": 380,
    "title": "橙色极简主义动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，柔软可爱的形体、亲和情绪和明快节奏，扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间。构图采用角色与环境比例协调，镜头略带故事分镜感；柔和漫反射光，整体明亮亲和。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 75,
    "sref": "3581618356",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3581618356-1-46122a37",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3581618356-2-fdfd8287",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3581618356-3-320cbdce",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3581618356-4-372647ea"
    ],
    "tags": [
      "动漫",
      "蓝色",
      "插图"
    ],
    "sourceHot": 379,
    "title": "蓝色动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 76,
    "sref": "3496247666",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3496247666-1-9e16f312",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3496247666-2-ad245c9a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3496247666-3-6e2b6076",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3496247666-4-b274dc96"
    ],
    "tags": [
      "摄影",
      "写实",
      "电影"
    ],
    "sourceHot": 378,
    "title": "写实电影摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 77,
    "sref": "3950365390",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3950365390-1-0af2d83a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3950365390-2-770e364b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3950365390-3-e372ad41",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3950365390-4-20975cef"
    ],
    "tags": [
      "卡通",
      "蓝色",
      "插图",
      "极简主义"
    ],
    "sourceHot": 378,
    "title": "蓝色极简主义卡通插画",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间。构图采用少元素中心构图，大面积留白，层级关系清楚；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 78,
    "sref": "3733672499",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3733672499-1-fb8aa197",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3733672499-2-91be4733",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3733672499-3-0ffd3b3b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3733672499-4-d4d991a7"
    ],
    "tags": [
      "超现实主义",
      "金色",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 375,
    "title": "金色超现实主义珠宝视觉",
    "prompt": "以秀场瞬间为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩突出金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 79,
    "sref": "400515038",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/400515038-1-f1742cf5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/400515038-2-7c742dc7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/400515038-3-a6110e8e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/400515038-4-1a43b908"
    ],
    "tags": [
      "矢量",
      "扁平设计",
      "可爱",
      "插图"
    ],
    "sourceHot": 375,
    "title": "可爱扁平插图",
    "prompt": "以包装纹样为核心创作，融合矢量插画线面结合、边缘干净可缩放，扁平化图形、清爽留白与图标化结构，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 80,
    "sref": "3121740568",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3121740568-1-7df31720",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3121740568-2-93a96934",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3121740568-3-86490398",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3121740568-4-59c61c8d"
    ],
    "tags": [
      "动漫",
      "复古",
      "赛博朋克",
      "红色"
    ],
    "sourceHot": 374,
    "title": "红色复古赛博朋克动漫",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，霓虹灯牌、未来城市和高对比科幻细节。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 81,
    "sref": "1287455521",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1287455521-1-5cf8c18b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1287455521-2-0c9d2841",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1287455521-3-c15a5b53",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1287455521-4-afc27b78"
    ],
    "tags": [
      "动漫",
      "插图"
    ],
    "sourceHot": 372,
    "title": "动漫插图",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 82,
    "sref": "2394004029",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2394004029-1-3f7949bf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2394004029-2-9ed5329e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2394004029-3-723827bb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2394004029-4-e28d04e7"
    ],
    "tags": [
      "赛博朋克",
      "漫画风格",
      "动漫",
      "复古"
    ],
    "sourceHot": 371,
    "title": "复古赛博朋克动漫主视觉",
    "prompt": "以分镜场景为核心创作，融合霓虹灯牌、未来城市和高对比科幻细节，漫画分镜感、动态姿态和有力轮廓线，动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图。构图采用角色与环境比例协调，镜头略带故事分镜感；霓虹冷暖对比，暗部带城市反射。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 83,
    "sref": "1405812467",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1405812467-1-8f3a7dbf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1405812467-2-79d729cc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1405812467-3-3e3bb877",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1405812467-4-4c327fc9"
    ],
    "tags": [
      "摄影",
      "蓝色",
      "复古"
    ],
    "sourceHot": 370,
    "title": "蓝色复古摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 84,
    "sref": "2283932573",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2283932573-1-bfc59c89",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2283932573-2-1ac41b48",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2283932573-3-951f216e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2283932573-4-bbeff7f5"
    ],
    "tags": [
      "超现实主义",
      "复古"
    ],
    "sourceHot": 368,
    "title": "超现实主义复古创意视觉",
    "prompt": "以人物、产品或场景主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 85,
    "sref": "120005898",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/120005898-1-69f7dbde",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/120005898-2-4727b845",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/120005898-3-2e1db665",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/120005898-4-cc71b531"
    ],
    "tags": [
      "动漫",
      "插图",
      "蓝色"
    ],
    "sourceHot": 367,
    "title": "蓝色动漫插图主视觉",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 86,
    "sref": "375843679",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375843679-1-ddcf8a46",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375843679-2-27e48654",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375843679-3-6666c456",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375843679-4-d7043e74"
    ],
    "tags": [
      "赛博朋克",
      "复古",
      "蓝色",
      "超现实主义",
      "3D"
    ],
    "sourceHot": 367,
    "title": "蓝色超现实主义3D 视觉",
    "prompt": "以活动主视觉装置为核心创作，融合霓虹灯牌、未来城市和高对比科幻细节，复古胶片颗粒、怀旧配色和年代感构图，梦境般超现实布景、错位物体关系和强视觉记忆点，柔和 3D 体块、圆角造型和干净材质。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；霓虹冷暖对比，暗部带城市反射。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 87,
    "sref": "2154715959",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2154715959-1-c91d57a9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2154715959-2-cd0a5e21",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2154715959-3-7ae1acc0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2154715959-4-6687ba99"
    ],
    "tags": [
      "超现实主义",
      "紫色",
      "摄影",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 366,
    "title": "紫色超现实主义珠宝视觉",
    "prompt": "以生活方式画面为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 88,
    "sref": "2544859236",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2544859236-1-3ed0e9e2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2544859236-2-39a3bf89",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2544859236-3-e9dd81b6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2544859236-4-60669eeb"
    ],
    "tags": [
      "超现实主义",
      "紫色"
    ],
    "sourceHot": 366,
    "title": "紫色超现实主义创意视觉",
    "prompt": "以人物、产品或场景主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 89,
    "sref": "30972",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/30972-1-fadd3855",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/30972-2-d8237bec",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/30972-3-4a94abea",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/30972-4-4d4131a2"
    ],
    "tags": [
      "动漫",
      "3D",
      "插图",
      "蓝色"
    ],
    "sourceHot": 366,
    "title": "蓝色动漫插图海报",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，柔和 3D 体块、圆角造型和干净材质，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 90,
    "sref": "2908649403",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908649403-1-bad96cb6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908649403-2-2484b9cc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908649403-3-16004f63",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908649403-4-e1db9a33"
    ],
    "tags": [
      "粉色",
      "动漫",
      "迪士尼",
      "可爱"
    ],
    "sourceHot": 363,
    "title": "粉色可爱动漫插图",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，经典童话动画般亲和角色与温暖故事感，柔软可爱的形体、亲和情绪和明快节奏。构图采用角色与环境比例协调，镜头略带故事分镜感；柔和漫反射光，整体明亮亲和。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 91,
    "sref": "548832312",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/548832312-1-8f1abb31",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/548832312-2-979aa8ad",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/548832312-3-0fc1cbe0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/548832312-4-dc563b41"
    ],
    "tags": [
      "动漫",
      "蓝色"
    ],
    "sourceHot": 362,
    "title": "蓝色动漫插图场景",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 92,
    "sref": "1687696634",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1687696634-1-35007874",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1687696634-2-a24c9d66",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1687696634-3-2a9af824",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1687696634-4-9da64bb9"
    ],
    "tags": [
      "漫画风格",
      "涂色书"
    ],
    "sourceHot": 361,
    "title": "漫画风格涂色书漫画插图",
    "prompt": "以动作角色为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，黑白或低色彩线稿、可涂色留白和儿童活动页感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 93,
    "sref": "1447895072",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1447895072-1-d95e8c4a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1447895072-2-07af8cd3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1447895072-3-7e9a670c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1447895072-4-f68d7a22"
    ],
    "tags": [
      "动漫",
      "3D",
      "科幻"
    ],
    "sourceHot": 359,
    "title": "科幻动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，柔和 3D 体块、圆角造型和干净材质，未来科技装置、空间尺度和冷峻想象力。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 94,
    "sref": "851985277",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/851985277-1-e8635269",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/851985277-2-07925608",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/851985277-3-7b4da5a8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/851985277-4-4ff2e315"
    ],
    "tags": [
      "动漫",
      "水墨"
    ],
    "sourceHot": 358,
    "title": "水墨动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，水墨晕染、宣纸纹理和东方笔意。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 95,
    "sref": "2327490970",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2327490970-1-ca34e737",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2327490970-2-7b78c9e8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2327490970-3-a1b0a12d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2327490970-4-61708f30"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 356,
    "title": "复古电影摄影封面",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 96,
    "sref": "2364390898",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2364390898-1-c004906d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2364390898-2-d165172e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2364390898-3-878b34b3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2364390898-4-989dd5b1"
    ],
    "tags": [
      "超现实主义",
      "摄影"
    ],
    "sourceHot": 354,
    "title": "超现实主义摄影",
    "prompt": "以街头场景为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 97,
    "sref": "3360901207",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3360901207-1-cc5668c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3360901207-2-91922553",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3360901207-3-0daa63de",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3360901207-4-7f5b2f21"
    ],
    "tags": [
      "粉色",
      "蓝色"
    ],
    "sourceHot": 352,
    "title": "粉色创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合清晰统一的视觉风格、完整构图和可复用审美方向。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色、蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 98,
    "sref": "3986684218",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986684218-1-d6643aab",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986684218-2-3b3757f6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986684218-3-392b794b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3986684218-4-9d63f7aa"
    ],
    "tags": [
      "动漫",
      "蓝色",
      "卡通"
    ],
    "sourceHot": 352,
    "title": "蓝色动漫插图肖像",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 99,
    "sref": "456250672",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 456250672-1-cdd27cd4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 456250672-2-e8c4cd7b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 456250672-3-1189636b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 456250672-4-e5132cec"
    ],
    "tags": [
      "动漫",
      "蓝色",
      "水墨"
    ],
    "sourceHot": 352,
    "title": "蓝色动漫插图封面",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，水墨晕染、宣纸纹理和东方笔意。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 100,
    "sref": "3920949925",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3920949925-1-50bdc949",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3920949925-2-c7a9b07c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3920949925-3-b4aab55e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3920949925-4-3c11b86b"
    ],
    "tags": [
      "蓝色",
      "插图",
      "动漫",
      "粉色"
    ],
    "sourceHot": 351,
    "title": "粉色动漫插图",
    "prompt": "以冒险场景为核心创作，融合高完成度商业插画质感和清晰叙事层次，动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色、粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 101,
    "sref": "3988238972",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3988238972-1-642faa81",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3988238972-2-ae9ef2e0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3988238972-3-aaad3ba0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3988238972-4-8bab1be4"
    ],
    "tags": [
      "摄影",
      "超现实主义",
      "赛博朋克",
      "科幻"
    ],
    "sourceHot": 351,
    "title": "超现实主义赛博朋克摄影",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，梦境般超现实布景、错位物体关系和强视觉记忆点，霓虹灯牌、未来城市和高对比科幻细节，未来科技装置、空间尺度和冷峻想象力。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 102,
    "sref": "2429418260",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2429418260-1-d0036e01",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2429418260-2-995a6a9e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2429418260-3-a7b0fe78",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2429418260-4-620644aa"
    ],
    "tags": [
      "动漫",
      "粉色",
      "卡通",
      "迪士尼"
    ],
    "sourceHot": 348,
    "title": "粉色动漫插图主视觉",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，经典童话动画般亲和角色与温暖故事感。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 103,
    "sref": "3652866000",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3652866000-1-f74cbdff",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3652866000-2-e67ab3b5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3652866000-3-d0ba5d92",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3652866000-4-72e4a0cb"
    ],
    "tags": [
      "红色",
      "卡通",
      "儿童书籍"
    ],
    "sourceHot": 346,
    "title": "红色儿童书籍卡通插画",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 104,
    "sref": "894157069",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/894157069-1-cccdbdc9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/894157069-2-d8bfac06",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/894157069-3-36366122",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/894157069-4-1461ea11"
    ],
    "tags": [
      "漫画风格",
      "涂色书",
      "漫画书",
      "极简主义",
      "线条艺术"
    ],
    "sourceHot": 346,
    "title": "极简主义漫画插图",
    "prompt": "以分镜场景为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，黑白或低色彩线稿、可涂色留白和儿童活动页感，漫画书式叙事框架、夸张表情和戏剧动作，极简构图、克制元素和充足负空间。构图采用动态角度和分镜感，姿态有速度与冲击力；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 105,
    "sref": "273390",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/273390-1-906fa1eb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/273390-2-0d893b7b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/273390-3-113a35f7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/273390-4-017890b9"
    ],
    "tags": [
      "扁平设计",
      "粉色",
      "蓝色",
      "插图",
      "儿童书籍"
    ],
    "sourceHot": 345,
    "title": "粉色儿童书籍扁平插图",
    "prompt": "以品牌吉祥物为核心创作，融合扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色、蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 106,
    "sref": "1324414537",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1324414537-1-ad9cdea9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1324414537-2-a98f306e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1324414537-3-2fff5892",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1324414537-4-3ad5942f"
    ],
    "tags": [
      "摄影",
      "黑色",
      "电影",
      "赛博朋克"
    ],
    "sourceHot": 344,
    "title": "黑色赛博朋克电影摄影",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，电影剧照般叙事构图、景深和氛围光，霓虹灯牌、未来城市和高对比科幻细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 107,
    "sref": "1787761795",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1787761795-1-3bdaa7d7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1787761795-2-58969a8e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1787761795-3-dbb6614a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1787761795-4-0c8490e4"
    ],
    "tags": [
      "动漫",
      "红色",
      "复古",
      "迪士尼",
      "插图"
    ],
    "sourceHot": 344,
    "title": "红色复古动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，经典童话动画般亲和角色与温暖故事感，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 108,
    "sref": "20240806",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240806-1-6e324ad5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240806-2-9f471922",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240806-3-8d0b1e6a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240806-4-cdb39ade"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 344,
    "title": "复古电影摄影概念",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 109,
    "sref": "3915165969",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3915165969-1-5f47df40",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3915165969-2-e6286cfd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3915165969-3-958a367c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3915165969-4-81e1e506"
    ],
    "tags": [
      "摄影",
      "粉色",
      "时尚",
      "橙色"
    ],
    "sourceHot": 340,
    "title": "粉色时尚摄影主视觉",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出粉色、橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 110,
    "sref": "396159868",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/396159868-1-ee3684fe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/396159868-2-7d612fc8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/396159868-3-2df701bc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/396159868-4-c4cb30d7"
    ],
    "tags": [
      "摄影",
      "黑暗幻想",
      "黑色"
    ],
    "sourceHot": 340,
    "title": "黑色黑暗幻想摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 111,
    "sref": "441822729",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/441822729-1-95398347",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/441822729-2-7c075126",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/441822729-3-9ed02e7a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/441822729-4-fad6b5ef"
    ],
    "tags": [
      "涂色书",
      "扁平设计",
      "复古"
    ],
    "sourceHot": 336,
    "title": "复古扁平插图",
    "prompt": "以活动 banner 元素为核心创作，融合黑白或低色彩线稿、可涂色留白和儿童活动页感，扁平化图形、清爽留白与图标化结构，复古胶片颗粒、怀旧配色和年代感构图。构图采用几何化布局，块面均衡，信息层级清晰；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 112,
    "sref": "828996075",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/828996075-1-d5451d76",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/828996075-2-d88d7b12",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/828996075-3-e1bd60a9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/828996075-4-f8b368bf"
    ],
    "tags": [
      "复古",
      "插图",
      "漫画书",
      "动漫"
    ],
    "sourceHot": 336,
    "title": "复古动漫插图场景",
    "prompt": "以城市街景中的角色为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，高完成度商业插画质感和清晰叙事层次，漫画书式叙事框架、夸张表情和戏剧动作，动漫角色比例、清晰线条与情绪化画面。构图采用动态角度和分镜感，姿态有速度与冲击力；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 113,
    "sref": "1177177668",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1177177668-1-0e0b9eb9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1177177668-2-d896a62f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1177177668-3-f0cbf832",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1177177668-4-bdc34468"
    ],
    "tags": [
      "摄影",
      "黑色",
      "写实",
      "电影"
    ],
    "sourceHot": 335,
    "title": "黑色电影摄影",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 114,
    "sref": "4270727113",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4270727113-1-99134dd8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4270727113-2-779cb091",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4270727113-3-589fce27",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4270727113-4-ef896607"
    ],
    "tags": [
      "漫画风格",
      "涂色书",
      "漫画书"
    ],
    "sourceHot": 334,
    "title": "漫画风格涂色书漫画插图主视觉",
    "prompt": "以英雄姿态为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，黑白或低色彩线稿、可涂色留白和儿童活动页感，漫画书式叙事框架、夸张表情和戏剧动作。构图采用动态角度和分镜感，姿态有速度与冲击力；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 115,
    "sref": "474790598",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/474790598-1-6aacfeb4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/474790598-2-cd1eadf8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/474790598-3-8332c289",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/474790598-4-e18b81a3"
    ],
    "tags": [
      "粉色",
      "圣诞节",
      "插图",
      "海报设计"
    ],
    "sourceHot": 333,
    "title": "粉色圣诞节海报设计",
    "prompt": "以单一明确主体为核心创作，融合节日装饰、冬日灯光和温暖庆典气氛，高完成度商业插画质感和清晰叙事层次，强标题区、醒目层级和可传播的海报版式。构图采用主体与标题区分明，视觉焦点集中，版面节奏强；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合活动海报、唱片封面或社媒传播图。"
  },
  {
    "rank": 116,
    "sref": "1977502005",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1977502005-1-50c1b205",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1977502005-2-f790ea92",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1977502005-3-7f1628c9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1977502005-4-6b74d45b"
    ],
    "tags": [
      "动漫",
      "粉色",
      "超现实主义"
    ],
    "sourceHot": 329,
    "title": "粉色超现实主义动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 117,
    "sref": "20240727",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240727-1-f0cc50e6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240727-2-08197d16",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240727-3-6db472e0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240727-4-0732fb32"
    ],
    "tags": [
      "卡通",
      "红色",
      "可爱",
      "扁平设计"
    ],
    "sourceHot": 329,
    "title": "红色可爱卡通",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 118,
    "sref": "3344337811",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3344337811-1-c4ea8b17",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3344337811-2-3035ffc8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3344337811-3-d5f0f3f3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3344337811-4-592fd856"
    ],
    "tags": [
      "红色",
      "超现实主义",
      "摄影",
      "珠宝设计",
      "东方美学",
      "时尚"
    ],
    "sourceHot": 329,
    "title": "红色超现实主义珠宝视觉",
    "prompt": "以街头场景为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，写实摄影镜头语言、真实质感和自然景深，宝石、金属、玻璃反射与奢华高光细节，东方美学构图、留白、器物与含蓄意境。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 119,
    "sref": "448236827",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/448236827-1-bfdb5252",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/448236827-2-c1a8d852",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/448236827-3-a487b95f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/448236827-4-da74bcb2"
    ],
    "tags": [
      "漫画风格",
      "蓝色",
      "可爱"
    ],
    "sourceHot": 329,
    "title": "蓝色可爱漫画插图",
    "prompt": "以动作角色为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 120,
    "sref": "1808523739",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1808523739-1-acb1a8c7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1808523739-2-2270a5c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1808523739-3-a258511e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1808523739-4-3e88a7b2"
    ],
    "tags": [
      "油画",
      "蓝色"
    ],
    "sourceHot": 328,
    "title": "蓝色油画视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合油画笔触、厚涂层次和画布质感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 121,
    "sref": "1597832331",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1597832331-1-291e93c1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1597832331-2-8b4cf344",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1597832331-3-1ffbae20",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1597832331-4-1221b258"
    ],
    "tags": [
      "摄影",
      "黑色",
      "时尚"
    ],
    "sourceHot": 325,
    "title": "黑色时尚摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 122,
    "sref": "12062024",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/12062024-1-d106c3d0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/12062024-2-0392d140",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/12062024-3-19283d44",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/12062024-4-d6e0c8e1"
    ],
    "tags": [
      "动漫",
      "漫画风格",
      "红色",
      "黑色"
    ],
    "sourceHot": 324,
    "title": "红色动漫插图",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画分镜感、动态姿态和有力轮廓线。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出红色、黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 123,
    "sref": "1734182882",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1734182882-1-f42b3163",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1734182882-2-127f65c9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1734182882-3-84800c2e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1734182882-4-cb7e2bf2"
    ],
    "tags": [
      "卡通",
      "插图",
      "东方美学",
      "可爱"
    ],
    "sourceHot": 324,
    "title": "东方美学可爱卡通",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，东方美学构图、留白、器物与含蓄意境，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 124,
    "sref": "1137991895",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1137991895-1-bca25638",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1137991895-2-2c967083",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1137991895-3-817f641a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1137991895-4-50f974dd"
    ],
    "tags": [
      "矢量",
      "紫色",
      "扁平矢量",
      "插图",
      "扁平设计"
    ],
    "sourceHot": 323,
    "title": "紫色扁平插图",
    "prompt": "以简洁人物为核心创作，融合矢量插画线面结合、边缘干净可缩放，扁平矢量形状、锐利边界和品牌插画感，高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 125,
    "sref": "4072308312",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4072308312-1-2a461957",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4072308312-2-91b58062",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4072308312-3-515b27b5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4072308312-4-eb940485"
    ],
    "tags": [
      "涂色书"
    ],
    "sourceHot": 323,
    "title": "涂色书涂色线稿",
    "prompt": "以具有故事感的主体为核心创作，融合黑白或低色彩线稿、可涂色留白和儿童活动页感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 126,
    "sref": "876348073",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/876348073-1-8a157a90",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/876348073-2-3728e64a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/876348073-3-a6d7dfa4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/876348073-4-626f9961"
    ],
    "tags": [
      "漫画风格",
      "粉色",
      "插图",
      "海报设计"
    ],
    "sourceHot": 323,
    "title": "粉色漫画插图",
    "prompt": "以英雄姿态为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，高完成度商业插画质感和清晰叙事层次，强标题区、醒目层级和可传播的海报版式。构图采用主体与标题区分明，视觉焦点集中，版面节奏强；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 127,
    "sref": "2132321835",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2132321835-1-3da56c56",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2132321835-2-8be19f96",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2132321835-3-08581305",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2132321835-4-084ba872"
    ],
    "tags": [
      "红色",
      "复古",
      "吉卜力工作室",
      "动漫"
    ],
    "sourceHot": 322,
    "title": "红色复古动漫插图主视觉",
    "prompt": "以原创角色为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，手绘动画气息、自然场景和治愈冒险感，动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 128,
    "sref": "307417348",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307417348-1-fb72dcbd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307417348-2-85d7b34c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307417348-3-f9f78416",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307417348-4-b1c3b22c"
    ],
    "tags": [
      "动漫",
      "插图",
      "粉色"
    ],
    "sourceHot": 321,
    "title": "粉色动漫插图海报",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 129,
    "sref": "5282025",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/5282025-1-282407ea",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/5282025-2-5d418ea5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/5282025-3-278e8fcd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/5282025-4-4519538f"
    ],
    "tags": [
      "绿色",
      "漫画书",
      "插图",
      "极简主义",
      "东方美学"
    ],
    "sourceHot": 321,
    "title": "绿色极简主义漫画书视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合漫画书式叙事框架、夸张表情和戏剧动作，高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间，东方美学构图、留白、器物与含蓄意境。构图采用动态角度和分镜感，姿态有速度与冲击力；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 130,
    "sref": "3338811741",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3338811741-1-7283ad50",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3338811741-2-0f9825e3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3338811741-3-d41b9071",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3338811741-4-363531f1"
    ],
    "tags": [
      "动漫",
      "橙色",
      "卡通",
      "可爱",
      "插图"
    ],
    "sourceHot": 320,
    "title": "橙色可爱动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 131,
    "sref": "430189444",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/430189444-1-e5aa24e3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/430189444-2-9e3b8e6d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/430189444-3-311946a8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/430189444-4-592ab3e9"
    ],
    "tags": [
      "复古",
      "黑色",
      "红色",
      "摄影"
    ],
    "sourceHot": 320,
    "title": "红色复古摄影",
    "prompt": "以建筑空间为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；暖色胶片光、轻微颗粒和年代感色偏。色彩突出黑色、红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 132,
    "sref": "20240725",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240725-1-76d9aa4f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240725-2-938ffda1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240725-3-2a43d4df",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240725-4-6fc48d55"
    ],
    "tags": [
      "动漫",
      "蓝色"
    ],
    "sourceHot": 319,
    "title": "蓝色动漫插图概念",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 133,
    "sref": "2348226196",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2348226196-1-920b9b9e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2348226196-2-dd542203",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2348226196-3-ef8614e2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2348226196-4-ee3bed3d"
    ],
    "tags": [
      "紫色",
      "超现实主义",
      "时尚",
      "珠宝设计"
    ],
    "sourceHot": 319,
    "title": "紫色超现实主义珠宝视觉主视觉",
    "prompt": "以秀场瞬间为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质，宝石、金属、玻璃反射与奢华高光细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 134,
    "sref": "4089868573",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4089868573-1-72fc82be",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4089868573-2-4d1c6deb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4089868573-3-5d231d61",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4089868573-4-466ab9ff"
    ],
    "tags": [
      "蓝色"
    ],
    "sourceHot": 319,
    "title": "蓝色创意视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合清晰统一的视觉风格、完整构图和可复用审美方向。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 135,
    "sref": "1758293170",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1758293170-1-39663d79",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1758293170-2-3c44bda7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1758293170-3-eb898f6e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1758293170-4-64e40d0e"
    ],
    "tags": [
      "矢量",
      "粉色",
      "扁平设计",
      "极简主义"
    ],
    "sourceHot": 318,
    "title": "粉色极简主义扁平插图",
    "prompt": "以几何场景为核心创作，融合矢量插画线面结合、边缘干净可缩放，扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 136,
    "sref": "3847562931",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3847562931-1-86b5283f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3847562931-2-e24c5ff5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3847562931-3-908e354a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3847562931-4-6ff717ae"
    ],
    "tags": [
      "动漫",
      "蓝色",
      "卡通",
      "吉卜力工作室"
    ],
    "sourceHot": 317,
    "title": "蓝色动漫插图插画",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，手绘动画气息、自然场景和治愈冒险感。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 137,
    "sref": "905263956",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/905263956-1-d68a9aca",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/905263956-2-b2f808da",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/905263956-3-fcd1ff2f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/905263956-4-e80ea547"
    ],
    "tags": [
      "漫画风格",
      "漫画书",
      "复古"
    ],
    "sourceHot": 317,
    "title": "复古漫画插图",
    "prompt": "以分镜场景为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，漫画书式叙事框架、夸张表情和戏剧动作，复古胶片颗粒、怀旧配色和年代感构图。构图采用动态角度和分镜感，姿态有速度与冲击力；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 138,
    "sref": "1586624611",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1586624611-1-a4c51bcd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1586624611-2-20f24795",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1586624611-3-070fced5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1586624611-4-12677897"
    ],
    "tags": [
      "插图",
      "2D",
      "水墨",
      "可爱"
    ],
    "sourceHot": 314,
    "title": "可爱2D 插图",
    "prompt": "以具有故事感的主体为核心创作，融合高完成度商业插画质感和清晰叙事层次，平面 2D 造型、简洁色块和明确轮廓，水墨晕染、宣纸纹理和东方笔意，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 139,
    "sref": "587899320",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/587899320-1-3708d16d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/587899320-2-5073e95b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/587899320-3-811b6b07",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/587899320-4-7f28a194"
    ],
    "tags": [
      "摄影",
      "蓝色",
      "写实",
      "时尚"
    ],
    "sourceHot": 314,
    "title": "蓝色时尚摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 140,
    "sref": "1678761797",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1678761797-1-bfe24a96",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1678761797-2-8f23466c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1678761797-3-6e64aca5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1678761797-4-b3393fd9"
    ],
    "tags": [
      "摄影",
      "粉色",
      "黑暗幻想",
      "电影",
      "科幻"
    ],
    "sourceHot": 313,
    "title": "粉色黑暗幻想电影摄影",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，黑暗奇幻气质、神秘轮廓和史诗阴影，电影剧照般叙事构图、景深和氛围光，未来科技装置、空间尺度和冷峻想象力。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 141,
    "sref": "2841995947",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2841995947-1-58c9cf08",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2841995947-2-f3f0fa73",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2841995947-3-338e55ae",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2841995947-4-86c3901b"
    ],
    "tags": [
      "扁平设计",
      "卡通",
      "复古",
      "黄色"
    ],
    "sourceHot": 312,
    "title": "黄色复古卡通插画",
    "prompt": "以信息图主角为核心创作，融合扁平化图形、清爽留白与图标化结构，圆润卡通造型、轻松幽默的角色表情，复古胶片颗粒、怀旧配色和年代感构图。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩突出黄色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 142,
    "sref": "2078711768",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2078711768-1-3e4b7574",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2078711768-2-ca5814af",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2078711768-3-4ff12c1c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2078711768-4-153b043f"
    ],
    "tags": [
      "动漫",
      "像素",
      "插图"
    ],
    "sourceHot": 310,
    "title": "像素动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，像素艺术网格、复古游戏配色和低分辨率趣味，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 143,
    "sref": "878803659",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/878803659-1-d6604ee2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/878803659-2-de47634d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/878803659-3-d98b66d7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/878803659-4-97c015dd"
    ],
    "tags": [
      "摄影",
      "电影",
      "时尚"
    ],
    "sourceHot": 310,
    "title": "时尚电影摄影主视觉",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，电影剧照般叙事构图、景深和氛围光，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 144,
    "sref": "4050681547",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4050681547-1-313ff8e8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4050681547-2-74a2e539",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4050681547-3-adfdc7bc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4050681547-4-e4f69801"
    ],
    "tags": [
      "摄影",
      "写实",
      "电影"
    ],
    "sourceHot": 309,
    "title": "写实电影摄影主视觉",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 145,
    "sref": "454439859",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/454439859-1-8ce24070",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/454439859-2-154b09d2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/454439859-3-7df3a0cd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/454439859-4-49d7ea3e"
    ],
    "tags": [
      "摄影",
      "黑暗幻想"
    ],
    "sourceHot": 309,
    "title": "黑暗幻想摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 146,
    "sref": "3328930452",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3328930452-1-03ff1d43",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3328930452-2-a6347f12",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3328930452-3-f0d7d8b0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3328930452-4-4703b247"
    ],
    "tags": [
      "油画",
      "复古"
    ],
    "sourceHot": 308,
    "title": "复古油画视觉",
    "prompt": "以单一明确主体为核心创作，融合油画笔触、厚涂层次和画布质感，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 147,
    "sref": "2577880598",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2577880598-1-1a0f5dc4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2577880598-2-f6aa5fa2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2577880598-3-cc487c4e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2577880598-4-885a1ca7"
    ],
    "tags": [
      "动漫",
      "紫色",
      "吉卜力工作室",
      "电影"
    ],
    "sourceHot": 306,
    "title": "紫色电影动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，手绘动画气息、自然场景和治愈冒险感，电影剧照般叙事构图、景深和氛围光。构图采用角色与环境比例协调，镜头略带故事分镜感；低饱和戏剧光，边缘轮廓光增强情绪。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 148,
    "sref": "3562110095",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3562110095-1-c4113447",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3562110095-2-17ba7894",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3562110095-3-35a5279d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3562110095-4-120f3b97"
    ],
    "tags": [
      "2D",
      "卡通",
      "漫画风格"
    ],
    "sourceHot": 306,
    "title": "2D卡通漫画插图",
    "prompt": "以可爱角色为核心创作，融合平面 2D 造型、简洁色块和明确轮廓，圆润卡通造型、轻松幽默的角色表情，漫画分镜感、动态姿态和有力轮廓线。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 149,
    "sref": "774146166",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/774146166-1-3b429b08",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/774146166-2-a0332915",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/774146166-3-35ecb99e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/774146166-4-3740de89"
    ],
    "tags": [
      "2D",
      "复古",
      "插图",
      "扁平设计"
    ],
    "sourceHot": 306,
    "title": "复古2D 插图",
    "prompt": "以信息图主角为核心创作，融合平面 2D 造型、简洁色块和明确轮廓，复古胶片颗粒、怀旧配色和年代感构图，高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 150,
    "sref": "732508174",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/732508174-1-2184d775",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/732508174-2-c84e8c54",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/732508174-3-95ad7b7b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/732508174-4-89502a42"
    ],
    "tags": [
      "3D",
      "动漫"
    ],
    "sourceHot": 305,
    "title": "3D动漫插图",
    "prompt": "以活动主视觉装置为核心创作，融合柔和 3D 体块、圆角造型和干净材质，动漫角色比例、清晰线条与情绪化画面。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 151,
    "sref": "20241026",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20241026-1-051875ab",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20241026-2-4235d4ae",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20241026-3-e83f9d92",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20241026-4-1581da65"
    ],
    "tags": [
      "摄影",
      "黑色",
      "写实",
      "时尚",
      "电影"
    ],
    "sourceHot": 304,
    "title": "黑色时尚电影摄影主视觉",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，精致造型、服饰材质与杂志大片气质，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 152,
    "sref": "307538589",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307538589-1-bd40149d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307538589-2-8e4062ef",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307538589-3-8639d9aa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/307538589-4-b08cb4f7"
    ],
    "tags": [
      "超现实主义",
      "金色",
      "复古"
    ],
    "sourceHot": 304,
    "title": "金色超现实主义创意视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩突出金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 153,
    "sref": "279610627",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/279610627-1-8eb18ed9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/279610627-2-c3adf06f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/279610627-3-85d65bd8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/279610627-4-42133386"
    ],
    "tags": [
      "动漫",
      "插图",
      "复古",
      "赛博朋克"
    ],
    "sourceHot": 302,
    "title": "复古赛博朋克动漫海报",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次，复古胶片颗粒、怀旧配色和年代感构图，霓虹灯牌、未来城市和高对比科幻细节。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 154,
    "sref": "109585890",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/109585890-1-6d886dfe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/109585890-2-4fd859e3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/109585890-3-2a9b5bfd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/109585890-4-d1b8d117"
    ],
    "tags": [
      "超现实主义",
      "粉色",
      "时尚"
    ],
    "sourceHot": 301,
    "title": "粉色超现实主义创意视觉海报",
    "prompt": "以配饰特写为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 155,
    "sref": "1914793341",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1914793341-1-2b14da53",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1914793341-2-aec08153",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1914793341-3-2d3e8e26",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1914793341-4-473c9a3c"
    ],
    "tags": [
      "动漫",
      "蓝色",
      "插图",
      "时尚"
    ],
    "sourceHot": 301,
    "title": "蓝色时尚动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次，精致造型、服饰材质与杂志大片气质。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 156,
    "sref": "223025199",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/223025199-1-3ac9c474",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/223025199-2-70c40fa9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/223025199-3-661580da",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/223025199-4-e7937a71"
    ],
    "tags": [
      "圣诞节",
      "3D",
      "绿色"
    ],
    "sourceHot": 300,
    "title": "绿色圣诞节3D 视觉",
    "prompt": "以圆角产品为核心创作，融合节日装饰、冬日灯光和温暖庆典气氛，柔和 3D 体块、圆角造型和干净材质。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 157,
    "sref": "2794717703",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2794717703-1-831475a8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2794717703-2-8093c5c8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2794717703-3-1f4516fb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2794717703-4-bdd90be6"
    ],
    "tags": [
      "摄影",
      "写实",
      "珠宝设计"
    ],
    "sourceHot": 300,
    "title": "摄影写实珠宝视觉",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 158,
    "sref": "3721034756",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3721034756-1-8c1b982e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3721034756-2-cb52e62d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3721034756-3-6f6fda6c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3721034756-4-2e80c785"
    ],
    "tags": [
      "3D",
      "绿色"
    ],
    "sourceHot": 300,
    "title": "绿色3D 视觉",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 159,
    "sref": "2368174237",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2368174237-1-e77580d8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2368174237-2-03178249",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2368174237-3-6e3b2530",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2368174237-4-a9c9e580"
    ],
    "tags": [
      "动漫",
      "复古",
      "蓝色",
      "漫画书"
    ],
    "sourceHot": 299,
    "title": "蓝色复古动漫插图",
    "prompt": "以青春校园瞬间为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，漫画书式叙事框架、夸张表情和戏剧动作。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 160,
    "sref": "4139756554",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4139756554-1-b9cf5b1c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4139756554-2-b8d1ae7f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4139756554-3-7b4a5751",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4139756554-4-be4f786c"
    ],
    "tags": [
      "矢量",
      "可爱"
    ],
    "sourceHot": 299,
    "title": "可爱矢量插画",
    "prompt": "以简洁人物为核心创作，融合矢量插画线面结合、边缘干净可缩放，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 161,
    "sref": "4007892812",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4007892812-1-21e0e9f0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4007892812-2-f9c48485",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4007892812-3-9a3ef77c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4007892812-4-02b0d318"
    ],
    "tags": [
      "卡通",
      "可爱",
      "极简主义"
    ],
    "sourceHot": 298,
    "title": "极简主义可爱卡通主视觉",
    "prompt": "以小动物伙伴为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，极简构图、克制元素和充足负空间。构图采用少元素中心构图，大面积留白，层级关系清楚；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 162,
    "sref": "160004952",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/160004952-1-a448775c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/160004952-2-c6520ebf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/160004952-3-670aa435",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/160004952-4-c52bee00"
    ],
    "tags": [
      "卡通",
      "漫画风格",
      "万圣节",
      "漫画书",
      "儿童书籍"
    ],
    "sourceHot": 297,
    "title": "儿童书籍万圣节漫画插图",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，漫画分镜感、动态姿态和有力轮廓线，南瓜灯、怪趣角色和夜色节日氛围，漫画书式叙事框架、夸张表情和戏剧动作。构图采用动态角度和分镜感，姿态有速度与冲击力；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 163,
    "sref": "1975689175",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1975689175-1-d4f3544b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1975689175-2-ee09b28c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1975689175-3-cccbeb86",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1975689175-4-d43fca2e"
    ],
    "tags": [
      "超现实主义",
      "黑色",
      "黑暗幻想",
      "科幻",
      "时尚"
    ],
    "sourceHot": 297,
    "title": "黑色超现实主义创意视觉",
    "prompt": "以秀场瞬间为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，黑暗奇幻气质、神秘轮廓和史诗阴影，未来科技装置、空间尺度和冷峻想象力，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；低调光、雾气和强轮廓阴影。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 164,
    "sref": "306318349",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/306318349-1-d2190b1b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/306318349-2-88542a7f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/306318349-3-08be5a23",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/306318349-4-c445714e"
    ],
    "tags": [
      "摄影",
      "写实",
      "电影"
    ],
    "sourceHot": 297,
    "title": "写实电影摄影海报",
    "prompt": "以建筑空间为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 165,
    "sref": "3427216450",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3427216450-1-3f062414",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3427216450-2-39345a2e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3427216450-3-32205534",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3427216450-4-1adf8f96"
    ],
    "tags": [
      "动漫",
      "复古",
      "漫画书"
    ],
    "sourceHot": 297,
    "title": "复古动漫插图肖像",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，漫画书式叙事框架、夸张表情和戏剧动作。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 166,
    "sref": "3908994546",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3908994546-1-2cb81275",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3908994546-2-ba212d60",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3908994546-3-c333f0fb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3908994546-4-3e7fb2d4"
    ],
    "tags": [
      "插图",
      "扁平设计"
    ],
    "sourceHot": 296,
    "title": "扁平设计扁平插图",
    "prompt": "以网页插画场景为核心创作，融合高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 167,
    "sref": "984040792",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/984040792-1-ced0fedb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/984040792-2-a35ef1d0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/984040792-3-66570683",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/984040792-4-b10c2431"
    ],
    "tags": [
      "复古",
      "插图",
      "漫画书",
      "海报设计"
    ],
    "sourceHot": 296,
    "title": "复古漫画书视觉",
    "prompt": "以人物、产品或场景主体为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，高完成度商业插画质感和清晰叙事层次，漫画书式叙事框架、夸张表情和戏剧动作，强标题区、醒目层级和可传播的海报版式。构图采用动态角度和分镜感，姿态有速度与冲击力；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合活动海报、唱片封面或社媒传播图。"
  },
  {
    "rank": 168,
    "sref": "2080085287",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2080085287-1-9f7b51e2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2080085287-2-dd482631",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2080085287-3-19bc05fc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2080085287-4-dbd1d518"
    ],
    "tags": [
      "超现实主义",
      "赛博朋克"
    ],
    "sourceHot": 295,
    "title": "超现实主义赛博朋克创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，霓虹灯牌、未来城市和高对比科幻细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；霓虹冷暖对比，暗部带城市反射。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 169,
    "sref": "375729843",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375729843-1-d213ea95",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375729843-2-bba9705b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375729843-3-29f05f2e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/375729843-4-974ac93f"
    ],
    "tags": [
      "卡通",
      "粉色",
      "可爱",
      "插图",
      "扁平设计"
    ],
    "sourceHot": 295,
    "title": "粉色可爱卡通",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 170,
    "sref": "860741033",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/860741033-1-1954b068",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/860741033-2-2794adc9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/860741033-3-57be2bd9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/860741033-4-9b095a9c"
    ],
    "tags": [
      "动漫",
      "复古",
      "黑暗幻想"
    ],
    "sourceHot": 295,
    "title": "复古黑暗幻想动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，复古胶片颗粒、怀旧配色和年代感构图，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 171,
    "sref": "3879360804",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3879360804-1-9ff021c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3879360804-2-3d998765",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3879360804-3-13a45dac",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3879360804-4-5c759cab"
    ],
    "tags": [
      "摄影",
      "橙色",
      "时尚",
      "电影"
    ],
    "sourceHot": 294,
    "title": "橙色时尚电影摄影",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 172,
    "sref": "1625473675",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1625473675-1-9c819cf1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1625473675-2-9e5ecf9b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1625473675-3-e36a12d1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1625473675-4-92a3b2ee"
    ],
    "tags": [
      "动漫",
      "粉色"
    ],
    "sourceHot": 293,
    "title": "粉色动漫插图场景",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 173,
    "sref": "295570448",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/295570448-1-a6ea0144",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/295570448-2-5f7871d9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/295570448-3-c50d1bbd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/295570448-4-f7cfaacf"
    ],
    "tags": [
      "摄影",
      "橙色",
      "写实",
      "电影"
    ],
    "sourceHot": 293,
    "title": "橙色电影摄影",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 174,
    "sref": "3413501416",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3413501416-1-756b7446",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3413501416-2-9ba71331",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3413501416-3-c51e9da0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3413501416-4-525ad7a3"
    ],
    "tags": [
      "摄影",
      "复古",
      "油画"
    ],
    "sourceHot": 293,
    "title": "复古摄影场景",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，油画笔触、厚涂层次和画布质感。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 175,
    "sref": "3844938906",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3844938906-1-ecec7406",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3844938906-2-dc13ff75",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3844938906-3-6540bc08",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3844938906-4-16d2f879"
    ],
    "tags": [
      "超现实主义",
      "时尚"
    ],
    "sourceHot": 293,
    "title": "超现实主义时尚创意视觉",
    "prompt": "以潮流海报主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 176,
    "sref": "1773118955",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1773118955-1-1613def4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1773118955-2-307a1442",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1773118955-3-77a2e15c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1773118955-4-44975e26"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 292,
    "title": "复古电影摄影插画",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 177,
    "sref": "1894033207",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1894033207-1-e1496800",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1894033207-2-5482a827",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1894033207-3-c67d07c8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1894033207-4-a01d64c7"
    ],
    "tags": [
      "蓝色",
      "摄影",
      "写实",
      "电影",
      "时尚"
    ],
    "sourceHot": 292,
    "title": "蓝色时尚电影摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈，电影剧照般叙事构图、景深和氛围光，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 178,
    "sref": "837262",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/837262-1-37d3a8c5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/837262-2-85ef58eb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/837262-3-9d7f6d22",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/837262-4-6886b36f"
    ],
    "tags": [
      "插图",
      "卡通",
      "蓝色",
      "黄色"
    ],
    "sourceHot": 292,
    "title": "蓝色卡通插画",
    "prompt": "以可爱角色为核心创作，融合高完成度商业插画质感和清晰叙事层次，圆润卡通造型、轻松幽默的角色表情。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出蓝色、黄色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 179,
    "sref": "4141006139",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4141006139-1-8bd362cd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4141006139-2-d6ba4e88",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4141006139-3-251a4455",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4141006139-4-a5fe8b3e"
    ],
    "tags": [
      "黑暗幻想",
      "摄影"
    ],
    "sourceHot": 291,
    "title": "黑暗幻想摄影主视觉",
    "prompt": "以建筑空间为核心创作，融合黑暗奇幻气质、神秘轮廓和史诗阴影，写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；低调光、雾气和强轮廓阴影。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 180,
    "sref": "3323562529",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3323562529-img-1-170d9122",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3323562529-img-2-a10582d9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3323562529-img-3-c6166a3d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3323562529-img-4-75721f49"
    ],
    "tags": [
      "超现实主义",
      "插图",
      "矢量",
      "海报设计"
    ],
    "sourceHot": 290,
    "title": "超现实主义矢量插画",
    "prompt": "以品牌图形为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，高完成度商业插画质感和清晰叙事层次，矢量插画线面结合、边缘干净可缩放，强标题区、醒目层级和可传播的海报版式。构图采用主体与标题区分明，视觉焦点集中，版面节奏强；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 181,
    "sref": "623816769",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/623816769-1-1d719058",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/623816769-2-a4e5e385",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/623816769-3-87b51554",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/623816769-4-16783618"
    ],
    "tags": [
      "漫画风格",
      "扁平设计",
      "插图",
      "紫色"
    ],
    "sourceHot": 290,
    "title": "紫色漫画插图",
    "prompt": "以动作角色为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 182,
    "sref": "3804345086",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3804345086-1-cdad043f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3804345086-2-f8679c00",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3804345086-3-e82ec5df",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3804345086-4-c36114f9"
    ],
    "tags": [
      "摄影",
      "复古",
      "黑暗幻想"
    ],
    "sourceHot": 289,
    "title": "复古黑暗幻想摄影",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 183,
    "sref": "1308328368",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1308328368-1-b9a4324e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1308328368-2-0e15dc6e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1308328368-3-435a4019",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1308328368-4-a40c68bc"
    ],
    "tags": [
      "超现实主义",
      "珠宝设计",
      "时尚"
    ],
    "sourceHot": 287,
    "title": "超现实主义时尚珠宝视觉主视觉",
    "prompt": "以金属饰品特写为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，宝石、金属、玻璃反射与奢华高光细节，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合珠宝广告、产品海报或奢侈品视觉。"
  },
  {
    "rank": 184,
    "sref": "2584295790",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2584295790-1-1027fc95",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2584295790-2-a077d48c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2584295790-3-74602a7c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2584295790-4-34cdd532"
    ],
    "tags": [
      "插图",
      "矢量",
      "黑色"
    ],
    "sourceHot": 287,
    "title": "黑色矢量插画",
    "prompt": "以几何场景为核心创作，融合高完成度商业插画质感和清晰叙事层次，矢量插画线面结合、边缘干净可缩放。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 185,
    "sref": "2908110451",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908110451-1-2bea3cb5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908110451-2-57791595",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908110451-3-a8d597c5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2908110451-4-69350f64"
    ],
    "tags": [
      "插图",
      "东方美学"
    ],
    "sourceHot": 287,
    "title": "东方美学插图",
    "prompt": "以单一明确主体为核心创作，融合高完成度商业插画质感和清晰叙事层次，东方美学构图、留白、器物与含蓄意境。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 186,
    "sref": "2169267074",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2169267074-1-245aba16",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2169267074-2-0218d027",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2169267074-3-12056327",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2169267074-4-d546f084"
    ],
    "tags": [
      "3D",
      "超现实主义"
    ],
    "sourceHot": 286,
    "title": "超现实主义3D 视觉",
    "prompt": "以活动主视觉装置为核心创作，融合柔和 3D 体块、圆角造型和干净材质，梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 187,
    "sref": "2377761485",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2377761485-1-649baf22",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2377761485-2-eacb08fd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2377761485-3-be5d023f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2377761485-4-f81229f6"
    ],
    "tags": [
      "蓝色",
      "摄影",
      "时尚",
      "金色"
    ],
    "sourceHot": 286,
    "title": "蓝色时尚摄影主视觉",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出蓝色、金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 188,
    "sref": "2383886261",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2383886261-1-4af6fa62",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2383886261-2-f17ddcfd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2383886261-3-8000481d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2383886261-4-f20ecca1"
    ],
    "tags": [
      "可爱",
      "卡通"
    ],
    "sourceHot": 286,
    "title": "可爱卡通主视觉",
    "prompt": "以轻松生活场景为核心创作，融合柔软可爱的形体、亲和情绪和明快节奏，圆润卡通造型、轻松幽默的角色表情。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 189,
    "sref": "3356727614",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3356727614-1-b8c6b295",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3356727614-2-1f8480c1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3356727614-3-f820c376",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3356727614-4-a58ed2ae"
    ],
    "tags": [
      "动漫",
      "红色"
    ],
    "sourceHot": 286,
    "title": "红色动漫插图主视觉",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 190,
    "sref": "3611125414",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3611125414-1-13478276",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3611125414-2-7d7eedf4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3611125414-3-d8592bed",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3611125414-4-fe30338f"
    ],
    "tags": [
      "3D",
      "迪士尼",
      "Lego",
      "可爱"
    ],
    "sourceHot": 286,
    "title": "可爱3D 视觉",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质，经典童话动画般亲和角色与温暖故事感，积木玩具质感、模块化造型和明亮塑料材质，柔软可爱的形体、亲和情绪和明快节奏。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 191,
    "sref": "2229697188",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2229697188-1-81fb6110",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2229697188-2-8193f654",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2229697188-3-3a33479b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2229697188-4-cf09a0f6"
    ],
    "tags": [
      "矢量",
      "插图",
      "粉色"
    ],
    "sourceHot": 285,
    "title": "粉色矢量插画",
    "prompt": "以包装纹样为核心创作，融合矢量插画线面结合、边缘干净可缩放，高完成度商业插画质感和清晰叙事层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 192,
    "sref": "2543723537",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2543723537-1-5b220786",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2543723537-2-aedeb6bb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2543723537-3-c3fc122b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2543723537-4-53e1e410"
    ],
    "tags": [
      "粉色",
      "复古",
      "迪士尼"
    ],
    "sourceHot": 285,
    "title": "粉色复古创意视觉",
    "prompt": "以单一明确主体为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，经典童话动画般亲和角色与温暖故事感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 193,
    "sref": "3065543664",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3065543664-1-eb9e264a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3065543664-2-a5413027",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3065543664-3-73ec092f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3065543664-4-e0d3e452"
    ],
    "tags": [
      "紫色",
      "复古",
      "时尚"
    ],
    "sourceHot": 284,
    "title": "紫色复古创意视觉",
    "prompt": "以配饰特写为核心创作，融合复古胶片颗粒、怀旧配色和年代感构图，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 194,
    "sref": "3918972653",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918972653-1-4b44b42e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918972653-2-7f9dd11f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918972653-3-c6ee6a70",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3918972653-4-47cbe8ff"
    ],
    "tags": [
      "超现实主义",
      "红色",
      "赛博朋克",
      "科幻"
    ],
    "sourceHot": 284,
    "title": "红色超现实主义创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，霓虹灯牌、未来城市和高对比科幻细节，未来科技装置、空间尺度和冷峻想象力。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；霓虹冷暖对比，暗部带城市反射。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 195,
    "sref": "234156073",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/234156073-1-4b028505",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/234156073-2-7087c1a3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/234156073-3-94ebb939",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/234156073-4-e7c66295"
    ],
    "tags": [
      "蓝色",
      "超现实主义"
    ],
    "sourceHot": 283,
    "title": "蓝色超现实主义创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 196,
    "sref": "2615690222",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2615690222-1-f0aa887e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2615690222-2-4ebef6bf",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2615690222-3-8492a25b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2615690222-4-36c28c0f"
    ],
    "tags": [
      "红色",
      "动漫"
    ],
    "sourceHot": 283,
    "title": "红色动漫插图海报",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 197,
    "sref": "2870177520",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2870177520-1-93f5423f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2870177520-2-302bb6df",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2870177520-3-7aaf605e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2870177520-4-5c63e2cd"
    ],
    "tags": [
      "卡通",
      "红色",
      "可爱",
      "扁平设计",
      "极简主义"
    ],
    "sourceHot": 283,
    "title": "红色极简主义可爱卡通",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 198,
    "sref": "2872866529",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2872866529-1-9a017d91",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2872866529-2-83d5f7c5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2872866529-3-b2d82b04",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2872866529-4-10ae5902"
    ],
    "tags": [
      "黑暗幻想",
      "黑色",
      "万圣节"
    ],
    "sourceHot": 283,
    "title": "黑色黑暗幻想创意视觉",
    "prompt": "以单一明确主体为核心创作，融合黑暗奇幻气质、神秘轮廓和史诗阴影，南瓜灯、怪趣角色和夜色节日氛围。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；低调光、雾气和强轮廓阴影。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 199,
    "sref": "434953096",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/434953096-1-cca9f429",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/434953096-2-57b65027",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/434953096-3-b2dd7d70",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/434953096-4-9cef0192"
    ],
    "tags": [
      "插图",
      "可爱",
      "动漫",
      "蓝色"
    ],
    "sourceHot": 282,
    "title": "蓝色可爱动漫插图",
    "prompt": "以原创角色为核心创作，融合高完成度商业插画质感和清晰叙事层次，柔软可爱的形体、亲和情绪和明快节奏，动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；柔和漫反射光，整体明亮亲和。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 200,
    "sref": "2440014674",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2440014674-img-1-702075fe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2440014674-img-2-4b5387fd",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2440014674-img-3-5e94733d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2440014674-img-4-2668aeb8"
    ],
    "tags": [
      "摄影",
      "电影"
    ],
    "sourceHot": 280,
    "title": "电影摄影",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 201,
    "sref": "1809520460",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809520460-1-88d1c733",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809520460-2-6a374c2d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809520460-3-8a5c8a12",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1809520460-4-8a217efb"
    ],
    "tags": [
      "黑色",
      "金色",
      "摄影",
      "时尚"
    ],
    "sourceHot": 278,
    "title": "黑色时尚摄影主视觉",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出黑色、金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 202,
    "sref": "614373565",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/614373565-1-7938f0fc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/614373565-2-df3419f2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/614373565-3-0eb0a7af",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/614373565-4-c507c66d"
    ],
    "tags": [
      "摄影"
    ],
    "sourceHot": 278,
    "title": "摄影肖像",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 203,
    "sref": "1589372993",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1589372993-1-6ef5bdca",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1589372993-2-811dd5a8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1589372993-3-5daf76f2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1589372993-4-08acc8ad"
    ],
    "tags": [
      "2D",
      "复古",
      "可爱",
      "插图"
    ],
    "sourceHot": 277,
    "title": "复古可爱2D 插图",
    "prompt": "以可替换的视觉主角为核心创作，融合平面 2D 造型、简洁色块和明确轮廓，复古胶片颗粒、怀旧配色和年代感构图，柔软可爱的形体、亲和情绪和明快节奏，高完成度商业插画质感和清晰叙事层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 204,
    "sref": "2411695838",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2411695838-1-d8ecddf6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2411695838-2-a428f42a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2411695838-3-da6589b6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2411695838-4-f5884d1a"
    ],
    "tags": [
      "卡通",
      "漫画风格",
      "儿童书籍"
    ],
    "sourceHot": 276,
    "title": "儿童书籍漫画插图",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，漫画分镜感、动态姿态和有力轮廓线，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 205,
    "sref": "3890862722",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3890862722-1-9dcd0f54",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3890862722-2-6f260200",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3890862722-3-8087b053",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3890862722-4-37d1ea5d"
    ],
    "tags": [
      "可爱",
      "卡通",
      "粉色",
      "动漫"
    ],
    "sourceHot": 276,
    "title": "粉色可爱动漫插图主视觉",
    "prompt": "以轻松生活场景为核心创作，融合柔软可爱的形体、亲和情绪和明快节奏，圆润卡通造型、轻松幽默的角色表情，动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；柔和漫反射光，整体明亮亲和。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 206,
    "sref": "16809792746",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/16809792746-1-c3b9abf8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/16809792746-2-9b02c54f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/16809792746-3-32cf5585",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/16809792746-4-493698a1"
    ],
    "tags": [
      "漫画风格",
      "动漫",
      "黑色",
      "漫画书",
      "复古"
    ],
    "sourceHot": 275,
    "title": "黑色复古动漫插图",
    "prompt": "以夸张表情特写为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，动漫角色比例、清晰线条与情绪化画面，漫画书式叙事框架、夸张表情和戏剧动作，复古胶片颗粒、怀旧配色和年代感构图。构图采用角色与环境比例协调，镜头略带故事分镜感；暖色胶片光、轻微颗粒和年代感色偏。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 207,
    "sref": "621218381",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/621218381-1-cf950206",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/621218381-2-4e837bc7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/621218381-3-c53abe02",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/621218381-4-91fa8e00"
    ],
    "tags": [
      "动漫",
      "黑暗幻想",
      "黑色",
      "复古"
    ],
    "sourceHot": 275,
    "title": "黑色复古动漫插图主视觉",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，黑暗奇幻气质、神秘轮廓和史诗阴影，复古胶片颗粒、怀旧配色和年代感构图。构图采用角色与环境比例协调，镜头略带故事分镜感；低调光、雾气和强轮廓阴影。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 208,
    "sref": "2382250703",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2382250703-1-d9959caa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2382250703-2-e3b7479a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2382250703-3-6a61dc48",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2382250703-4-12222ba5"
    ],
    "tags": [
      "摄影",
      "金色",
      "珠宝设计"
    ],
    "sourceHot": 274,
    "title": "金色珠宝视觉",
    "prompt": "以街头场景为核心创作，融合写实摄影镜头语言、真实质感和自然景深，宝石、金属、玻璃反射与奢华高光细节。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 209,
    "sref": "3303355602",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3303355602-1-609a0a70",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3303355602-2-e18cf2ca",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3303355602-3-ec334afa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3303355602-4-dd5546ad"
    ],
    "tags": [
      "红色",
      "插图",
      "复古"
    ],
    "sourceHot": 273,
    "title": "红色复古插图",
    "prompt": "以单一明确主体为核心创作，融合高完成度商业插画质感和清晰叙事层次，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 210,
    "sref": "3692373692",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3692373692-1-ea32393a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3692373692-2-d2f5a480",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3692373692-3-53592ded",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3692373692-4-d5fd0024"
    ],
    "tags": [
      "超现实主义",
      "粉色",
      "时尚"
    ],
    "sourceHot": 273,
    "title": "粉色超现实主义创意视觉场景",
    "prompt": "以人物造型为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，精致造型、服饰材质与杂志大片气质。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌广告、杂志封面或潮流主视觉。"
  },
  {
    "rank": 211,
    "sref": "4154972393",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4154972393-1-5b00d488",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4154972393-2-043eebf1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4154972393-3-1489e2f4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4154972393-4-261bc7bb"
    ],
    "tags": [
      "超现实主义",
      "科幻",
      "摄影"
    ],
    "sourceHot": 272,
    "title": "超现实主义科幻摄影",
    "prompt": "以街头场景为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，未来科技装置、空间尺度和冷峻想象力，写实摄影镜头语言、真实质感和自然景深。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 212,
    "sref": "3100000005",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3100000005-1-7a760f67",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3100000005-2-ef8455fc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3100000005-3-7447cf4d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3100000005-4-ae4be9b2"
    ],
    "tags": [
      "超现实主义",
      "3D",
      "渐变",
      "粉色"
    ],
    "sourceHot": 271,
    "title": "粉色超现实主义3D 视觉",
    "prompt": "以活动主视觉装置为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，柔和 3D 体块、圆角造型和干净材质，柔和渐变过渡、通透色带和现代视觉层次。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 213,
    "sref": "3198759719",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3198759719-1-0210ce77",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3198759719-2-e3158f88",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3198759719-3-b7bae0f7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3198759719-4-31ccd394"
    ],
    "tags": [
      "矢量",
      "绿色",
      "扁平设计",
      "插图",
      "极简主义"
    ],
    "sourceHot": 271,
    "title": "绿色极简主义扁平插图",
    "prompt": "以几何场景为核心创作，融合矢量插画线面结合、边缘干净可缩放，扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 214,
    "sref": "4195083820",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4195083820-1-970b88b0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4195083820-2-71227649",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4195083820-3-adb9e3f6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4195083820-4-40b91a92"
    ],
    "tags": [
      "动漫",
      "漫画书",
      "2D",
      "插图"
    ],
    "sourceHot": 271,
    "title": "漫画书动漫插图",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画书式叙事框架、夸张表情和戏剧动作，平面 2D 造型、简洁色块和明确轮廓，高完成度商业插画质感和清晰叙事层次。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 215,
    "sref": "2694309708",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2694309708-1-dd89ead8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2694309708-2-dd3acd64",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2694309708-3-9433fdee",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2694309708-4-7f95ea65"
    ],
    "tags": [
      "漫画书",
      "插图",
      "漫画风格",
      "可爱"
    ],
    "sourceHot": 270,
    "title": "可爱漫画插图主视觉",
    "prompt": "以动作角色为核心创作，融合漫画书式叙事框架、夸张表情和戏剧动作，高完成度商业插画质感和清晰叙事层次，漫画分镜感、动态姿态和有力轮廓线，柔软可爱的形体、亲和情绪和明快节奏。构图采用动态角度和分镜感，姿态有速度与冲击力；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 216,
    "sref": "3577878952",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3577878952-1-c29e3432",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3577878952-2-aa8f5493",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3577878952-3-cc177d81",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3577878952-4-93155ab1"
    ],
    "tags": [
      "紫色",
      "动漫",
      "蓝色"
    ],
    "sourceHot": 270,
    "title": "蓝色动漫插图特写",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出紫色、蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 217,
    "sref": "450960980",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/450960980-1-8d058adc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/450960980-2-5cfd3788",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/450960980-3-cb1f73ca",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/450960980-4-3cd68f56"
    ],
    "tags": [
      "3D",
      "蓝色",
      "超现实主义"
    ],
    "sourceHot": 270,
    "title": "蓝色超现实主义3D 视觉主视觉",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质，梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 218,
    "sref": "95777124",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/95777124-1-f2d2045e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/95777124-2-8a2e177e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/95777124-3-16c5c5bc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/95777124-4-2d6b47cb"
    ],
    "tags": [
      "超现实主义",
      "黑暗幻想"
    ],
    "sourceHot": 270,
    "title": "超现实主义黑暗幻想创意视觉",
    "prompt": "以单一明确主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；低调光、雾气和强轮廓阴影。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 219,
    "sref": "2566052208",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2566052208-1-98687698",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2566052208-2-89c11848",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2566052208-3-9217f4b6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2566052208-4-176d946a"
    ],
    "tags": [
      "动漫",
      "卡通",
      "橙色",
      "可爱"
    ],
    "sourceHot": 269,
    "title": "橙色可爱动漫插图主视觉",
    "prompt": "以城市街景中的角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 220,
    "sref": "3892216091",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3892216091-1-899281c0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3892216091-2-1b19d63a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3892216091-3-39c03700",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3892216091-4-141e7707"
    ],
    "tags": [
      "漫画风格",
      "蓝色",
      "漫画书",
      "插图",
      "黑暗幻想"
    ],
    "sourceHot": 269,
    "title": "蓝色黑暗幻想漫画插图",
    "prompt": "以分镜场景为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，漫画书式叙事框架、夸张表情和戏剧动作，高完成度商业插画质感和清晰叙事层次，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用动态角度和分镜感，姿态有速度与冲击力；低调光、雾气和强轮廓阴影。色彩突出蓝色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 221,
    "sref": "2443928193",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2443928193-1-e417492c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2443928193-2-5fc129ec",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2443928193-3-6c3d4c6e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2443928193-4-d5db48ad"
    ],
    "tags": [
      "漫画风格",
      "漫画书"
    ],
    "sourceHot": 268,
    "title": "漫画风格漫画书漫画插图",
    "prompt": "以分镜场景为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，漫画书式叙事框架、夸张表情和戏剧动作。构图采用动态角度和分镜感，姿态有速度与冲击力；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 222,
    "sref": "40069",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/40069-1-e9efc4ab",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/40069-2-d90be9c3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/40069-3-a2211d88",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/40069-4-a46d2886"
    ],
    "tags": [
      "涂色书",
      "可爱",
      "卡通",
      "儿童书籍"
    ],
    "sourceHot": 268,
    "title": "儿童书籍可爱卡通",
    "prompt": "以轻松生活场景为核心创作，融合黑白或低色彩线稿、可涂色留白和儿童活动页感，柔软可爱的形体、亲和情绪和明快节奏，圆润卡通造型、轻松幽默的角色表情，儿童绘本氛围、柔和故事性与安全温暖画面。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 223,
    "sref": "4101149660",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4101149660-1-29c95b6f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4101149660-2-28ded779",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4101149660-3-0fa50d5e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/4101149660-4-30574ba2"
    ],
    "tags": [
      "卡通",
      "漫画风格",
      "复古"
    ],
    "sourceHot": 268,
    "title": "复古漫画插图主视觉",
    "prompt": "以可爱角色为核心创作，融合圆润卡通造型、轻松幽默的角色表情，漫画分镜感、动态姿态和有力轮廓线，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 224,
    "sref": "413299073",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/413299073-1-226e4ae4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/413299073-2-055ae9ce",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/413299073-3-6f5eef4d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/413299073-4-b5020851"
    ],
    "tags": [
      "漫画风格",
      "涂色书",
      "线条艺术"
    ],
    "sourceHot": 268,
    "title": "漫画风格涂色书漫画插图海报",
    "prompt": "以英雄姿态为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，黑白或低色彩线稿、可涂色留白和儿童活动页感，线条艺术结构、明确轮廓和手绘笔触。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 225,
    "sref": "704415919",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/704415919-1-25872171",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/704415919-2-550e880a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/704415919-3-72e9f346",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/704415919-4-abb0b343"
    ],
    "tags": [
      "3D"
    ],
    "sourceHot": 268,
    "title": "3D 视觉",
    "prompt": "以玩具角色为核心创作，融合柔和 3D 体块、圆角造型和干净材质。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 226,
    "sref": "1160070783",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1160070783-1-40993d3d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1160070783-2-a8dd0c26",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1160070783-3-45b8f9d8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1160070783-4-bd17ba5c"
    ],
    "tags": [
      "漫画书",
      "黑色",
      "插图",
      "扁平设计"
    ],
    "sourceHot": 267,
    "title": "黑色漫画书视觉",
    "prompt": "以网页插画场景为核心创作，融合漫画书式叙事框架、夸张表情和戏剧动作，高完成度商业插画质感和清晰叙事层次，扁平化图形、清爽留白与图标化结构。构图采用动态角度和分镜感，姿态有速度与冲击力；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 227,
    "sref": "895610958",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/895610958-1-fdc74d07",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/895610958-2-b849fb0e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/895610958-3-2efd45aa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/895610958-4-449a7740"
    ],
    "tags": [
      "扁平设计",
      "绿色",
      "极简主义"
    ],
    "sourceHot": 267,
    "title": "绿色极简主义扁平插图主视觉",
    "prompt": "以活动 banner 元素为核心创作，融合扁平化图形、清爽留白与图标化结构，极简构图、克制元素和充足负空间。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 228,
    "sref": "1539410027",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1539410027-1-fa609e48",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1539410027-2-ec51479b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1539410027-3-c56abf28",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1539410027-4-d615bf1b"
    ],
    "tags": [
      "3D",
      "超现实主义",
      "橙色",
      "卡通",
      "可爱"
    ],
    "sourceHot": 266,
    "title": "橙色超现实主义可爱卡通",
    "prompt": "以玩具角色为核心创作，融合柔和 3D 体块、圆角造型和干净材质，梦境般超现实布景、错位物体关系和强视觉记忆点，圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；均匀柔光，色块干净无脏边。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 229,
    "sref": "1791691478",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1791691478-1-ec75ea9f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1791691478-2-8d3ba31b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1791691478-3-08679c30",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1791691478-4-f87d2c50"
    ],
    "tags": [
      "漫画风格",
      "蓝色",
      "粉色",
      "紫色",
      "复古",
      "漫画书"
    ],
    "sourceHot": 266,
    "title": "粉色复古漫画插图",
    "prompt": "以分镜场景为核心创作，融合漫画分镜感、动态姿态和有力轮廓线，复古胶片颗粒、怀旧配色和年代感构图，漫画书式叙事框架、夸张表情和戏剧动作。构图采用动态角度和分镜感，姿态有速度与冲击力；暖色胶片光、轻微颗粒和年代感色偏。色彩突出蓝色、粉色、紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 230,
    "sref": "1839784916",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1839784916-1-7eee04fa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1839784916-2-96a67b79",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1839784916-3-750a2fde",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1839784916-4-aa9f97a9"
    ],
    "tags": [
      "3D",
      "蓝色",
      "粉色",
      "渐变"
    ],
    "sourceHot": 266,
    "title": "粉色渐变3D 视觉",
    "prompt": "以抽象图标为核心创作，融合柔和 3D 体块、圆角造型和干净材质，柔和渐变过渡、通透色带和现代视觉层次。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色、粉色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 231,
    "sref": "1911829838",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1911829838-1-8ba9aacb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1911829838-2-7eae9b17",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1911829838-3-069aed3e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1911829838-4-c7d4ba50"
    ],
    "tags": [
      "摄影",
      "东方美学"
    ],
    "sourceHot": 266,
    "title": "东方美学摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，东方美学构图、留白、器物与含蓄意境。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 232,
    "sref": "2077236407",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2077236407-1-4c31a627",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2077236407-2-a8b0d73e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2077236407-3-8574e358",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2077236407-4-98fa5439"
    ],
    "tags": [
      "蓝色",
      "黑色",
      "东方美学",
      "金色"
    ],
    "sourceHot": 266,
    "title": "蓝色东方美学创意视觉",
    "prompt": "以具有故事感的主体为核心创作，融合东方美学构图、留白、器物与含蓄意境。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色、黑色、金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 233,
    "sref": "251",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/251-1-a9f4bbb8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/251-2-bdfe5711",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/251-3-02becd7f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/251-4-2648d2d0"
    ],
    "tags": [
      "动漫",
      "紫色",
      "插图",
      "时尚",
      "科幻"
    ],
    "sourceHot": 266,
    "title": "紫色时尚动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，高完成度商业插画质感和清晰叙事层次，精致造型、服饰材质与杂志大片气质，未来科技装置、空间尺度和冷峻想象力。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 234,
    "sref": "24000022",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/24000022-1-a132a777",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/24000022-2-dcb6cbfc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/24000022-3-7293f4bb",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/24000022-4-4f45fa72"
    ],
    "tags": [
      "迪士尼",
      "插图",
      "黑暗幻想"
    ],
    "sourceHot": 265,
    "title": "黑暗幻想插图",
    "prompt": "以可替换的视觉主角为核心创作，融合经典童话动画般亲和角色与温暖故事感，高完成度商业插画质感和清晰叙事层次，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；低调光、雾气和强轮廓阴影。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 235,
    "sref": "378114956",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/378114956-1-30e6055f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/378114956-2-e7500431",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/378114956-3-b32b80a0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/378114956-4-746e6354"
    ],
    "tags": [
      "水墨",
      "蓝色",
      "黑色",
      "浮世绘"
    ],
    "sourceHot": 265,
    "title": "蓝色水墨插画",
    "prompt": "以具有故事感的主体为核心创作，融合水墨晕染、宣纸纹理和东方笔意，浮世绘版画构图、平涂色块和装饰性波纹。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出蓝色、黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 236,
    "sref": "20240628",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240628-1-7f690b7a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240628-2-d66d3a4e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240628-3-89b6dfb7",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240628-4-09210b7f"
    ],
    "tags": [
      "摄影",
      "复古",
      "电影"
    ],
    "sourceHot": 264,
    "title": "复古电影摄影特写",
    "prompt": "以生活方式画面为核心创作，融合写实摄影镜头语言、真实质感和自然景深，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 237,
    "sref": "3112185688",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3112185688-1-634fddca",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3112185688-2-60e6da91",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3112185688-3-a1ebe681",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3112185688-4-e6a859bb"
    ],
    "tags": [
      "绿色",
      "插图",
      "水墨",
      "漫画风格"
    ],
    "sourceHot": 264,
    "title": "绿色漫画插图",
    "prompt": "以夸张表情特写为核心创作，融合高完成度商业插画质感和清晰叙事层次，水墨晕染、宣纸纹理和东方笔意，漫画分镜感、动态姿态和有力轮廓线。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合漫画封面、角色设定或分镜概念图。"
  },
  {
    "rank": 238,
    "sref": "620750898",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/620750898-1-85525504",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/620750898-2-bc182fe6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/620750898-3-1b8f2ec0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/620750898-4-8eaccfac"
    ],
    "tags": [
      "动漫",
      "漫画风格",
      "漫画书",
      "可爱"
    ],
    "sourceHot": 264,
    "title": "可爱动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，漫画分镜感、动态姿态和有力轮廓线，漫画书式叙事框架、夸张表情和戏剧动作，柔软可爱的形体、亲和情绪和明快节奏。构图采用角色与环境比例协调，镜头略带故事分镜感；柔和漫反射光，整体明亮亲和。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 239,
    "sref": "1347226928",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1347226928-1-ea0f9819",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1347226928-2-38aa7a64",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1347226928-3-84bb6580",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1347226928-4-a655ca9d"
    ],
    "tags": [
      "粉色",
      "渐变",
      "可爱"
    ],
    "sourceHot": 263,
    "title": "粉色可爱创意视觉",
    "prompt": "以可替换的视觉主角为核心创作，融合柔和渐变过渡、通透色带和现代视觉层次，柔软可爱的形体、亲和情绪和明快节奏。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；柔和漫反射光，整体明亮亲和。色彩突出粉色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 240,
    "sref": "512986670",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/512986670-1-43f6d1f6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/512986670-2-acbca36e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/512986670-3-7b7798f9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/512986670-4-07d8c329"
    ],
    "tags": [
      "摄影",
      "赛博朋克",
      "矢量",
      "复古"
    ],
    "sourceHot": 263,
    "title": "复古赛博朋克摄影",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，霓虹灯牌、未来城市和高对比科幻细节，矢量插画线面结合、边缘干净可缩放，复古胶片颗粒、怀旧配色和年代感构图。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 241,
    "sref": "1498680336",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1498680336-1-d357c554",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1498680336-2-03d19cd3",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1498680336-3-95e828d8",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1498680336-4-d1a2498a"
    ],
    "tags": [
      "3D",
      "赛博朋克"
    ],
    "sourceHot": 262,
    "title": "赛博朋克3D 视觉",
    "prompt": "以悬浮物件为核心创作，融合柔和 3D 体块、圆角造型和干净材质，霓虹灯牌、未来城市和高对比科幻细节。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；霓虹冷暖对比，暗部带城市反射。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 242,
    "sref": "2225666392",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/underwoodxie_51995_a_dog_--style_raw_--sref_2225666392_3a54d57a-d0a1-4ecc-b6d8-40f994455364.png",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/underwoodxie_51995_a_girl_--style_raw_--sref_2225666392_ab90b263-7373-40e3-826b-a7fb7325c322.png",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/underwoodxie_51995_a_man_--style_raw_--sref_2225666392_8cb7c88f-14f0-4cd6-aafa-e270ab2f1011.png",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/underwoodxie_51995_environment_--style_raw_--sref_2225666392_de7bd7e5-aa05-4cc9-9186-d817be049d29_0%20(1).png"
    ],
    "tags": [
      "扁平设计",
      "绿色",
      "橙色",
      "插图"
    ],
    "sourceHot": 262,
    "title": "绿色扁平插图",
    "prompt": "以活动 banner 元素为核心创作，融合扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出绿色、橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  },
  {
    "rank": 243,
    "sref": "2437079609",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2437079609-1-1538c3cc",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2437079609-2-349cb88a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2437079609-3-62ef4a0b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2437079609-4-7e072cd9"
    ],
    "tags": [
      "卡通",
      "3D",
      "可爱"
    ],
    "sourceHot": 262,
    "title": "3D可爱卡通",
    "prompt": "以轻松生活场景为核心创作，融合圆润卡通造型、轻松幽默的角色表情，柔和 3D 体块、圆角造型和干净材质，柔软可爱的形体、亲和情绪和明快节奏。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 244,
    "sref": "1685452084",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1685452084-1-1eacc315",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1685452084-2-b8577af0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1685452084-3-d71be204",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1685452084-4-a97b8c21"
    ],
    "tags": [
      "插图",
      "矢量",
      "油画"
    ],
    "sourceHot": 258,
    "title": "插图矢量插画",
    "prompt": "以几何场景为核心创作，融合高完成度商业插画质感和清晰叙事层次，矢量插画线面结合、边缘干净可缩放，油画笔触、厚涂层次和画布质感。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合品牌系统、图标、海报或包装辅助图形。"
  },
  {
    "rank": 245,
    "sref": "20240730",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240730-1-aacf9b78",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240730-2-36348bac",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240730-3-4194282a",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/20240730-4-5fd0ce3f"
    ],
    "tags": [
      "超现实主义",
      "金色",
      "珠宝设计"
    ],
    "sourceHot": 258,
    "title": "金色超现实主义珠宝视觉主视觉",
    "prompt": "以金属饰品特写为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点，宝石、金属、玻璃反射与奢华高光细节。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；高光、反射和折射丰富，暗部保持通透。色彩突出金色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合珠宝广告、产品海报或奢侈品视觉。"
  },
  {
    "rank": 246,
    "sref": "3299590414",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3299590414-1-141bca86",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3299590414-2-15ec6dbe",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3299590414-3-bb5a6960",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3299590414-4-c2f8499f"
    ],
    "tags": [
      "绿色",
      "摄影",
      "写实"
    ],
    "sourceHot": 256,
    "title": "绿色摄影",
    "prompt": "以产品静物为核心创作，融合写实摄影镜头语言、真实质感和自然景深，高可信写实细节与真实材质反馈。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 247,
    "sref": "3373429262",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3373429262-1-1cfb49fa",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3373429262-2-c271123b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3373429262-3-f2335a28",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3373429262-4-b694de7f"
    ],
    "tags": [
      "卡通",
      "插图",
      "绿色",
      "渐变"
    ],
    "sourceHot": 256,
    "title": "绿色渐变卡通插画",
    "prompt": "以小动物伙伴为核心创作，融合圆润卡通造型、轻松幽默的角色表情，高完成度商业插画质感和清晰叙事层次，柔和渐变过渡、通透色带和现代视觉层次。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；均匀柔光，色块干净无脏边。色彩突出绿色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 248,
    "sref": "980853",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/980853-1-62ed7622",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/980853-2-f798c918",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/980853-3-d8d8bc29",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/980853-4-d3b8a277"
    ],
    "tags": [
      "卡通",
      "黑暗幻想",
      "复古",
      "电影",
      "动漫"
    ],
    "sourceHot": 256,
    "title": "复古电影动漫插图",
    "prompt": "以小动物伙伴为核心创作，融合圆润卡通造型、轻松幽默的角色表情，黑暗奇幻气质、神秘轮廓和史诗阴影，复古胶片颗粒、怀旧配色和年代感构图，电影剧照般叙事构图、景深和氛围光。构图采用横向电影画幅，前中后景有层次，情绪叙事明确；均匀柔光，色块干净无脏边。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 249,
    "sref": "1473686403",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1473686403-1-d1d59732",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1473686403-2-7d6be92c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1473686403-3-509df64c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1473686403-4-87bc918d"
    ],
    "tags": [
      "3D",
      "橙色",
      "可爱"
    ],
    "sourceHot": 255,
    "title": "橙色可爱3D 视觉",
    "prompt": "以玩具角色为核心创作，融合柔和 3D 体块、圆角造型和干净材质，柔软可爱的形体、亲和情绪和明快节奏。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；柔和漫反射光，整体明亮亲和。色彩突出橙色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 250,
    "sref": "2204673629",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2204673629-1-49940142",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2204673629-2-1e2cbc11",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2204673629-3-9af53d66",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/2204673629-4-f007c3d9"
    ],
    "tags": [
      "3D",
      "粉色",
      "极简主义"
    ],
    "sourceHot": 255,
    "title": "粉色极简主义3D 视觉主视觉",
    "prompt": "以抽象图标为核心创作，融合柔和 3D 体块、圆角造型和干净材质，极简构图、克制元素和充足负空间。构图采用干净棚拍式构图，主体悬浮或置于简洁台面；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合图标、活动主视觉、产品概念或社交媒体封面。"
  },
  {
    "rank": 251,
    "sref": "1210285788",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1210285788-1-d6b2809e",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1210285788-2-14c46c34",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1210285788-3-0d5ba0a4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1210285788-4-31ed1d8b"
    ],
    "tags": [
      "卡通",
      "绿色",
      "扁平设计"
    ],
    "sourceHot": 254,
    "title": "绿色卡通插画",
    "prompt": "以趣味物件为核心创作，融合圆润卡通造型、轻松幽默的角色表情，扁平化图形、清爽留白与图标化结构。构图采用几何化布局，块面均衡，信息层级清晰；均匀柔光，色块干净无脏边。色彩突出绿色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合贴纸、头像、儿童向视觉或轻量运营图。"
  },
  {
    "rank": 252,
    "sref": "475547172",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/475547172-1-e92dd89d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/475547172-2-153deda2",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/475547172-3-a0df30c0",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/475547172-4-05886b3d"
    ],
    "tags": [
      "动漫",
      "紫色",
      "卡通",
      "可爱",
      "渐变"
    ],
    "sourceHot": 254,
    "title": "紫色可爱动漫插图",
    "prompt": "以奇幻伙伴组合为核心创作，融合动漫角色比例、清晰线条与情绪化画面，圆润卡通造型、轻松幽默的角色表情，柔软可爱的形体、亲和情绪和明快节奏，柔和渐变过渡、通透色带和现代视觉层次。构图采用角色与环境比例协调，镜头略带故事分镜感；均匀柔光，色块干净无脏边。色彩突出紫色主色调与渐变过渡，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 253,
    "sref": "2732593321",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 2732593321-1-1c312f67",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 2732593321-2-67c1ede4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 2732593321-3-b28cfff9",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/--sref 2732593321-4-f33f67a2"
    ],
    "tags": [
      "动漫",
      "红色",
      "黑色",
      "黑暗幻想"
    ],
    "sourceHot": 253,
    "title": "红色黑暗幻想动漫插图",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用角色与环境比例协调，镜头略带故事分镜感；低调光、雾气和强轮廓阴影。色彩突出红色、黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 254,
    "sref": "644351226",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/644351226-1-3ab10298",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/644351226-2-2f2b058f",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/644351226-3-3715eb39",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/644351226-4-5da0e498"
    ],
    "tags": [
      "插图",
      "极简主义"
    ],
    "sourceHot": 253,
    "title": "极简主义插图",
    "prompt": "以单一明确主体为核心创作，融合高完成度商业插画质感和清晰叙事层次，极简构图、克制元素和充足负空间。构图采用少元素中心构图，大面积留白，层级关系清楚；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合封面插图、活动视觉或社交媒体配图。"
  },
  {
    "rank": 255,
    "sref": "1171558590",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1171558590-1-413a25da",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1171558590-2-e539db7c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1171558590-3-ca12e7f4",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1171558590-4-fd0710a2"
    ],
    "tags": [
      "动漫",
      "红色"
    ],
    "sourceHot": 252,
    "title": "红色动漫插图场景",
    "prompt": "以冒险场景为核心创作，融合动漫角色比例、清晰线条与情绪化画面。构图采用角色与环境比例协调，镜头略带故事分镜感；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出红色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 256,
    "sref": "3349231497",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3349231497-1-a8c017c5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3349231497-2-cf1433a1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3349231497-3-258db493",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/3349231497-4-46d71b6c"
    ],
    "tags": [
      "摄影",
      "紫色",
      "科幻",
      "时尚"
    ],
    "sourceHot": 252,
    "title": "紫色科幻时尚摄影",
    "prompt": "以人物肖像为核心创作，融合写实摄影镜头语言、真实质感和自然景深，未来科技装置、空间尺度和冷峻想象力，精致造型、服饰材质与杂志大片气质。构图采用三分法或中心构图，背景有轻微景深，主体边缘清晰；自然光或棚拍柔光，保留真实阴影和材质高光。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合人物、产品或生活方式大片。"
  },
  {
    "rank": 257,
    "sref": "584258796",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/584258796-1-478f792c",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/584258796-2-581deff6",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/584258796-3-df723b0d",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/584258796-4-a582c9e5"
    ],
    "tags": [
      "超现实主义",
      "金色",
      "黑色"
    ],
    "sourceHot": 252,
    "title": "黑色超现实主义创意视觉主视觉",
    "prompt": "以单一明确主体为核心创作，融合梦境般超现实布景、错位物体关系和强视觉记忆点。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出金色、黑色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 258,
    "sref": "1326912768",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1326912768-1-960163e5",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1326912768-2-625cb09b",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1326912768-3-8ffda335",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1326912768-4-cd474575"
    ],
    "tags": [
      "动漫",
      "紫色",
      "吉卜力工作室",
      "漫画书",
      "黑暗幻想"
    ],
    "sourceHot": 251,
    "title": "紫色黑暗幻想动漫插图",
    "prompt": "以原创角色为核心创作，融合动漫角色比例、清晰线条与情绪化画面，手绘动画气息、自然场景和治愈冒险感，漫画书式叙事框架、夸张表情和戏剧动作，黑暗奇幻气质、神秘轮廓和史诗阴影。构图采用角色与环境比例协调，镜头略带故事分镜感；低调光、雾气和强轮廓阴影。色彩突出紫色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合角色海报、头像或故事封面。"
  },
  {
    "rank": 259,
    "sref": "1855712653",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1855712653-1-20174a03",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1855712653-2-e50467e1",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1855712653-3-5429bdac",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/1855712653-4-7b04eca2"
    ],
    "tags": [
      "油画",
      "复古"
    ],
    "sourceHot": 251,
    "title": "复古油画视觉主视觉",
    "prompt": "以单一明确主体为核心创作，融合油画笔触、厚涂层次和画布质感，复古胶片颗粒、怀旧配色和年代感构图。构图采用主体明确，前后景层次清楚，画面留白和细节密度平衡；暖色胶片光、轻微颗粒和年代感色偏。色彩保持统一且有层次，材质表达干净。细节精致但不过度拥挤，主体识别度高，适合海报、封面、头像或产品概念图。"
  },
  {
    "rank": 260,
    "sref": "432110",
    "previewImages": [
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/432110-1-c2534e60",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/432110-2-9da4c993",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/432110-3-fcf48014",
      "https://promptsref.com/cdn-cgi/image/format=webp,width=192,quality=80,fit=cover/https://explore.promptsref.com/432110-4-b9ec5287"
    ],
    "tags": [
      "扁平设计",
      "粉色",
      "插图"
    ],
    "sourceHot": 251,
    "title": "粉色扁平插图",
    "prompt": "以活动 banner 元素为核心创作，融合扁平化图形、清爽留白与图标化结构，高完成度商业插画质感和清晰叙事层次。构图采用几何化布局，块面均衡，信息层级清晰；光线柔和但有方向，阴影干净，重点区域有高级高光。色彩突出粉色主色调，整体调性统一。细节精致但不过度拥挤，主体识别度高，适合品牌插画、信息图、网页空状态或活动 banner。"
  }
];
