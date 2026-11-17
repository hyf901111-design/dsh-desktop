import { marketingExamples } from './marketing-templates'

type Localized = readonly [string, string]

export type GalleryExample = {
  id: string
  title: Localized
  material: Localized
  format: string
  scenes?: Localized
  prompt?: Localized
  subtitle: Localized
}

const originalExamples: GalleryExample[] = [
  {
    id: "steady-horizon", title: ["山海长跑", "The long view"], material: ["品牌海报", "Brand poster"], format: "3:4",
    scenes: ["品牌主视觉 · 年度主题", "Brand campaign · Annual theme"], subtitle: ["每一步，都算数", "Every step counts"],
    prompt: [
      "长途公路贴着青灰山海缓缓转弯，单一小跑者在画面下半部，清晨薄雾，天空上方四分之一留空；从较高处远观，深蓝、灰蓝、微暖日光，高级纪实风景摄影。 无文字、无标识。",
      "An elevated view of an empty coastal road curving past blue-grey hills, with one small runner in the lower half. Pale morning air and open sky in the upper quarter; deep blue, slate and restrained warm light. No lettering or logos.",
    ],
  },
  {
    id: "blueprint-city", title: ["城际视野", "City perspectives"], material: ["会议背景", "Meeting backdrop"], format: "16:9",
    scenes: ["城市专题 · 市场观察", "City feature · Market insights"], subtitle: ["以广阔视野观察市场", "A wider view of markets"],
    prompt: [
      "开阔海湾城市天际线，高处远摄，现代建筑在画面中段与平静水面相接；浅蓝灰天空至少占上方三成，窗光仅一点暖色，空气通透、构图端正、国际金融机构编辑摄影。 无文字、无标识。",
      "A modern city skyline across a wide bay, photographed from above, with calm water below and pale blue-grey sky across the top third. A few warm windows against clean, precise architecture. No lettering or logos.",
    ],
  },
  {
    id: "beacon", title: ["行稳致远", "A steady course"], material: ["公众号首图", "WeChat cover"], format: "2.35:1",
    scenes: ["投资者教育 · 长期主题", "Investor education · Long-term themes"], subtitle: ["理解时间的价值", "Understanding the value of time"],
    prompt: [
      "一座真实的白色灯塔立在海岸崖上的中右部，暮色深蓝海面，一束很柔和的白光朝左伸出，留出顶部干净的薄雾蓝天空；有真实岩层和海浪细节，沉静而开阔。 无文字、无标识。",
      "A white lighthouse on a coastal cliff, right of centre, with a soft beam over a deep blue sea at dusk. Leave clear misty sky across the upper quarter; capture believable rock and water texture. No lettering or logos.",
    ],
  },
  {
    id: "research-desk", title: ["研究在现场", "Research in practice"], material: ["人物专访封面", "Interview cover"], format: "3:4",
    scenes: ["专业洞察 · 团队故事", "Professional insights · Team stories"], subtitle: ["用持续研究理解变化", "Understanding change through research"],
    prompt: [
      "两位亚洲专业研究人员在明亮会议桌前自然讨论纸质资料，人物自然、表情放松专注，不看镜头；右侧窗边自然光，冷白与中蓝为主，桌上只见极少无文字纸页，画面上方留白。 无文字、无标识。",
      "Two East Asian researchers in an airy meeting room, naturally discussing a simple paper document without looking at the camera. Cool white daylight and quiet blue accents; unobtrusive upper background. No lettering or logos.",
    ],
  },
  {
    id: "product-prism", title: ["洞察新方向", "A new perspective"], material: ["产品宣介海报", "Product poster"], format: "3:4",
    scenes: ["产品宣介 · 主题海报", "Product communications · Campaign poster"], subtitle: ["请填写产品名称或补充说明", "Add the product name or subtitle"],
    prompt: [
      "一个精确切割的蓝色透明光学棱镜悬在浅蓝无缝摄影棚，位于画面中上部，折射出一抹温和金色，台面下半部简洁空净。清晰边缘与磨砂反射，理性克制的金融海报主视觉。 无文字、无标识。",
      "One precision cut translucent blue optical prism suspended in a pale-blue studio, centred above the midpoint. A touch of warm gold refraction, crisp edges and understated reflections; keep the lower half sparse. No lettering or logos.",
    ],
  },
  {
    id: "new-year-light", title: ["岁时新启", "A new season"], material: ["节日贺卡", "Seasonal greeting"], format: "1:1",
    scenes: ["节日贺图 · 企业传播", "Seasonal greetings · Brand communications"], subtitle: ["新岁启程，愿万事顺遂", "A wish for the season ahead"],
    prompt: [
      "一枚雕刻有极细圆纹的磨砂金色圆盘，与一枝素雅红梅构成画面焦点，暖朱砂色纸艺背景，右中部聚焦，左侧和顶部保留安静空白，背景微微层次过渡，细腻高级的节日静物摄影。 无文字、无标识。",
      "A brushed gold disc engraved with fine concentric lines and a single delicate red plum branch, set against warm vermilion paper. Keep the left and top quiet; refined seasonal still life with soft depth. No lettering or logos.",
    ],
  },
  {
    id: "architecture", title: ["向上生长", "Upward lines"], material: ["线下易拉宝", "Roll-up standee"], format: "2:5",
    scenes: ["建筑摄影 · 行业专题", "Architecture · Industry features"], subtitle: ["让专业走进日常", "Bringing expertise closer"],
    prompt: [
      "仰拍一座现代蓝灰玻璃建筑，几何幕墙的垂直线汇聚向天空，浅灰云层，边缘干净、只有一座主体，冷色自然光，不要夸张鱼眼，真实建筑编辑摄影。 无文字、无标识。",
      "Look up at a contemporary blue-grey glass building whose clean vertical lines converge into a pale sky. One recognisable structure, cool daylight, precise architectural photography. No lettering or logos.",
    ],
  },
  {
    id: "forward", title: ["迎着风向", "Into the wind"], material: ["活动报名横图", "Event registration"], format: "3:2",
    scenes: ["团队文化 · 运动主题", "Team culture · Sport"], subtitle: ["一起迈出下一步", "Take the next step together"],
    prompt: [
      "清晨蓝色跑道，从侧后方抓拍一个穿白色运动上衣的亚洲成年跑者，动作真实，背景留开阔天空和模糊树线，略低机位，少量金色晨光，成熟干净的体育纪实摄影。 无文字、无标识。",
      "Catch one East Asian runner in a white top from a low rear three-quarter angle on a blue track. Wide sky, a soft tree line and a little warm morning light; credible documentary sports photography. No lettering or logos.",
    ],
  },
  {
    id: "open-water", title: ["广阔如海", "Open water"], material: ["年报封面", "Annual report cover"], format: "A4",
    scenes: ["景观底图 · 年度报告", "Scenic background · Annual report"], subtitle: ["年度回顾与展望", "Review and outlook"],
    prompt: [
      "从高处远眺开阔蓝海与远方重叠灰蓝岛屿，一条无标识小船留下极细尾迹，仅占画面极小部分，海天层次静而通透，地平线端正，无多余景物。 无文字、无标识。",
      "A broad view over blue water and layered slate islands. A tiny unmarked vessel leaves a fine wake. Keep the horizon level, the layers airy and the scene free of clutter. No lettering or logos.",
    ],
  },
  {
    id: "momentum", title: ["奔流的线", "Lines in motion"], material: ["官网宽幅 Banner", "Wide website banner"], format: "3:1",
    scenes: ["抽象配图 · 活动背景", "Abstract imagery · Event backgrounds"], subtitle: ["把目光投向更远的方向", "Look further ahead"],
    prompt: [
      "高速列车掠过现代轨道时留下的流动光线，强但克制的消失点，蓝灰城市剪影与少许白金色高光，构图平衡，摄影长曝光，自然且不做科幻霓虹。 无文字、无标识。",
      "Long-exposure light trails along modern railway tracks, with a strong but balanced vanishing point. Blue-grey city silhouettes and a little white-gold light; photographic rather than sci-fi. No lettering or logos.",
    ],
  },
  {
    id: "first-light", title: ["更远的视野", "Beyond the ridge"], material: ["竖屏视频封面", "Portrait video cover"], format: "9:16",
    scenes: ["自然景观 · 品牌配图", "Landscape · Brand imagery"], subtitle: ["以长远视角，发现更多", "Discover more with a long view"],
    prompt: [
      "日出时分的群山远景，前景极小徒步者站在一条山脊边，山层从深蓝过渡到灰蓝，浅琥珀色地平线，人物像注脚，节制清爽，写实商业风景摄影。 无文字、无标识。",
      "Layered mountain ranges at sunrise, with one tiny hiker on the near ridge. Deep to soft slate blue, a faint amber horizon and a restrained sense of scale. No lettering or logos.",
    ],
  },
  {
    id: "craft", title: ["时间的刻度", "Measured time"], material: ["投教知识卡", "Investor education card"], format: "1:1",
    scenes: ["抽象静物 · 长期主题", "Abstract still life · Long-term themes"], subtitle: ["用两分钟了解一个概念", "One concept in two minutes"],
    prompt: [
      "秩序井然的三层磨砂蓝玻璃片和一片细薄拉丝金属，斜射光在浅灰石面留下清晰长影，几何抽象静物，柔和明亮，刻画耐心与专注，构图有张弛。 无文字、无标识。",
      "An ordered arrangement of three frosted blue glass panels and one thin brushed metal sheet. Low directional light casts long shadows on pale stone, a quiet abstract still life. No lettering or logos.",
    ],
  },
]

const templateOrder = [
  'steady-horizon', 'efund-active-prism', 'blueprint-city', 'efund-etf-feature-cards',
  'research-desk', 'efund-index-bridge', 'beacon', 'efund-harvest', 'efund-fund-learning',
  'efund-industry-pinwheel', 'forward', 'efund-innovation-archive', 'new-year-light',
  'efund-industrial-star', 'efund-glass-transition', 'efund-bond-pavilion', 'efund-marathon-city',
  'momentum', 'efund-mountain-ridge', 'product-prism', 'architecture', 'craft', 'open-water', 'first-light',
]
const templatePosition = new Map(templateOrder.map((id, index) => [id, index]))
export const galleryExamples: GalleryExample[] = [...originalExamples, ...marketingExamples]
  .sort((a, b) => (templatePosition.get(a.id) ?? templateOrder.length) - (templatePosition.get(b.id) ?? templateOrder.length))
