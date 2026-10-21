# Workbench Announcement Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 防止真实公告组件把不匹配来源或范围外记录作为已核实内容交付，并继续验证完整金融工作台生成效果和耗时。

**Architecture:** 沿用工具结果采集、来源接纳、单次有界内容修复的既有链条。在真实公告记录与明确日期窗口处收紧校验，不固定模板、不编造数据、不重复取整套数据。根 agent 运行真实客户端同范围复测，独立实现 agent 处理可复现的公告问题。

**Tech Stack:** JavaScript runtime、Vitest、Electron 原生客户端、现有宿主来源记录。

**Spec:** `docs/superpowers/specs/2026-10-21-workbench-announcement-range.md`

## Global Constraints

- 完整研究对象必须保留，不以静态渲染成功代替内容／数据验收。
- 公告日期与列表展示日期不能互换；未知／模糊时间不补造。
- 用户明确的窗口不能通过修改标签绕开；不要静默删条后保留错误计数或完整覆盖声明。
- 不削弱其他来源身份、数值、工具或刷新绑定校验，不改造无来源约束的普通／模拟时间线。
- 只运行直接受影响的聚焦检查。保留旧看板与笔记；不得修改签名应用、用户配置或凭据。
- 只在集成 worktree 构建本地签名测试版，不推送、不发布、不晋升 main；每项改动通过相关验证后中文本地提交。

## Review Focus

- 原始 noticeDate 与列表展示时间跨日时仍使用正确字段；补同条不同日期回归。
- 相同网址对应冲突记录、公司不同或标题相似时不能误认；补歧义与错误公司回归。
- 日期缺失、非法日期、带时区 ISO、边界日不应被误补或误筛；补边界与未知日期回归。
- 用户明确窗口与模型自报窗口冲突时，不接受扩大标签；补可信请求窗口回归。
- 普通／模拟时间线、无公告源和其他 feed 必须保持原接纳边界；补不相关路径回归。

### Task 1: 修复已取得公告的来源与范围接纳

**Files:** 主要为 `packages/dsh-research-task-runtime/announcement-provenance.js`、`component-source-binding.js`；必要时最小修改 `index.js` 的调用点以传入已有可信任务上下文；新增专用测试或扩充 `test/component-web-snapshot-evidence.test.js`。不要修改笔记、UI、共享客户端或其他生成格式合同。

**Interfaces:** 消费现有 observed records（public_data_query/eastmoney-announcements 的真实响应）、实际 artifact 与宿主保存的 panel request；产出与既有内容修复路径兼容的明确错误信息或已证明不改变语义的元数据恢复。公开函数签名优先兼容；新增可信上下文参数必须由宿主调用点供给，不能相信模型自己标注的来源或日期。

- [ ] 先追踪原始工具结果和实际 artifact 从 collector 到 accept/recovery 的调用链，确认 timeline 怎样绕过 feed identity 及明确窗口。只读报告实际证据，不读取 private reasoning 或凭据。若旧材料不足，使用测试夹具证明代码路径，并明确区分实际数据观察与合成边界测试。
- [ ] 建立 red 回归：实际 21 条公告中的 11 条落在声明窗口外时不能作为完整有效快照交付；同条 noticeDate 与展示时间、冲突源、三家公司覆盖、明确请求窗口不被改标签绕过、未知日期、普通时间线均覆盖。
- [ ] 最小实现来源／范围检查并接入既有有界修复。仅基于已取得事实恢复展示元数据；不能猜日期或手工删除失败对象来提高成功率。对自然语言无法可靠确定的窗口诚实保留边界，不能以模糊解析发明日期规则。
- [ ] 运行直接相关 source-binding/web-snapshot/timeline 聚焦检查和 diff check。红绿证据、实现决策、实际／合成夹具边界写入任务报告。
- [ ] 自审并中文提交，仅自己的文件；不构建、不派生其他 agent。交根 agent 做独立规格／代码审阅，必要时修复后复核。

### Task 2: 完整真实工作台与本地交付验收

**Owner:** 根 agent。当前客户端集成 `e66e538b`；原生同范围新请求名称「算力产业链·优化复测1021B」，已启动。仅名称与旧需求不同，不预先指定模板或降低模型档位。

- [ ] 读取真实持久化任务／工具结果与 UI，记录规划、首卡、全部终态、数量和失败；不可因观察超时而重启任务。
- [ ] 逐卡核对公司、期次、单位、来源、走势曲线与相对强弱、日期范围、新闻同条对应、静态／绑定状态和标题／筛选／详情／布局。安排覆盖画布全体组件的整理和滚动检查。
- [ ] Task 1 与其审阅完成后，按运行手册交接到现有未验收集成批次，通过清单检查，从集成 worktree 本地签名构建／包检查，真实客户端复测受影响组件；必要时再做新完整任务，保留此前结果便于比较。
- [ ] 记录证明的改进与仍未取得的数据／未达成的耗时目标。未通过的完整研究范围不能因单卡 ready 或窄测试而改记完成。

### Task 3: 保留完整字段的有界交互行情宽表

**依赖：** Task 1 已提交后可实现，独立审阅可同时进行；必须在 Task 2 最终本地交付前完成。

**Files:** `packages/dsh-research-task-runtime/artifact-output.js`（sourced table路由）、`template-data-contract.js`（共享tableColumns=32、tableRows=100及提示/shape校验）、`market-artifact.js`（同限验证，必要的表格内容区样式）；扩充 `test/research-artifact-resilience.test.js` 或新建专用宽表回归及浏览器测试。不改原生 `artifact-validator.js` 或客户端原生table schema，不修改公告或笔记。

**Interfaces:** `acceptArtifactOutput(text)` 对合法带asOf或note的generic table路由为保留model的 `market/table` HTML；模板共享限制与拒绝原因供接纳、renderer、模型生成/修复提示使用；现有market table也使用同一列/行上限。依据实际13列产物构建fixture，明确为渲染证据，不是新一次在线取数。

- [ ] 先用 `/tmp/compute-b-quote-raw-artifact-20261021.json` 固定真实13列、4行产物，建立red：accept为interactive HTML、retained model所有值/列/asOf/note完全一致；当前应失败而非仅断言常量。
- [ ] 最小实现1–32列、1–100行的共享可信表格shape限制；sourced generic route不再先过native12列parser，但version/title/columns/rows/cell/extra/asOf/note仍严格验证，不能因新分支接受既有非法输入。无来源表格native12列规则保持不变。
- [ ] 边界测试32通过、33拒绝、100行通过/101拒绝、无来源13列仍按native拒绝、空/错宽行、布尔/对象/null/NaN等非法cell、超长title/label/cell/metadata、额外字段拒绝、原有三列表和两种合法object-row规范化行为保持；共享合同提示明确列/行上限。所有值含零/负数/精度/长报价时间原样保留。
- [ ] 使用现有隔离headless浏览器测试模式，在窄/宽尺寸和深/浅主题验证真实13列：首屏有正文、表头/单元格默认单行、表格横向滚动能到最后报价时间列，搜索/排序有效，列宽pointer/keyboard调整及手动缩窄后的换行仍可用，工具栏/备注不因表宽横向溢出。浏览器用独立fixture，不能操作运行中客户端。
- [ ] 运行直接相关artifact-resilience、table contract/market renderer和新增浏览器回归及diff check，记录真实fixture与合成边界的区别，自审后仅提交本任务文件，中文本地提交。禁止构建、启动、重启共享应用或派生agent；写task-3-report.md交root审阅。

**Binding constraints and review focus:** 保留全部字段和原始数值，不能静默删列／截断；原生12列合同保持不变；1–32列/1–100行只在可信交互模板路径放宽，shape、字节/文字容量和来源校验不削弱；水平滚动只在表格区；普通/来源表分别验证；相关聚焦测试，不运行全功能测试、不修改共享客户端。未绑定表格不能声称自动刷新。

## Native 基线B内容核验补充

同一已保存任务由实际客户端发送并完成，原始证据 `/tmp/compute-b-native-benchmark-20261021.json`、`/tmp/compute-b-artifact-models-20261021.json`。`一键整理画布`真实反馈已整理6个组件，滚动检查覆盖顶部到底部。行情回退纯文字导致一列跨越多屏，交互宽表修复前不能将这套排版记为通过。

- 公告/新闻实际先搜索两次DataYes目录、读一次目录，然后6次网页搜索；没有web_fetch，没有实际公告/新闻业务响应。单次修复也没有补取资料，最终正确失败；诊断文字“只有接口文档”未完整表达已有搜索摘要，但搜索摘要不足以证明原文和精确日期。两子会话分别 `36a38936-eeb6-48c2-8a5f-73d8c9d5e515`、`2e642d2c-2aca-485b-8af2-6b49795a3403`。原始产物还混入范围外背景和“约10月16日”推测日期，不能放行凑6/6。
- 财务主数据的同报告期逐项核验发现：新易盛2026-06-30实际 revenueYoy=100.3392、niAttrPYoy=90.9844、grossMargin=48.4397、roeW=34.86，产物却写282.64/355.68/47.43/38.12（其他期数据）。工业富联同期grossMargin=7.1507、roeW=13.36，产物写6.60/7.64。营收/归母利润绝对值、披露日期本次匹配，但不能抵消上述错期。
- 财务卡宣称调用getFdmtCFLT并列出三个经营现金流净额；实际成功业务调用只有getFdmtMainDataLt及getFdmtISLT2018。三个现金流金额在全部成功工具文本均无对应记录；最后只有一次现金流接口目录搜索。不得将该列视为已取得。安全证据 `/tmp/compute-b-finance-safe-tools-20261021.json`。
- 未来日历混入过去报告期2026-09-30，且把“未取得解禁记录”的缺口备注放在2026-10-21算作1项安排；页面称6条来源日程，不能证明6个真实未来事件。
- 父会话宣称行情“每分钟自动刷新”，实际完整字段表已回退静态、未绑定；宿主应提供/传递实际降级状态，不能以计划的publicData绑定代替最终绑定结果。

这些为真实复测新发现，尚待各自聚焦修复，不并入公告/宽表提交，不记完整金融工作台通过。

### Task 4: 财务表同期间字段来源核验

**依赖：** Task1修复轮与Task3实现均提交后再执行，单implementer；root可同时审阅/记录，不能同时修改同文件。

**Files:** 新增focused `packages/dsh-research-task-runtime/statement-table-evidence.js`，最小接入 `index.js` 现有来源校验/单次修复路径；必要时复用/导出 `observed-statement-growth.js` 中已证明的精度工具，但不大改既有计算逻辑。新增 `test/statement-table-evidence.test.js` 与actual来源fixture，不改UI/notes/native schema。collector/repair证据如有必要只做已证实的最小改动并报告。

**Interfaces:** helper消费实际source records、模板结构和宿主panelRequest，返回具体field/company/reportPeriod错误或undefined；只触发已观察到DataYes getFdmtMainDataLt/getFdmtISLT2018等正式财务数据的table/market.table，error artifact/missing fields不伪造。generic和retained HTML应同门禁，最终fallback不能越过新事实检查。保留原有一次repair预算与数据工具权限。

- [ ] 从 `/tmp/compute-b-finance-safe-tools-20261021.json` 和 `/tmp/compute-b-artifact-models-20261021.json` 提取实际完整成功调用/响应和原始表，记录无private reasoning、真实观察与合成边界。先red证明旧Runtime交付错误同比分期/ROE/毛利率/无依据现金流。
- [ ] 使用明确证券代码（含SH/SZ/XSHE/XSHG）和实际报告期字段，匹配同期间记录；毛利率grossMargin、加权ROE roeW、revenueYoy、niAttrPYoy、nCFOpa不能跨期/跨公司。对请求明确没有实际现金流查询、表却声称有金额的已复现输入返回具体缺口。代码应区分绝对值和同比、口径和日期，不以“数字在整份响应出现过”判真。
- [ ] 合成回归：同报告期正确数据、两位/更多位显示精度、零和负值、元/万元/亿元换算、单列“金额/同比”组合、独立列、来源字段null与明确缺失、跨公司同值、其他期同值、冲突修订/口径、未知证券/期间或含糊字段、明确其他来源、模拟表、非财务行情/普通表均覆盖。不从财务比例倒算缺失现金流；未知结构保守说明限制，不能误称已证明。
- [ ] 新门禁位于单次有界repair和最终成功之间，具体证据能让下一轮纠正/实际补查缺失字段；已有数据复用，生成失败不得被readableFallback改成成功。Runtime回归分别覆盖首次错误第二次修正、两次错误终态failed、取消/原预算和所有公司/列保留。不得以删字段/删公司/新一轮完整研究提高通过率。
- [ ] 相关statement evidence/growth/operating/source binding/runtime聚焦验证和diff check；不运行全功能测试、不构建、不操作共享客户端、不派生agent。自审，中文本地提交own files，完整报告写task-4-report.md，返回短状态。

**Binding constraints and review focus:** source row的证券、期间、口径和字段是事实依据，不以展示标签或API名称作为业务证据；不猜日期、不发明数值、不静默改写成不同指标；保留全部对象和字段，缺失诚实显示；明确未知结构和其他来源边界；不改变既有模拟/普通表行为；原一次repair预算、fallback失败边界、取消语义必须保留；禁止全功能测试和功能worktree构建。

### Task 5: 原生行情表保留日期备注和来源入口

**依赖：** Task4已提交，审阅可同时只读进行；本任务不改runtime来源helper。

**Files:** `scripts/lib/research-market-native-table.mjs` 的parser、React原生renderer与现有CSS；`test/research-market-native-table.test.js`、`test/research-market-native-interaction.test.js`及必要专用隔离浏览器测试/实际fixture。不得构建/操作共享客户端。实际B估值/财务artifact在 `/tmp/compute-b-artifact-models-20261021.json`，人工修正的Task4fixture只作渲染样本，不能冒充在线正确取数。

**Interfaces:** `parseResearchMarketNativeTable(html,doc)` 保留现有columns/rows/variant/simulated，增加宿主已渲染footer的纯文本语义与安全来源链接投影；React用文本/安全anchor渲染，不执行HTML，不解析未知脚本，不提升任意页面权限。保持原生文本优化与原有search/sort/selected readout/列宽安装器。不能无损投影时返回null让现有完整sandbox路径显示。

- [ ] 先red固定actual估值model的asOf和note，证明旧parser/renderer丢来源日期和PECTTM扣非、PB年报等口径；fixture为已经观察的数据，未再在线请求。另覆盖无footer、note-only、sources链接、单元格详情链接。
- [ ] 最小实现完整footer/链接投影与可读的备注区，保留原精度与行数据，不以字符串truncate隐藏说明。危险protocol、用户信息URL、任意HTML/scripts、未知/无法无损投影的组合不能变为可信客户端交互；沿用既有http/https安全边界。OpenTerminal仍返回null，>12列仍走完整HTML，普通native schema不改。
- [ ] 相关回归验证escaped文本、2000字说明、无说明/空sources、深浅主题、窄/宽视口、全量备注能滚动读取、页面无横溢、首屏有表内容、筛选/排序/行点选仍有效，表格与备注不遮挡。链接保留原href，由客户端既有链接拦截处理，不新增系统浏览器默认打开行为。
- [ ] 复用现有isolated headless模式实际验证原生React组件与列宽installer；不得运行liveapp/CDP。运行本任务table parser/interaction及宽表直接受影响聚焦文件与diff check，不运行全功能测试；中文本地commitownfiles，自审和完整日志路径写task-5-report.md，交root独立审阅。

**Binding constraints and review focus:** 来源、日期、口径、完整备注/链接不得被原生优化静默删除；不推断新日期/来源/数值，数据值保持；原生12列/宽表32列/200KB与OpenTerminal合同不变；保留原生文本及既有交互，无法无损时sandbox回退；长备注不挤坏内容/工具栏，深浅宽窄可访问；只安全http/https链接，无HTML执行/权限提升；聚焦测试，不构建/操作共享客户端。


### Task 6: 工作台模型子卡遵从可信人类来源策略

**Files:** 新增 `packages/dsh-research-task-runtime/workbench-source-policy.js`（纯策略解析），最小修改 `workbench.js`、`index.js`、`component-source-tools.js`；扩充 `test/workbench-source-context.test.js`、source-tools/SDK适用测试，必要新增 `test/workbench-source-policy.test.js`。不改Notes/native/feed/calendar/collector，不改模型档位或预算。

**Interfaces:** `workbenchSourcePolicy(originalRequest, panel)` 返回冻结的 `{pluginRequired,pluginProhibited,preferenceRequest}`；panel包含当前title/type/prompt。只能在workbench.js已捕获真人originalRequest的路径产生，由Runtime内部hostContext参数传递给任务/SDK和最终门禁；不增加公开start JSON可接受参数，不信任模型originalRequest/marker。字段命名和持久化接线可按既有内部上下文模式最小调整，但这三个策略含义一致且只有一个计算权威。没有hostContext时沿用既有独立组件语义。

- [ ] 先RED复现：真人未限来源、模型panel声称必须DataYes、实际已取得网页原文时，不应被最终插件门禁拒绝；SDK不应把模型路线说成用户指定。检查最终可见产物而非只检查策略布尔值。
- [ ] RED反向约束：真人全局明确DataYes或禁止插件时，模型不能删掉/反转该限制；人类“估值卡用DataYes、新闻走网页”分别生效，已有another-card-source回归保持。可选/优先/允许替代不误作强制；引用、模型伪造marker/字段不能建立真人约束。原实体/字段/类型不能因策略解析消失。
- [ ] 最小实现纯策略+可信捕获/内部传播/存储恢复与原门禁/SDK统一调用；专业财务字段仍可优先真实插件，不制造免费源可覆盖的假象。sourcePolicy不参与工具可见性授权。发生含糊真实限制时明确保守报错，不能默认覆盖人类要求。
- [ ] 覆盖batch/非batch、同任务一次repair、持久化后未改需求retry、真实改需求retry、状态询问不替换原快照；旧任务、standalone、模拟、prepared/publicData原路径保持。不会让模型或HTTP start注入新字段。
- [ ] 仅跑上述policy/context、直接SDK/source-tools和适用Runtime聚焦测试、syntax/diff，自审后中文本地提交ownfiles，报告task-6-report.md。禁止全套/真实SDK/网络/凭据/共享客户端/派agent。

### Task 7: 真实文章时间线复用逐条核验与有界补读

**Files:** `component-feed-acquisition.js`、`component-source-binding.js`及最小`index.js`接线；必要新增小型文章投影helper；`workbench.js`仅为已有内部hostContext增加可信原始需求/数据模式。扩充 `test/component-feed-acquisition.test.js`、web-snapshot/source-binding与专用Runtime测试，不改Task6来源策略/Notes/native/calendar。

**Interfaces:** 现有 `componentFeedEvidenceIssue(text,records,options)`、`componentSnapshotEvidence`、`retainVerifiedFeedItems`与`acquireFeedSourceEvidence`在host options内识别真实文章类timeline；time只做明确原文日期的等价比较，不修改原值。与Task6内部来源策略共同工作，但不以source选择代替每条证据。Task6的hostContext增加可选 `workbenchRequest:{originalRequest,dataMode}`：由真人创建捕获+validated input产生，originalRequest≤8000，dataMode为source/simulated（默认source），验证/持久化/恢复/每次adapter传播/未改需求retry保留，真正改需求则清除；不增加公开start参数或marker推断，Task8复用此接口。

- [ ] 先RED：真实新闻子卡返回timeline，同条标题/时间/URL尚未取得原文不得直接接受；已发现Sources URL应触发一次补读并交原记录门禁。显式区别B安全journal/未核验输出与合成网页fixture，不读private reasoning。
- [ ] 实现已观察安全链接补读与同条身份核验，保留6页/并发3/20秒/30KB及一次repair。未知/约日期、公司/标题/URL冲突拒绝，Task1公告窗口不弱化。无有效条目失败，有效条目和完整缺口可沿既有fallback保留；不得静默删公司/类别或留错误计数。
- [ ] 真实文章timeline仍遵守明确原始/声明日期窗口：有来源的窗口外背景不能计作近期记录，保留到完整note且说明不计入；不改人类窗口、不猜相对日期。沿既有明确窗口工具最小复用，不新增任意时间NLP。
- [ ] 对照普通活动timeline、模拟、用户提供原文timeline、既有news/reports；覆盖已读不重复、未知/私网/凭据URL不补读、取消/超时/部分来源、第一次取证第二次完成与错误终态。最终可见标题/原日期/原URL/note证据与已核验来源相同。
- [ ] 跑直接受影响feed/web-snapshot/announcement与专用Runtime聚焦文件、syntax/diff，自审中文本地提交ownfiles，报告task-7-report.md；不全套/在线/构建/操作客户端/派agent。

### Task 8: 未来日历事件、背景与缺口分别展示

**Files:** 新增小型 `packages/dsh-research-task-runtime/calendar-event-evidence.js`，最小`index.js`接入已有repair；专用 `test/calendar-event-evidence.test.js`及calendar renderer直接验证。既有schema/renderer仅在有实际缺失接口时最小调整，不改历史/模拟日历、feed/Notes/native。

**Interfaces:** `calendarEventEvidenceIssue(data,request,records,{now})`返回具体问题或undefined；now由Runtime this.now提供，不由model asOf。消费原source records业务日期；已知getEquReportPredisclo的preDate为披露事件，endDate/update字段不冒充发生日。

- [ ] 从安全B日历journal/冻结model提取原证据：三家公司preDate 10-24/10-30/10-30，另两个非事件项为报告期09-30与当天无解禁记录说明。先RED说明旧Runtime可把后两项作为未来事件成功交付；不重新在线取数。
- [ ] 对明确未来/明确窗口的真实请求施加事件日期及缺口语义检查，给现有repair清晰证据。保留三个原事件、待定会议和全部公司/事件类别缺口，背景/缺口移入完整note不计数。缺源与已证明无事件不同，不能伪造日期/记录或仅删失配项绕过保留。
- [ ] 测试用户历史窗口/模拟/普通日历不改变，host时间跨日、边界、非法/约日期、模型asOf绕过、正确二轮修复/仍错failed、无第三次、取消；从最终HTML读事件数/日期和note，不能仅看model。
- [ ] 仅calendar/helper/Runtime直接聚焦、syntax/diff，自审中文commitownfiles，完整task-8-report.md；不全套/SDK/网络/构建/客户端/派agent。

### Task 9: 生成完成卡反映实际刷新状态

**Files:** `scripts/lib/research-workbench-feedback.mjs`、`component-data-status.mjs`，必要`research-generation-watch.mjs`/`component-data-refresh.mjs`接线；`workbench.js`/`workbench-execution-policy.js`仅accepted receipt与短提示。扩充对应workbench-feedback/actions/browser、component-data-status/monitor与直接generation-watch测试，不改creation布局/分类或旧用户消息。

**Interfaces:** 现有 `createComponentDataStatusStore`增加稳定只读` snapshotSession(sessionId):{ready,rows}`和`subscribeSession(sessionId,listener)`（名称可等价，语义不可变）；复用其原host list/push与publishNative数据，不新增poll。`workbenchProgressState`/React通过该真实摘要补充状态，不把敏感来源内容写入generation snapshot。原publisher/receiptAnchors身份与归属保持。

- [ ] 先RED：计划每分钟但实际静态完整表时，反馈不能声称已自动更新；已保存recipe/成功或失败则分别显示。null/尚未载入不是未绑定；builtin未挂载不是静态；inactive/Notes显示上次观察。原“生成中/已完成/重试”、新消息后的归属与Notes复用保持。
- [ ] 最小加入真实组件终态/recipe摘要及补充文字，区别静态、手动、暂停、已配置未成功、最新成功/失败；保留读取就绪与last-observed，不新增轮询或模型调用。accepted receipt/短提示明确刷新配置待确认，不能由计划承诺已生效；prepared/accepted原含义与重试幂等保持。原会话历史不重写，相关卡片随所属轮次留位。
- [ ] 使用真实workspace/feedback挂载、fake transport测试混合静态/绑定、停止/部分失败重试、新消息和切Notes；深浅/窄宽状态文案不挤坏动作区。聚焦检查、中文commit、报告task-9-report.md，不全套/在线/构建/派agent；root另做Task2真实客户端验收。

## 后续执行顺序与交付门禁

Task6 → Task7 → Task8 → Task9，各自实现提交后独立复审；只读上一任务复审可与下一源码writer并行，一个源码writer。Task1/3/4/5已闭环，不重复派发。Task9接口已沿generation-watch→feedback与componentDataStatusStore窄查，派发时同时读取task-9-interface-prebrief-draft.md中的actual接口证据与上述正式约束。全部来源/日历/UI修复审阅后统一交接到现有集成，按Task2/本地runbook构建、真实六项复测与完整画布整理/滚动。仍有缺口继续记录，不把测试通过改成全目标完成。
