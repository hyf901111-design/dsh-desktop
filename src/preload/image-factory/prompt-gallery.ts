type Localized = readonly [string, string]

export type PromptExample = {
  id: string
  title: Localized
  format: string
  prompt: Localized
  scenes?: Localized
}

export const promptExamples: PromptExample[] = [
  {
    id: 'conference-light', title: ["会场灯光","Conference lighting"], format: '16:9',
    prompt: ["摄影，一座简洁有秩序的企业会议舞台和整齐座位，冷蓝灯带，空舞台，柔和蓝紫环境光，画面干净无字，无人，商业活动摄影，低饱和，视觉重点偏右。", "Photograph an empty corporate conference stage and tidy auditorium seats, with restrained blue and violet lighting and a clear visual focus on the right. No text, people, or logos."],
  },
  {
    id: 'glass-boardroom', title: ["窗边会议室","Glass boardroom"], format: '16:9',
    prompt: ["高级真实建筑摄影，清晨的现代企业会议室，浅米灰墙面和大面积落地玻璃，暖光穿过桌面，右边出现玻璃办公楼群，画面通透，简洁整齐，无字无人。", "Photograph a contemporary glass boardroom at dawn. Warm light grazes the table, with a quiet cream and grey palette and an office skyline to the right. No text or people."],
  },
  {
    id: 'paper-cobalt', title: ["蓝色纸艺","Cobalt paper study"], format: '4:3',
    prompt: ["企业品牌背景图，三张钴蓝和雾蓝厚纸相叠形成斜向结构，右侧有细腻纸纤维，清晰自然柔光，极简抽象，接近真实纸艺工作室拍摄，无文字字母与标志。", "Make a studio photograph of layered cobalt and mist-blue card stock with a restrained diagonal composition, fine paper fibres and soft light. No lettering or logos."],
  },
  {
    id: 'workshop-table', title: ["创作工作台","Workshop tabletop"], format: '4:3',
    prompt: ["俯拍真实团队工作台，打开的无字笔记本、笔记卡、小块蓝色透明亚克力和一杯咖啡，少量手部入画，侧窗光，浅灰木桌，干净克制的商业生活方式摄影，无可读文字。", "Overhead documentary photograph of a tidy workshop table with blank notebooks, note cards, a piece of blue acrylic, a cup and a hand entering the frame. Soft daylight, no readable text."],
  },
  {
    id: 'industrial-lab', title: ["精密实验台","Precision laboratory"], format: '16:9',
    prompt: ["现代工业研发实验台，右侧一个没有商标的精密银色材料样件，精细金属、磨砂观测玻璃，整洁蓝灰光，左侧保留安静环境，真实编辑摄影，无字无商标。", "Photograph a precise silver prototype on the right of an industrial research bench. Fine metal, frosted glass, cool grey-blue daylight and clean negative space. No markings or logos."],
  },
  {
    id: 'forest-grid', title: ["绿意与秩序","Forest and energy"], format: '3:4',
    prompt: ["航拍早晨的绿植园区和几何太阳能屋顶，工业与自然交织，山体和树木层次清楚，林绿和石灰色为主，专业写实 ESG 主题摄影，无文字标注。", "Aerial documentary photograph of an office park with greenery and geometric rooftop solar panels in morning light. Greens and slate greys, no annotations."],
  },
  {
    id: 'welcome-hall', title: ["访客大厅","Visitor lobby"], format: '16:9',
    prompt: ["高级写实写字楼大厅，挑高空间、石材、木饰面和一侧绿色植物，前台集中于右半部，无人，轻暖侧光干净大方，企业欢迎屏背景，无任何标识、无字。", "Photograph a light modern corporate lobby with stone, timber and a few plants. Reception is on the right, with warm side light. No people, text or signage."],
  },
  {
    id: 'portrait-pro', title: ["专业人物肖像","Professional portrait"], format: '3:4',
    prompt: ["一位成年东亚女性职场专业人士的自然半身肖像，着蓝灰休闲西装、站在明亮现代写字楼窗边，人物略靠右，柔和自然光，表情轻松不过度微笑，真实雇主品牌摄影，无字无标志。", "A natural half-length portrait of an East Asian professional in a slate-blue jacket, slightly right of centre by a bright office window. Warm, understated editorial photography. No text or logos."],
  },
  {
    id: 'city-lighttrails', title: ["现代城市夜景","City light trails"], format: '16:9',
    prompt: ["夜间商业区，蓝色玻璃建筑与浅金光轨，干净几何构图，桥线通往右方楼群，几何天际线，亮度平衡，真实企业年报摄影，无字、无标识。", "Photograph a modern business district at night with blue glass and restrained golden light trails. Clean geometry and a balanced skyline, no text or logos."],
  },
  {
    id: 'podcast-booth', title: ["声音工作室","Recording studio"], format: '1:1',
    prompt: ["播客录音室静物摄影，深色背景上一只哑光黑专业话筒和耳机，钴蓝丝绒吸音墙与小面积橙金侧光，主体清晰，构图偏右留白，低调专业，无字无标识。", "Studio still life of a matte microphone and headphones against a cobalt acoustic wall, with a soft amber edge light. Quiet, professional, focused on the right. No text or logos."],
  },
]
