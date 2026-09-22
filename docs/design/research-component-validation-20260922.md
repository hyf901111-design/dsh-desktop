# 组件规范落地验证记录

基线：`d797cb43c5fc81efa4cf8ef17f3e5f49d3402215`（当前主分支 1.0.6）。

## 功能分支验证

- 2026-09-22：12 个直接相关 Vitest 文件，354 项通过。覆盖 HTML 沙盒/主题与状态、设计静态检查、个人/共享生成修复、手动框生命周期、生成状态按钮、过程记录、客户端适配与渲染性能。
- 两个基金工作台样例通过 schema、共享状态、设计与真实 runtime 校验，各一次完成。业务预警区嵌套中性来源链接及中性 token fallback 已增加正反例；该验证使用合成模型响应，不代表外部模型已验收。
- Chromium HTML 渲染器：Light/Dark、28px 控件、输入r6/按钮r7、外部作者CSS与动态inline important覆盖、ARIA图标、业务图表/状态保留、输入/计数/重置连续性通过。
- Chromium 完成态：88 项尺寸与颜色断言通过，新增标题右侧注记9/20、主题色、y14及hover不遮挡；原生/HTML壳分层，iframe 内容仍由其宿主渲染器管理。
- Chromium 真实 ResearchCanvas：18 组 Light/Dark × wide/tall/compact × running/stopped/error 通过；鼠标/键盘气泡、停止请求与真实终态、手动重试位置尺寸、表面等于frameBounds、前景锚点、等待00:00、减少动态效果通过。
- 原生首轮回归（集成7fc695f）：已验证620×300及240×620手动框、浅深主题、真实停止/重试与失败保留框体。发现深色过程面板透出下层文本、停止/失败SVG缺少透明填充，已修复并增加多行滚动及真实SVG alpha检查；Chromium增加的8项专项检查通过。外部GLM请求180秒超时，未将其记录为成功生成；后续集成5a2df83包继续完成内容回归。
- 原生第二轮（集成5a2df83）：Kimi K3 Default 真实完成基金筛选表、竖向检查清单和紧凑清单，手动框位置与大小保持；筛选基金乙、固收筛选、重置、显示数值和勾选均实际点击通过。Light/Dark切换保留筛选和勾选状态。新建小框打开过程面板已无叠字，真实停止后方形停止图标清晰、点阵静止、框体保留。
- 上述真实输出发现两处顶部重复题名，增加精确静态校验及一次模型修复反馈。两份真实 HTML 提炼为回归 fixture，移出重复题名后的完整业务脚本不变；连接状态、共享动作、说明和小节标题均保留。已补个人/共享修复的前后 DOM 比对，删除说明、状态节点、控件、业务或改共享脚本等负例均被拒绝。此新增校验的最终打包与在线模型修复结果在集成输出报告记录。
- 原生拉框的屏幕尺寸为620×300、240×620、360×200；当时画布有缩放，持久化世界坐标宽高分别为726.5625×351.5625、281.25×726.5625、421.875×234.375。屏幕尺寸不混写为模型坐标。
- 手动框输入键盘已按原稿对齐 Enter 生成、Shift+Enter 换行；兼容组合键并保护 IME。Chromium 实测两主题真实换行、空提示词/IME 不提交、Enter 提交保留世界边界，专项检查总数增至9项。
- 第三轮（集成110ac745）：真实Enter生成与Shift+Enter换行通过，刷新后原三框世界边界不变。复查发现此包仍由旧渲染器隐藏首个h1/h2，因此“标题看不到”不能证明模型已正确修复；已删除该通用隐藏逻辑，补充主体/括注、head内h2/h3和p.lead的精确识别及说明保留，待新版真实生成复验。
- 用户指出生成背景仍有差异后，改为六套完整Figma点场。1890/740/1575个点分别保留原路径和alpha，phase0与原SVG平均alpha差0.0455–0.0491（0–255），最大5，来自0.001px路径规范化及Canvas/SVG抗锯齿。源/旧/新截图已目视核对。动态沿约9.921px网格流动，7秒与5列/1行方向为实现参数；Figma没有时间线记录，未声称这些是测量值。真实ResearchCanvas另11项专项通过，包括周期端点像素完全一致、停止相位/像素冻结、重试续动、reduced-motion与生成表面背景色。
- 同数据基线：Kimi实际生成的7行持仓表完成后提取原始HTML，按556×400通过生产renderer渲染。已记录表头颜色/位置、名称与代码字重、正变化色、搜索图标、标题注记等偏差，再由来源profile修复；保留未经改写的原产物，不将人工fixture计作真实模型生成。基金指标、持仓、行业与Lumos共4模块253节点/178文本及深色配对证据位于 `output/research-same-content`。

可复验脚本：

```sh
node scripts/verify-research-component-design.mjs
node scripts/verify-research-completed-design.mjs
node scripts/verify-research-generation-design.mjs
node scripts/verify-research-same-content.mjs --input=<实际模型containerSpec.json> --module=fund-holdings --output-prefix=<本次名称>
```

前两个脚本可用 `PLAYWRIGHT_MODULE_PATH`、`PLAYWRIGHT_EXECUTABLE_PATH` 指定已有浏览器依赖；生成态脚本使用 `SHERLOCK_TEST_PLAYWRIGHT`、`SHERLOCK_TEST_CHROMIUM`。证据输出在对应 `output/research-*-design/`。

## 既有失败记录

额外检查 `research-container-chrome.test.ts` 时有16项失败；在未修改的基线主分支上重跑同样是16项，涉及旧尺寸/摘要截断/焦点断言。`research-board-client-adapter.test.js` 基线45项通过；本次仅需将被新状态组件替代的旧文案源码断言改为当前语义，修改后45项通过。另 `research-artifact-resilience.test.js` 的既有“carries web evidence”用例在基线也失败。

这些既有失败作为独立限制保留；本次没有运行全功能测试。实际打包客户端的可见状态与操作结果在集成回归后追加。自动测试通过不等于用户已接受或公开发布。
