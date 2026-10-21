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
