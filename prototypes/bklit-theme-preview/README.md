# Bklit 组件风格样板

为 Sherlock 研究组件选定视觉方向的独立预览。使用实际 Bklit MIT 面积图和柱状图，展示同一数据的深浅主题、悬浮提示、动画、区间切换及可展开的数据表。

视觉采用 Bklit 默认 Monochrome 方向：浅色 stone / 深色 zinc，直角细边框和控件，单层图表面板，较大的绘图留白。默认展示全宽浅色组件，可切换整页深色或双主题对照。面积图采用 2px 曲线、0.3 渐变填充、两端渐隐；柱状图平头，提示框直角无阴影。参考页的点阵、标尺和角点仅用作预览背景装饰。

配色依据固定提交的 [Monochrome 配置](https://github.com/bklit/bklit-ui/blob/c57f66bfa7c3198edb677b567ce08cbf364ae159/apps/web/lib/chart-themes/monochrome.ts) 与 [共享主题色值](https://github.com/bklit/bklit-ui/blob/c57f66bfa7c3198edb677b567ce08cbf364ae159/packages/studio/src/styles/bklit-tokens.css)。页面布局和 CSS 为本样板独立实现，未复制 Studio 实现。

## 本地运行

在此目录执行：

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5187/ 。生产构建验证使用 `npm run build`；静态预览使用 `npm run preview`（与 dev 共用端口，运行前先停止另一个）。

本目录有独立依赖和锁文件，未接入 Sherlock 运行时、默认生成指令或共享客户端构建。所有图中数值均为虚构示意数据，口径为自 4 月 1 日起累计收益率；区间选择仅裁切观察窗口，不重新计算收益率。

## 源码来源

- 官方图表参考：https://bklit.com/charts/area-chart
- 官方主题文档：https://bklit.com/docs/theming
- 固定上游提交：`c57f66bfa7c3198edb677b567ce08cbf364ae159`
- 完整许可见 `THIRD_PARTY_NOTICES.md`，逐文件来源与哈希见 `src/vendor/bklit/SOURCE_MANIFEST.json`。
- 本地 vendor 调整限于别名导入、导出适配，以及 AreaChart 裁剪 ID 使用 `useId()`，防止多个图表实例的 SVG 引用冲突。

## 聚焦验收（2026-09-05）

- `npm run build`：TypeScript 检查及 Vite 生产构建通过。
- 浏览器实际显示深浅两套面积图、柱状图；曲线悬浮提示显示 4 月 23 日及对应的 10.40% / 3.65%，与源码数据一致。
- 后 7 天 → 浅色 → 深色 → 柱状图：区间仍为 4 月 24 日至 30 日，样本数 7；数据表行与同一数组一致。
- 面积图、平头柱状图在深浅主题下均完整绘制；默认视图为 30 天浅色面积图。
- 390px 窄窗口下两套主题纵向排列，页面内容没有横向溢出；随后恢复默认浏览器尺寸。
- 控制台无错误或警告；两个面积图的裁剪 ID 各不相同。
- Monochrome 修订后复核：卡片、按钮、下拉框计算圆角均为 0px；柱体 rx/ry 为 0；真实悬浮提示的圆角为 0px、阴影为 none。

交付范围是可操作的视觉样板，默认生成页面采用此风格的产品接入属于后续实现。
