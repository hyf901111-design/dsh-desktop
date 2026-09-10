# 第44组点阵与底工具图标复验

证据为真实生产SVG网格函数及Figma原始图标，在完整102份vendor CSS及最终shell CSS下的受控浏览器截图，不是已打包Electron。

Figma点阵：361:5855浅色#8b8b8b/.4；361:6148深色#b8b8b8/.46；strokeWidth1.35、round端；原路径每点为0.07px水平短线，间距13.71。祖先opacity均1。实际包CDP原CSS确为radial .675→.8，颜色和间距正确，偏差来自光栅化方式。

最终保持这些原数值，直接绘制SVG短线路径；一条横向row路径、多行use复用。pan只更新group transform，viewport缩放保留世界间距和描边缩放。20%/100%/200%视图元素数、路径长度和复用结果见browser-metrics.json。pointer-events:none已通过点击画布和按钮验证。

像素对照只读取同尺寸原图，没有裁切/编辑保存截图。比较区域x200–650/y200–700：原稿5311个非背景像素，旧radial10240，最终SVG4977；平均逐像素误差由0.672降至0.091。仍有Figma导出与Chromium描边抗锯齿的差异；没有调整原颜色、透明度或描边去补偿。

三个图标为Figma原始SVG：链接361:5949/6242，容器361:5954/6247，语音361:5958/6251；原始16×16。容器单一圆角方框stroke1.3；链接/语音stroke1。浅#555555、深#cccccc，各主题使用原图，不使用filter近似。原按钮事件、禁用、语音录制过程保留。

文件：dark/light-canvas-primitives.png为1380×900同坐标受控绘制；dark/light-toolbar-icons.png为受控工具栏截图；figma-nodes.json为工具原始属性/SVG；actual-before.json为修改前真实包CDP读数；pixel-comparison.json为原图读取统计。7项新聚焦检查、项目typecheck通过；最终包由主任务按照本地手册构建并另行复验。

证据目录：`output/playwright/canvas-final/primitives-final/`。
