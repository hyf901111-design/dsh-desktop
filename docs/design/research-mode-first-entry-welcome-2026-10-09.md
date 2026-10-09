# 研究模式首次进入欢迎页

日期：2026-10-09。状态：Figma 设计交付，尚未实施到客户端。

## 设计入口

- [欢迎页主稿](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2176-373366)
- [完整设计区域](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2176-373365)
- [浅色欢迎页](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2177-374602)
- [研究示例](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2177-374735)

在原有「奥德赛方案」页面新增「23 研究模式 · 首次进入欢迎 / CRT Warp」。保留原设计和侧栏；欢迎内容占据首次进入时的主内容区域。主要画板为 1380 × 900，使用现有 Noto Sans SC 字体。

## 文案和布局

眉题：让想法，有据可循。

主标题：从一个问题，展开一场研究。

说明：把资料、数据与思考放在同一张画布上。与 AI 一起梳理线索，让每一次追问都有所依据。

左侧为介绍和行动按钮，右侧为「问题 → 资料与依据 / 比较与呈现」的可编辑研究图示。下方三步介绍为：

1. 提出你想弄清的问题：一句话说明目标，也可以带上已有资料。
2. 把线索铺开在画布上：让资料、表格与图表形成清楚的研究脉络。
3. 继续追问，逐步形成洞察：围绕内容深入讨论，把思考整理成成果。

## 交互设计

- 「开始我的研究」和「跳过介绍」进入原有空白研究画布。浅色主题进入浅色画布。
- 「看看研究示例」进入供应商方案对比的示例说明，可以返回欢迎页或进入研究画布。
- 「暂停背景」切换到静态背景状态；「播放背景」返回对应主题的欢迎页。
- 设计出现规则：当前用户首次进入研究模式时展示；开始或跳过后记为已读，后续直接进入研究画布。
- 进入画布后沿用现有模型、项目、输入和生成流程。

这些是设计行为，不代表已完成客户端持久化或后台能力验收。示例卡片是研究过程示意，不是生成结果或实时数据。

## CRT 背景与动效

参考：[React Bits / CRT Warp](https://reactbits.dev/backgrounds/crt-warp?color=bcbcbc)。源组件：[CRTWarp.jsx](https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/CRTWarp/CRTWarp.jsx)。

保留灰色波形、扫描线、像素阶梯和轻微 RGB 色散。左侧增加渐变阅读保护，下半部减少干扰；浅色主题使用更淡的背景。Figma 用可编辑矢量取样和三关键帧缓慢溶解演示背景变化，连续 WebGL 动效在客户端实现时接入原组件。

建议实现参数：

```json
{
  "color": "#bcbcbc",
  "backgroundColor": "#0d1010",
  "speed": 0.18,
  "curvature": 0.25,
  "scanlineStrength": 0.16,
  "scanlineFrequency": 200,
  "waveAmplitude": 0.3,
  "waveFrequency": 2.5,
  "bloom": 0.7,
  "bloomRadius": 1,
  "noise": 0.04,
  "vignette": 0.25,
  "brightness": 0.85,
  "rgbShift": 0.006,
  "mouseReact": false,
  "fps": 30,
  "dpr": 1
}
```

背景淡入 700 ms。标题与说明分别淡入 400 ms、间隔 80 ms；按钮延后 240 ms 出现。阅读期间仅背景缓慢变化，正文与按钮保持稳定；退出时淡出 250 ms。系统减少动态效果或用户暂停时使用静态关键帧，离开欢迎页或切到后台后停止渲染。

## 交付核验

欢迎页的文案、图形和控件均为可编辑图层。按钮和步骤为组件实例，深浅主题使用独立欢迎页变量；唯一的图像内容是沿用的 23 × 23 账户头像。深色、浅色及示例页已检查 Figma 渲染截图，文字完整、没有裁切。原型连接和字体已读回核验。

此轮只交付设计和说明，不构建、替换或发布共享客户端，不运行全功能测试。
