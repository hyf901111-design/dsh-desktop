# 研究组件与便当盒：Figma 最终稿实现记录

依据：Figma 文件 `Jkyr5rMvgM8GNH6E68xnqd`，页面 `111:683`，主画板 `284:396`。本次通过 `get_design_context` 获取 46（`379:644`）与 41（`350:588`）的参考代码及截图，再通过 `use_figma` 逐组读取 38–43、45–46 的实际几何、填充、描边、阴影与文本属性。未修改 Figma。

## 设计证据

| 对照 | 节点 | 读取到的产品属性 |
| --- | --- | --- |
| S / M / L | `379:649` / `379:662` / `379:682` | 320×220 / 656×220 / 656×456，圆角 12，白底，中性 1px #E1E1E1，外阴影为空 |
| 深色规格 | `379:764` / `379:777` / `379:797` | 对应 S / M / L；深色底 #292A2D |
| 默认 / hover | `354:613` / `354:676`，深色 `354:807` / `354:870` | 圆角 12；浅 #FFF / #E1E1E1；深 #292A2D / #424242；无外阴影；hover 工具绝对浮动、不占标题宽 |
| 选中 | `354:739` / `354:933` | 1.5px 描边；浅 #A2C4FF、深 #1B77FF；0,0 blur7 rgba(82,140,255,.28/.48)，0,0 blur26 spread2 rgba(64,128,255,.14/.24) |
| 组件工具栏 | `354:716` / `354:910` | 高 36、圆角 11、上下 4 / 左右 6、gap2；白 .94 / #303030 .93；background blur24；0,3 blur12 黑 .08/.22 |
| 思维导图菜单 | `350:663` | 宽 270、圆角10、padding8、gap4；简要/保留核心主题；常规/覆盖重点与主要关系；详细/展开细节与依据 |
| 生成过程 | `348:588` / `348:593` / `348:598` | 当前步骤；过程最多3条；默认收起；停止绑定任务；900ms 圆环、1.6s 骨架、减少动态效果时停动画 |
| 失败 / 停止 | `348:632` / `348:645` | 分开的标题、保留需求告知、可展开已有过程/错误详情、重新生成 |
| 自由调整 | `366:724` / `367:719` | 320–479指标2列、480–759指标4列；窄框减少表格列；短框核心内容；标题15、主指标24、正文13；放大查看完整内容 |
| 整理 | `375:730`、`379:588`–`379:633` | 3列便当盒，L先占位，S填右侧两格，M占下方两格，最后S填右下；16世界单位间距；图中 .87 是视野缩放 |
| 实际应用容器 | `375:590`、`375:635`、`375:654` | 画布 1288×798，右浮层 x936 / 宽340；实现用实际右面板边界计算可视宽度，整组留32外边距并居中 |

42 的选中浅色原图保存在 [figma-42-selected-light.png](figma-final-canvas-evidence/figma-42-selected-light.png)。这张是 Figma 导出参考，不是运行客户端验收图。

第45组仍残留旧说明文本节点 `375:811`（32间距、行内居中），按用户最新明确要求弃用。规格和排序采用第46组 `379:697` / `379:812`。

## 接入真实组件的修改

- `packages/dsh-research-task-runtime/bento-layout.js` 同时供任务规划和桌面画布注入使用：S/M/L 内容密度选择、L→M→S 填空格、同规格保留输入顺序、按完整视区选择列数、按未被右面板覆盖的可用宽度缩放居中。
- `workbench-plan.js` / `workbench.js` 在生成之前发出新规格；继续使用现有并发任务、事件、来源和任务状态。
- `scripts/lib/figma-canvas-client.mjs` 注入真实画布与组件函数。`patch-research-board-client.mjs` 串接此模块及 shell 模块，不改造为静态页面。新 S 的最小宽度从旧 360 修为 320。
- 整理按规格归类，不再读取已经摘要的 DOM 尺寸而错误把所有卡片升级为同一宽高；不删除原始正文、引用、HTML、选择或任务。
- 原生 KPI/表格/Markdown 按当前宽高呈现核心内容；表格保留可点击来源列；剩余内容通过现有放大阅读恢复。HTML 超过 L 时展示文本摘要，原 iframe 保留挂载，放大恢复原交互页面。
- 生成圆环、当前公开步骤、短任务描述、默认收起的过程与最近3条记录绑定真实任务。展开过程需要空间时通过 workspace 几何更新为 L；失败、停止保持独立文案和重试入口。
- 思维导图三个详细程度、总结提炼、基于所选创建继续走既有真实调用、冻结来源、相邻创建、选中和置顶；创建浮层补上标题、所选数量、Esc关闭、⌘Enter创建。
- 分别实现默认、hover 和选中材质，去掉标题分隔线和给工具预留的标题宽度；保留现有拖动、缩放和原生顶层放大阅读。
- 整理成功后复用现有短反馈生命周期，显示实际组件数，宽度随文案收缩，左右padding12、图标文本gap6。图标使用 Figma 导出的原始 SVG（含16px / 1.7圆角描边对勾），文件在 `build/figma-canvas-icons/`。
- 右浮层覆盖的宽度单独计入 fit，不改变画布坐标；ResizeObserver 观察真实 `.t8lSSG_panel`。修正了 capture wheel 把语音控制区域也误当画布空白拖动的行为。

## 聚焦验证

- `test/research-workbench.test.js`、`test/research-container-chrome.test.ts`、`test/research-canvas-clipboard-ui.test.ts`：72项通过（新增窄框摘要→放大全内容、过程展开、填洞排序、规格上限测试）。
- `test/sherlock-composer-workspace-ui.test.ts` 定向 `Research voice toolbar|generated component theme|Workbench staggered reveal|keeps selection actions visible`：17项通过；覆盖实际工具调用、语音滚轮隔离、短任务说明和iframe主题/生命周期。
- 从 canonical 目录只读获取尚未打此补丁的依赖源码，执行 fresh apply，`vm.Script` 解析通过；第二次应用输出严格相同（幂等）。未写 canonical `node_modules`。
- 未运行全功能测试；未构建/替换共享客户端；未上传发布、推送或递增版本。

## 生产组件隔离浏览器验收（2026-09-10 18:03）

使用独立 Chromium 148、实际已安装 conversation/client.js 的 module factory、真实 React / primitives、真实 ResearchCanvas 和 workspace store。行情数据是明确的受控视觉样本，不是连接行情服务的验收；这组截图不冒充 Electron 主窗口。

证据目录：`output/playwright/canvas-final/`，入口由主任务汇总在 `output/figma-final-review/index.html`。

| 状态 | 证据 | 实测 |
| --- | --- | --- |
| 第42组默认/悬停/选中浅深色 | canvas-light-default.png / canvas-light-hover.png / canvas-light-selected.png / canvas-dark-selected.png | 原生320×220 / 656×220 / 656×456；默认无阴影，选中蓝边/光晕，悬停原SVG浮层不占标题宽 |
| 第45–46组实际整理 | canvas-bento-organized.png、bento-geometry.json | 真实 organizeCanvas 结果：L顶部双格，S填右侧，M下一行；世界间距16，同规格顺序保持，整组居中 |
| 第43组窄表/长文本/自由宽高 | canvas-long-table-summary.png / canvas-long-content-summary.png / canvas-free-resize-wide.png | 曾复现表格274>170、Markdown910>406溢出，已改为实际高度测量与语义摘录；最后分别170=170、406=406、自由宽898/高490均scroll等于client |
| 完整阅读 | canvas-long-table-reader.png | 窄框摘要只呈3行2列；原始12行4列完整保留并恢复，来源链接保留href |
| 中规格图表 | canvas-chart-medium.png | SVG实际618×129，viewBox也是618×129；轴字号11px，不再随固定viewBox整块缩小 |
| 空白页底工具栏 | canvas-empty-available-width.png | availableWidth928时x328、宽272、高48、底24；与361:5947一致。blur原始24按Figma转换为CSS12 |
| 原生与双沙箱字体 | fonts.json / iframe-fonts.json / canvas-html-runtime-font.png | CDP实际命中DINPro-Medium/Bold、NotoSansSC Regular/Medium，isCustomFont全部true；“Noto Sans SC Thin”是文件内部family名，实际使用对应Regular/Medium字重 |
| 字体体积及真实重试 | canvas-font-failed.png / canvas-font-recovered.png / runtime-validation.log | 实际渲染srcDoc153105字符；原生CSS从固定本地font URL读字体；双opaque沙箱由父Blob桥传字体；HTTP503失败可见、用户点击重试后loaded且错误消失；输入和计数在放大/关闭后保持 |

更多按钮原来的字符“···”在Noto中实测超出24px按钮，已替换为Figma `354:686`导出SVG。图表坐标按实际空间重新计算，不缩小字体。原生摘要根据内容的实际渲染高度继续收敛；不会删除原内容，也不会用隐藏滚动条遮住溢出。

最终聚焦：`research-workbench`、`research-container-chrome`、`research-canvas-clipboard-ui`、`research-board-client-adapter` 共101项；composer指定17项。fresh canonical补丁可解析、二次严格幂等，runtime调用只在srcDoc唯一位置，HTML导出仍保留完整内嵌字体。

## 仍需真实客户端验收与明确差异

1. 本模块完成了生产组件受控浏览器视觉验收；完整真实客户端截图、真实任务生成、浅深色全部业务状态对照由主任务集成启动后补充，尚不能据此声称整个客户端像素验收完成。
2. 任意模型生成的 HTML 不能普遍从 DOM 推断第43组复合内容的语义层级。目前采用响应式生成约束 + 超出 L 后保留交互原文的摘要回退；复杂 HTML 图表/表格并排的实际还原仍取决于生成结果，需要真实样本验收。
3. 原生表格/KPI/Markdown 已适配规格，长单元格及多级标题摘要已实测无溢出；复杂思维导图和历史非组件型文件预览仍需真实客户端样本检查。未用缩小字体作为回退。
4. background blur 原始半径24已按Figma设计上下文的转换使用CSS12；选中光晕和外阴影仍保留各自原始参数。真实客户端壁纸下的合成仍需主任务截图对照。
5. 数据日期仅来自实际内容；没有用生成时间冒充行情时间。缺少日期的历史内容不会伪造日期。


## 冷启动与长内容边界补验（2026-09-10 18:21）

- 延迟插入、替换、移除右面板：真实Canvas可用宽度依次1380→1016→856→1380。增加面板树变化监听并重新绑定ResizeObserver；几何未变化时不写store，防止重复渲染。
- S失败详情：点击后通过现有放大阅读进入原生dialog，详细错误与重试入口在reader中展示；实测reader client/scroll均786。关闭后详情自动收起，S正文client/scroll均170。
- 单项长KPI：保持24px，通过实际字体测量跨列。手动S只展示能容纳的内容，client/scroll均318×170；放大恢复两项完整值。自动S遇到相同内容则调用现有workspace升级到L656×456，summary=false，client/scroll均654×406。只有手动尺寸或已L才摘要。
- 此轮只跑5项直接容器检查，全部通过；补丁fresh解析、第二次严格幂等通过。证据：`output/playwright/canvas-final/cold-start-and-overflow.log`，`failure-details-reader.png`、`long-kpi-reflow.png`。
