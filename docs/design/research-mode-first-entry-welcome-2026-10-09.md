# 研究模式首次进入欢迎页 · R2

日期：2026-10-09。状态：Figma 设计，尚未实施到客户端。

用户反馈首稿元素过多、像说明书。R2 改为居中构图，用背景、留白和文字层级呈现欢迎体验。

## 设计入口

- [深色主稿](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2176-373366)
- [浅色主稿](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2177-374602)
- [完整设计区域](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2176-373365)

## 页面内容

仅保留四项文字：

- 小字：研究模式。
- 标题：探索更远，洞见更深。
- 介绍：与 AI 一起，从一个问题走向新的洞察。
- 按钮：开始研究。

标题使用现有 Noto Sans SC Regular、56 px；介绍 15 px。进入按钮为 154 × 46 px 的圆角按钮。整体居中，保留原应用侧栏及窗口结构。

删除首稿的研究图示、三步卡片、示例入口、上下说明和双按钮。关闭与背景暂停使用低存在感图标。

## 背景与交互

参考：[React Bits / CRT Warp](https://reactbits.dev/backgrounds/crt-warp?color=bcbcbc)，主色 #bcbcbc。背景承担主视觉，中央使用柔和阅读保护；没有前景卡片。深浅主题均保留同一布局。

沿用可编辑矢量背景和三关键帧缓慢溶解原型，提供对应主题的静态状态。连续 WebGL 动效后续在客户端接入原组件；标题与按钮保持稳定。建议 speed 0.18、scanlineStrength 0.16、noise 0.04、rgbShift 0.006、mouseReact false。

开始或关闭介绍后进入对应主题的现有空白研究画布。首次进入显示、完成后记为已读的行为仍属于设计要求，尚未实现客户端持久化。

## 核验范围

检查 R2 深浅主题的 Figma 渲染、文字可编辑结构、字体及按钮连接。仅更新设计和文档，不构建、替换或发布共享客户端，不运行全功能测试。
