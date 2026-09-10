# 第 44 组右上面板开关图标

只读核对 Figma 原图后修正底部面板与右侧面板开关，不涉及画布底部工具栏。浅色原始图标为 `361:6013 / 361:6018`，深色为 `361:6307 / 361:6312`；[第 44 组深色应用容器](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=361-6086)。四份未经改动的 SVG 在 `figma-panel-icon-evidence/`。

Figma 图标容器均为 16×16；外框中心路径从 x2/y2.6667 延伸至 x14/y13.3333，宽 12、高 10.6667，圆角半径 2，描边 1、圆角端点及连接。内部是 1px 分隔线，底部分隔线 y10，右侧分隔线 x10.6667。浅色默认 #777777、展开 #697078；深色默认 #A0A0A0、展开 #B9B9B9。

真实包 DOM 原来为 13×12 外框、1.5px 描边及 2.75px 实心条，深色图标 #CFD3D6。只替换 Better Sidebar 两个 glyph 函数，保留原 16px 调用和按钮尺寸，并从原 `state.panelOpen / bottomOpen` 传入开合状态。新增 CSS 仅限定这两个 SVG 的非悬停、非焦点颜色；原按钮操作、禁用与焦点反馈保留。没有修改全局图标、画布或文件阅读器。

验证：`test/research-tabbar-final-layout.test.ts` 与 `test/research-generation-sidebar-focus.test.ts` 共 13 项通过；完整产物语法、连续两次补丁幂等通过。实际 glyph 函数由 React 在独立 Chromium 渲染，四态均实测 16×16、1px round、无填充及上述颜色。对照见 [comparison.png](figma-panel-icon-evidence/comparison.png)，指标见 [metrics.json](figma-panel-icon-evidence/metrics.json)。这是受控图标对照，不是修复后最终 Electron 截图；最终包由主任务重新构建验收。
