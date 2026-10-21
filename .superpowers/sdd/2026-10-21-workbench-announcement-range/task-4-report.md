# Task 4：财务表同期间字段来源核验

状态：完成实现与聚焦验证，等待 root 独立审阅/集成。开发基线 `a409caa1`。没有构建、启动、重启或操作共享客户端，没有修改 UI、notes、native schema，没有运行全功能测试，没有派生 agent。

## 改动范围

- 新增 `packages/dsh-research-task-runtime/statement-table-evidence.js`：只在已实际观察到正式 DataYes 财务成功记录时，对已知财务 table / market.table 字段执行守卫；retained HTML 模型走相同守卫。
- `index.js` 最小接入原有一次 repair，给出具体公司、报告期、字段与来源数值/缺口；原工具权限保留，只允许补查缺失事实；最终成功、verified snapshot、readable fallback 和外层异常降级均不能绕过守卫。
- `observed-statement-growth.js` 复用/导出既有 BigInt 十进制精度工具，金额显示精度上限由 6 位扩至 12 位；同比工具新增可选精度，原调用默认两位保持一致，不改变原有修复逻辑。
- 新增 73 项专用测试及实际来源 fixture/README。

## 实际来源与合成边界

逐字节复制 root 提供的 `/tmp/compute-b-finance-observed-business-20261021.json` 至 `test/fixtures/statement-table-evidence/compute-b-observed.json`，SHA-256 两端均为 `9d2199213832a0788914f531b937884f6d9af48a14783400652d336947cb780c`。

包来自实际 B 子会话 `e4e5a1d6-30c4-484b-92aa-6af1e4ca649e` 的 6 次公开业务调用/响应和原 artifact。MainDataLt 三次各 6 行；ISLT2018 分别 28/24/20 行，合计 90 行。没有 private reasoning，没有新的在线请求。中际旭创利润表携带已有无损 projection，测试仅通过生产 `expandBusinessEvidence` 恢复原有 defaults；没有按请求或展示名称猜测证券身份。

真实观察明确证明：

- 新易盛原表的同比 282.64% / 355.68%、毛利率 47.43%、ROE 38.12% 来自 `endDate=2025-06-30` 的比较期记录；该记录的 `endDateRep=2026-06-30` 不能当成数值期间。本期相应源字段为 100.3392 / 90.9844 / 48.4397 / 34.86。
- 工业富联原毛利率 6.60%、ROE 7.64% 也来自比较期；本期源字段为 7.1507 / 13.36。
- 工业富联接口 `revenueYoy=54.635` 按接口数值两位显示为 54.64%；由原始金额 557860645000 与 360759653000 精确计算同比，两位为 54.63%，四位为 54.6350%。这两种口径不混用。其归母净利同比按原金额两位为 95.99%。
- 实际没有 CFLT 调用，不能证明任何原表现金流金额；MainDataLt 中 nCFOpa 的比例/同比字段不能倒算成金额。旧 asOf 声称 CFLT 实际成功、note 声称无缺失，也必须纠正。

测试 `corrected()` 是人工写定的修复期望，现金流列逐公司标记未取得，其余值取完整实际来源；不是新的模型/客户端验收结果。其它 source row 修改、跨公司同值、负值零值、冲突修订、模拟/其他来源、超量证据等均为明示合成回归，不冒充实际观察。

## 核验与一次修复行为

- 身份：明确完整 SH/SZ/XSHE/XSHG 证券代码；源行 ticker + exchangeCD + secID 必须一致。不用请求 ticker、公司名称或数字碰巧相同来补证。
- 时间：展示实际报告期对应源行 endDate，分离披露日期/endDateRep。跨公司、跨期、冲突修订、不同口径、未知证券或日期返回具体无法核验原因。
- 字段：grossMargin、加权 roeW、revenueYoy、niAttrPYoy、nCFOpa；当表格触发该守卫时，同时检查已知营业收入/归母净利金额。独立列与“金额 / 同比”组合列均支持。元/万元/亿元和百分比不混用，保留零/负数，null/缺失不补造；已取得的值不能用缺失标记逃避核验。
- 计算同比：只接受同份披露、相同报表口径/币种/会计标准、同公司本期与上年同期原始金额，最后按展示精度舍入；缺少比较期时“计算值”标签不能借用接口直取同比。零或负基期不伪造普通增长率。
- 修复：只用既有一次预算，不新开完整研究。保留原公司、原报告期、原列；第二轮 markdown、无 retained 模型的自定义 HTML、删公司/列/报告期均失败。正确 retained 表模型可通过；error artifact 仍由既有错误流程处理。
- 来源声明：对已复现的未成功调用 API 声明、缺失与“无缺失”矛盾、未逐行对应的已知 API 字段数值说明进行拒绝/提示同步修正，不对任意散文进行通用事实审查。
- 权限/预算：取消保留 cancelled；修复 timeout / aborted / max-tokens 不产生第三轮；修复抛错不得把 readable fallback 标成功。
- 修复证据：约 48 KB 上限，逐调用轮流选取字段行，明确 receivedRows/selectedRows；省略不代表完整来源缺失，完整记录仍用于守卫。实际包的 90 行已知字段可全部容纳。

## Red / Green 证据

成功与失败输出均已落盘，以下退出码指 Vitest 自身（最早几次 shell 随后 cat 日志时 shell 返回 0，不混作测试成功）。

1. `/tmp/task4-red-runtime.log`：退出 1；原始完整表在旧 Runtime 中 `completed`，与要求 `failed` 冲突，证明真实旧缺陷。更早一次测试启动参数写错已纠正后重跑，不把 setup 错误当 RED。
2. `/tmp/task4-green-runtime.log`：退出 0，首次守卫实现通过该运行时拒绝测试。
3. `/tmp/task4-red-boundaries.log`、`/tmp/task4-red-boundaries2.log`：退出 1；分别证明显示精度、用缺失逃避、删全部财务列、Markdown/HTML 降级、旧正文数字声明等边界缺口。
4. `/tmp/task4-red-last-boundaries.log`：退出 1；证明不能用接口值冒充计算值、未知长表结构不能静默证明。
5. `/tmp/task4-red-precision.log`：退出 1；证明四位计算精度不能先四舍五入为两位、修复不能改写来源绕过。
6. `/tmp/task4-red-period-retention.log`：退出 1；证明不能把整个财务行静默切到另一个报告期。
7. `/tmp/task4-red-evidence-bound.log`：退出 1；证明未加总容量上限时修复证据超限。
8. `/tmp/task4-red-source-boundary.log`：退出 1；证明宿主模拟禁令与模型擅改另一来源不能成为豁免。
9. `/tmp/task4-red-computed-identity.log`：退出 1；证明两个期间同时缺少会计标准/报表类型/期间长度不能当成同口径已证明。
10. `/tmp/task4-focused-final.log`：退出 **0**，最新源码 **9 文件、533 项全部通过**。完整命令如下。

```sh
npx vitest run test/statement-table-evidence.test.js test/observed-statement-growth.test.js test/statement-evidence.test.js test/statement-operating-coverage.test.js test/component-source-binding.test.js test/research-task-runtime.test.js test/component-source-projection.test.js test/research-artifact-resilience.test.js test/workbench-sourced-table-delivery.test.js
```

中间相关运行曾捕获 `observed-statement-growth.test.js` 的原有 freely-named-column 运行时路径回归：没有直取同比字段，但存在完整同份披露原金额的有效计算，以及百分比括注。当轮修复采用严格同份原金额验证后重跑全体上述聚焦文件通过。该问题已解决，没有修改原测试断言。

`/tmp/task4-fallback-delivery-final.log` 是之前额外运行 fallback/delivery 两文件的 33 项通过记录；最终上述合并检查已再次覆盖。`git diff --check` 通过，fixture 两端 hash 一致。

## 已知边界与自审

- 这是窄范围财务事实守卫，不是“所有表格已证明准确”标志。未观察到正式业务记录、普通表/行情表、宿主明确要求的模拟表及明确其他来源不由本守卫推定财务事实；不能由模型 title/asOf 自行申请豁免。宿主的“不要/不用模拟”不是模拟许可。
- 不支持的长表/含糊指标/无法识别期间保守报无法核验；没有把未知结构自动改成另一种 UI，未知来源和未知字段不冒充已证明。
- API 字段列表式数值正文（例如原 note 的 grossMargin(...) 多公司数字串）不能逐行对应时提示同步核对，把字段数值保留在可核验表格中，并保留来源/口径/限制说明；未实现任意中文散文的语义事实审核。
- 此任务保留原字段名称约束，主要修复数据/来源说明；不以删列、删公司、换期、降级文字或再做完整研究过门禁。
- 不新增现金流获取 API 推断、凭比例计算现金流或猜测 unknown identity；有实际新查询时仍使用原始授权工具/collector；没有修改 collector。
- 没有客户端可见验收、在线成功率或最新行情主张；这些由 root 后续授权流程验收。
- Task 3 已报告的 6 个既有非本任务失败未修复、未隐去；本任务没有重跑其无关失败文件，详情保留于 `task-3-report.md`，本报告不宣称全套测试通过。

本地中文提交只包含本任务 helper、最小 index/精度接口修改、专用测试、fixture/README和本报告。提交后停止源码编辑，交 root 独立审阅。

## Task 4 fix round1（恢复轮，2026-10-21）

状态：五项 Important 已修复并完成本轮聚焦验证；等待 root 独立审阅。本轮起点为干净的 `da057cf370bfaa49c7b255a8346ea783b50e7044`，branch `codex/feat/openterminal-style-20261019`。在同一功能 worktree 中由唯一源码 writer 完成；没有混入另一 worktree 的 Notes 源码，没有派生 agent，没有构建、启动或操作共享客户端，没有真实 SDK/模型/网络调用，没有读取凭据或 private reasoning，没有运行全功能测试。

### 五项根因与修复

1. **retained 模型与可见 HTML 脱节。** 原接纳路径会原样保留 HTML，模型中的正确值不能证明正文。`artifact-output.js` 现在仅对 retained `table` / `market.table` 读取结构化数据，经过原有 normalize/parser/可信 renderer 重新生成整个输出，不保留模型提供的旧 HTML。`finalText` 对这条确定已重建的表格路径按宿主 renderer 处理；其他自定义 HTML 仍走原共享状态/设计校验。第一次实现只重建而仍按原 custom HTML 校验时，新可信脚本被误判缺共享状态（`/tmp/task4-round1-retained-diagnostic.log`），已按实际内容来源修正；没有扩大到其他 retained 模板。
2. **raw 字段未进入门禁。** 为已知 `grossMargin`、`revenueYoy`、`niAttrPYoy`、`roeW`、`nCFOpa`、`revenue`、`nIncomeAttrP` 提供精确映射，支持已有单位标签。可辨识但不能映射的财务字段、raw 长表结构返回明确“含糊/无法核验”，不能静默判作普通表。提前捕获原表后，unsupported 长表检查仍须运行，不能因 `requiredData` 存在而跳过。数量/行情、宿主模拟许可及明确其他来源的旧边界保持；不把仅有中文金额列的普通旧路径整体扩为新门禁。
3. **独立披露日期未纳入身份。** 独立的披露/发布/公告日期列需为合法 ISO 日期，并与同公司、报告期、口径的源披露对应；嵌入与独立日期矛盾拒绝。逐字段 candidates 仍要求所选来源的 publishDate 对应。不把披露日期作为 endDate。原 fixture 的“报告期 / 披露日期”组合列保留原解析：扩展检查曾发现组合列被误认成纯披露列而产生 6 项失败（`/tmp/task4-round1-statement.log`），修正分类后原 actual 正确表及其 retained 表全部通过，未改 fixture/期望数据。
4. **同行口径未参与选源。** 逐行识别合并、母公司/非合并以及明确 `mergedFlag`，与表级口径合并；冲突或显式未知口径拒绝，即使单元格写成缺失也不豁免。不同口径的行分别按源行 mergedFlag 校验；没有选第一条来源值。合成的合并 48.44% / 母公司 12.34% 双行表可完成，交换值则失败。
5. **只有财务校验先失败才保存约束。** 在所有 source/binding/operating 等可触发 repair 的校验前捕获相关表数据；保留当次全部相关表（不只第一个）的全部列、公司及各自原报告期。最终门禁、snapshot/fallback 继续使用原约束。实际 finance + 明示合成 operating 补充的反例现在无法删除财务列/公司/期间；保留并修正的表仍在第二次完成。单次 repair 预算和工具权限不变，取消/error/异常 fallback 旧回归保留。

### RED / GREEN 与命令、退出码

所有命令均直接使用现有 `./node_modules/.bin/vitest`，没有 npx 安装或在线取数。

- `./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round1:'`：初始 **退出 1，8 项全部按预期失败**，日志 `/tmp/task4-round1-red.log`。包括可见单元格仍为 99.99%；三个 raw 字段、非法与错误披露日期、母公司口径均一轮通过；operating-first 补充后删财务列两轮通过。五项生产修改前完成 RED。
- 同命令在初始修复后 **退出 0，8 项通过**，日志 `/tmp/task4-round1-green.log`。第一个 HTML 反例一轮完成且最终单元格为 48.44%，其余错误均触发一次修复后正确完成。
- `./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round1: runtime preserves unsupported|round1: raw amount'`：**退出 1，2 失败 / 1 通过**，日志 `/tmp/task4-round1-structure-red.log`。证明 runtime 长表因提前 anchor 跳过原检测，以及 raw revenue 带元单位漏判；随后修复并纳入最终 GREEN。
- `./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round1: early repair retains'`：**退出 1，1 项失败**，日志 `/tmp/task4-round1-all-tables-red.log`。证明只捕获首表时第二个原财务表的列/公司/报告期仍可消失；随后改为全部相关表并纳入最终 GREEN。
- 中间单文件 `/tmp/task4-round1-statement-final.log`：**退出 0，107 项通过**，之后补充上述多表约束回归。最终专用文件共 **108 项**，相对原 73 项新增 **35 项**，均包括在下列最终命令中。

最终直接相关命令：

```sh
./node_modules/.bin/vitest run test/statement-table-evidence.test.js test/observed-statement-growth.test.js test/statement-evidence.test.js test/statement-operating-coverage.test.js test/component-source-binding.test.js test/research-task-runtime.test.js test/component-source-projection.test.js test/research-artifact-resilience.test.js test/workbench-sourced-table-delivery.test.js
```

**退出 0，9 文件 / 568 项通过**，日志 `/tmp/task4-round1-final.log`。涵盖新五项、原实际错误及正确表、取消/预算/异常 fallback、源绑定、growth、operating、来源投影和表格交付。不是全功能测试。

本轮因触及 renderer 接纳，另在较早的同批核心测试中加入 `test/component-template-registry.test.js test/research-market-artifact.test.js`，命令为上述九文件再追加这两文件，日志 `/tmp/task4-round1-focused.log`：**退出 1，11 文件 / 623 通过、2 既有失败**。两项与 `task-3-report.md` 已归档基线失败一致，不改断言、不吞并修复：

- `component-template-registry.test.js` → `identifies the failing sourced panel and asks only for a field correction`：旧 `artifact:null` 必须抛错断言。
- `research-market-artifact.test.js` → `preserves sourced KPI details through the host metrics template`：`.market-detail` 为 null。

其余四项已登记的 `research-market-layout.test.js` 失败仍保留，不重跑：`upgrades an already patched client so fund cards keep a content-sized resize minimum`、`keeps later workbench cards fixed when a source card is manually enlarged`、`persists the source dimensions through the real workspace normalization and arrange path`、`keeps the six source panels at their source dimensions and 12px gaps`。不宣称全分支全绿。

`node --check` 逐一检查本轮三个 JS 生产文件与专用测试，**退出 0**。`git diff --check` **退出 0**。本轮没有 TypeScript / 声明文件变更，当前 tsconfig 未启用 allowJs/checkJs，项目 typecheck 不覆盖这些 JS，故以语法检查与运行时聚焦测试为适用验证，没有运行无关全项目 typecheck。

### 可见交付证明与事实边界

- 所有新增 Runtime 成功断言都从 `finalOutput.html` 提取实际 `<th>/<td>` 单元格，并先剔除 script；不以 retained JSON 中出现正确值代替可见内容证明。
- 独立的本地 in-memory Runtime 输出已留 `/tmp/task4-round1-visible-output.html`、`/tmp/task4-round1-visible-proof.json`。输入 HTML 明写 99.99%，模型写真实 fixture 对应值；结果 `completed`、1 次 adapter start，最终单元格依次为：公司 / 报告期 / 披露日期 / 报表口径 / grossMargin / 300502.SZ 新易盛 / 2026-06-30 / 2026-08-25 / 合并口径 / **48.44%**；`containsWrongValue:false`。该命令退出 0。没有操作浏览器/客户端，不主张在线成功率或实际客户端验收。
- 原三公司整表在 generic/market retained 两条路径均有可见输出断言：全部公司、48.44%、7.15%、34.86%、13.36% 及未取得现金流说明保留。原金额、同比精度及现金流缺口的人工期望完全未修改。
- actual 六响应 fixture 与 `/tmp/compute-b-finance-observed-business-20261021.json` 的 SHA-256 仍同为 `9d2199213832a0788914f531b937884f6d9af48a14783400652d336947cb780c`。其字节、原错表、来源记录均未修改。新增 operating record、不同 scope/修订行是测试内显式合成，绝非在线取数。
- 未支持长表、含糊口径或非法日期采用明确拒绝；不自动猜测字段、选择修订、改写原研究对象或扩大查询预算。已知字段覆盖不等于任意财务散文/其他来源已审计。

### 自审与提交范围

已逐项对照五条审查及补充反例：错误 retained HTML 重建可见值；三个 raw 及含单位金额识别；日期合法且对应源；混合行口径逐行选择且冲突拒绝；提前捕获全部原约束；正确表仍完成；一次 repair / 取消 / fallback 旧边界通过。源码 ownfiles 为 `artifact-output.js`、`index.js`、`statement-table-evidence.js`、`test/statement-table-evidence.test.js`。

Git 实际状态纠正：本报告虽匹配 `.superpowers/sdd/.gitignore` 的 `*`，但 `git ls-files` 确认它早已被跟踪。root 在本轮明确指示将该已跟踪 ownscope 报告正常 `git add` 随源码提交，保持 feature 干净；不 force-add 任何其他未跟踪报告。本轮将按此最新指示创建中文本地提交，不 push。

提交前普通 `git add` 因忽略的父目录提示退出 1，但 `git ls-files --error-unmatch` 退出 0，且 `git diff --cached --name-only` 确认上述 4 个源码/测试文件及本报告均已正确暂存。未 force-add；随后仅用 `git add -u` 更新已跟踪报告，并再次核对暂存范围。

## Task 4 fix round2（多口径研究行保留，2026-10-21）

状态：新增 I1 已修复并完成聚焦验证，等待 root 独立复审。精确起点 `1c406e9ece8609451ed9df611853c2c7c3e896a0`，开始时工作区干净；Task5 writer 已停止并提交。本轮仅修改 `statement-table-evidence.js`、专用 `statement-table-evidence.test.js` 与本已跟踪报告，不修改 caller、Task5/native、Notes、collector 或预算；未派 agents、未构建/操作共享客户端、未调用真实 SDK/模型/网络、未读凭据或 private reasoning、未运行全功能测试。

### 根因与最小修复

原原表约束虽然已完整捕获，但逐行保留仅以证券代码与报告期匹配。同公司同期间的合并与母公司研究行能被一条剩余合并行同时满足，删掉错误母公司行便消除了唯一数值错误。新逻辑在这些既有 code/date 约束外，聚合原全部相关表内明确的行级 scope：同 code/date 下原本同时存在合并和母公司时，最终必须分别有对应 scope 的行，不能删除或改成另一条重复口径。当前行仍按原表级/同行 scope 合并规则核验；最终 metadata 与 row scope 冲突仍拒绝。

单个首次错误标签并不自动变成不可更改对象：没有明确 host scope 约束时，仍可将仅一行的错误母公司标签修正为实际合并来源，原 I4 正例继续完成。宿主请求中明确、无歧义的已支持口径也不能被改成另一口径；否定口径语句不作肯定要求。没有引入任意散文理解或通用表格审计。原明确多口径行即使原 table metadata 写错，保留身份仍从明确同行标签得到，允许修正 metadata 而不允许趁机删掉另一口径；错误/冲突同行标签不机械冻结。披露日期不加入永久保留身份，错误日期和等义“母公司口径”→“非合并口径”仍可按实际来源纠正。

### RED / GREEN、命令和退出码

使用现有本地 `./node_modules/.bin/vitest`，没有在线安装。

```sh
./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round2:'
```

生产修改前 RED：`/tmp/task4-round2-red.log`，**退出 1；5 失败、1 通过，108 跳过**。五项失败均为旧 Runtime 错误 `completed`：删除母公司行、删除合并行、把母公司行改成第二条合并行、宿主明确母公司但交付合并行、两份原表中删掉一种 scope。审查指定的“合并 48.44% 正确 / 母公司 99.99% 错误 → 删除母公司”的输入完全保留；修成两行 48.44% / 12.34% 的正例原本通过。

最小修复后的第一轮聚焦：

```sh
./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round2:|rejects parent-company label|rejects .* row scope|different row scopes|disclosure|original .*after supplement|every original financial table'
```

`/tmp/task4-round2-green.log`，**退出 0；22 通过、92 跳过**。没有新增调用或修复次数。

加入同一交互边界的正反例后最终聚焦：

```sh
./node_modules/.bin/vitest run test/statement-table-evidence.test.js -t 'round2:|scope|disclosure|parent-company label|preserv|dropping|delete|period|cancellation|fallback|third generation|repairs once|second .*bypass'
```

`/tmp/task4-round2-final.log`，**退出 0；51 通过、69 跳过（总专用文件 120 项）**。本轮新增 **12 项**：五种拒绝、保留两行修正完成、metadata 冲突纠正的保留/删除对照、错误披露日期及等义口径标签纠正、宿主要求合并/否定母公司时单行误标签纠正、明确请求母公司但无其来源时保留“本次未取得”。全部失败终态断言仍至多 2 次 adapter start，没有第三次生成；全部成功修复仍第二次完成。旧取消、异常 fallback、删公司/列/期间及预算回归在这一选择范围内通过。最终仅调整一个测试标题措辞，不改变用例或断言。

`node --check` 检查 helper 与专用测试、`git diff --check` 均 **退出 0**。没有 TypeScript/声明修改，项目 tsconfig 不覆盖这两个 JS 的类型检查，不额外执行无关项目 typecheck。未重跑任何已登记无关失败文件：前轮报告所列全分支 6 个既有失败依然保留，不宣称全分支全绿。

### 可见结果与事实边界

成功用例从最终 `finalOutput.html` 剔除 script 后检查 `<th>/<td>`：两行仍分别显示 **合并口径 48.44%**、**母公司口径 12.34%**，不再包含 99.99%；错误日期修复后两行均为 **2026-08-25**，等义非合并标签保留 **12.34%**。这些断言读取实际交付 HTML 单元格，而不是只读 retained model。删除任意一种明确比较 scope 的用例终态 failed、无 finalOutput，并指出具体必须保留的 scope。缺源正例保留母公司口径和“本次未取得”，不会偷偷换成合并 48.44%。

所有 12.34 值只来自测试内明确合成的 `mergedFlag:'2'` 行，不是 actual fixture 或新在线取数。actual 六响应 fixture、原错表和人工 corrected 期望均未修改；本轮重新 SHA-256 校验 fixture 与原 `/tmp/compute-b-finance-observed-business-20261021.json` 仍同为 `9d2199213832a0788914f531b937884f6d9af48a14783400652d336947cb780c`。无浏览器/客户端/SDK/线上验收主张。

自审确认：不同 scope 不互相替代；同 scope 的任意重复行/任意维度审计不在本轮范围；只对已有明确口径及 host 明确口径施加保留。原公司/列/期间、最终逐字段事实核验和单次 repair 路径均保持。将按 root 授权用 `git add -u` 正常提交上述两个源码/测试文件及已跟踪报告，中文本地提交题为“保留财务表修复中的独立报表口径行”，不 force-add 其他 SDD、不 push。
