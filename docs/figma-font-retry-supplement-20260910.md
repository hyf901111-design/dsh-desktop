# 第 47 组：字体加载失败与重试补充设计

按用户授权，在同一 Figma 文件、页面 `111:683`、主画板 `284:396` 末尾追加第 47 组。未创建文件或修改第 22–46 组；读取前后 53 个原有直属节点的名称、位置、宽高完全一致，主画板原尺寸也保持不变（原 `clipsContent=false` 允许末尾新增内容）。

| 设计 | Figma 节点 | 截图 |
| --- | --- | --- |
| 浅色三态 | [404:588](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=404-588) | [47-font-retry-light.png](figma-font-retry-evidence/47-font-retry-light.png) |
| 深色三态 | [404:627](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=404-627) | [47-font-retry-dark.png](figma-font-retry-evidence/47-font-retry-dark.png) |

两版各 1580×1100，复用第 42 组外层背景、色彩和 Noto 文本样式，以及第 46 组 S 卡的 320×220、12 圆角、中性 1 px 描边和无阴影外框。三态依次为“字体加载失败 / 重试”、点击后“正在加载字体…”且重试禁用、字体完成后移除提示并保留内容。这是已实现流程的静态交互示意，没有新增业务动作、百分比、成功弹窗或自动计时原型。

提示依据 `html-artifact.js` 当前真实 DOM/CSS：左 / 底 12、文本 12/18、间距 8、CSS padding 6/10、1 边界、8 圆角、`0 2px 8px #0001` 阴影。Figma 内描边不占布局，因此内侧内容距边缘为 7/11；失败提示实测 130×34，重试中 142×34，与文案自适应。浅深色提示底色、边界、文字和蓝色动作分别沿用当前实际主题值。

Figma 原稿的 DINPro 当前不可加载（原第 46 组已有 `hasMissingFont=true`）；补充组采用纯中文内容样例及既有 Noto 字体，不擅自替换原稿 DINPro。新组 48 个文本节点均无缺失字体，六张卡和四个提示均无内部溢出。客户端 DIN/Noto 实际加载证据仍见 [字体核验记录](figma-runtime-font-evidence-20260910.md)。

原始截图和只读核验保存在 `docs/figma-font-retry-evidence/`；同样加入 `output/figma-final-review/index.html` 的“第 47 组补充设计”区域，明确区分 Figma 参考与受控生产截图。此次没有修改客户端源码、构建或发布。
