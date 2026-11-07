# EWork Odyssey 1.5.0

发布日期：2026-11-07。平台：macOS Apple Silicon。按用户要求签名发布，不进行 Apple 公证。

## 更新内容

- 升级研究工作台生成：优先复用组件库、页签与节点联动，按实际需求和取得的数据组织图表，完善同任务内的纠错与替代呈现。
- 接入登录后可用的 Tushare 数据源，凭证由云端管理；完善 ETF 规模、份额与资金流估算，并按数据覆盖与时效选择合适来源。
- 优化指标卡、排名图和表格的字号、对齐与空间利用；表格支持排序提示和拖动列宽，明细与口径通过页签查看，组件底栏统一显示来源与数据时点。
- 完善探索页四类快速创建入口、主题壁纸和用例演示；修复跨模式进入、全屏评论展开、笔记新建顺序及演示中断，优化自选与行情面板布局。
- 改进笔记原生表格编辑、段落菜单和 AI 修改预览，保护原有正文；演示先展示空行提示与光标，再开始输入。
- 新增本地语义记忆与统一管理入口，可通过全局开关和可编辑 Markdown 文档管理长期记忆，改进项目归属、来源追溯与冲突处理。
- 精简回复状态并支持展开进度与工具记录；用户消息悬停显示时间和操作，空闲时可编辑并重新发送；稳定流式输出，支持手动滚动增加阅读空间。
- 电脑控制插件统一为 Peekaboo 方案，支持启停管理，改进窗口定位、输入与截图流程。
- 新增 macOS 合盖运行与阻止自动睡眠设置；优化浅色语音按钮、侧栏、图片预览切换及画布整理和主题菜单。
- 内置 PPT 制作助手固定为 1.1.3，在原有 1.1.2 规则上增加标题与正文之间一行文字的留白要求。

## Release notes

- Improve research workbench generation by reusing library components, tabs and node connections, organizing charts around actual needs and acquired data, and refining correction and alternative presentations within the same task.
- Add Tushare data for signed-in users with credentials managed in the cloud. Improve ETF size, share and estimated flow analysis, selecting sources according to coverage and timeliness.
- Refine typography, alignment and density across metric cards, ranking charts and tables. Add visible sorting controls and resizable columns, tabbed detail and methodology views, and consistent source and data-time footers.
- Improve the four Explore quick-create entries, wallpapers and guided demos. Fix cross-mode entry, expanded comments in full screen, note creation order and interrupted demos, and refine watchlist and quote layouts.
- Improve native note tables, paragraph menus and AI edit previews while preserving existing text. Note demos now show the empty-line hint and caret before typing.
- Add local semantic memory with a global switch and an editable Markdown document for managing long-term memory. Improve project attribution, source tracing and conflict handling.
- Simplify reply status and expand progress and tool records on demand. Show user-message times and actions on hover, allow editing and resending when idle, stabilize streaming output, and support extra reading space through manual scrolling.
- Consolidate computer control into the Peekaboo plugin with enable and disable controls, and improve window targeting, input and screenshot handling.
- Add macOS closed-lid operation and automatic-sleep prevention settings. Refine the light-theme voice button, sidebar, image preview navigation, and canvas arrangement and theme menus.
- Keep the bundled PPT assistant at 1.1.3, adding one line of space between headings and body text to the existing 1.1.2 rules.

## 发布范围与验证

- 产品基线：已验收并晋升的 `90904276aa3bf796828d8c3d5356329d63a7c112`。
- 独立分支与实验按 [本次范围记录](../superpowers/parked/2026-11-07-release-1.5.0-scope.md) 保留，不混入验收版本。
- 保留 Developer ID 签名、旧更新通道兼容签名、包完整性和双通道差分校验；不执行 Apple 公证或旧客户端全量升级测试。
- 发布结果与校验记录将在验证完成后补齐。

证据目录：`release-cloudflare/1.5.0/`。
