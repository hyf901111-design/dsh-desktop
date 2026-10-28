# Research 缺失图表 variant 的受限恢复

基线 e49d193c7300fad908e42f474a7631d9b2d0a4da。原有 createSubagentAdapter 已有完整的唯一宿主 chart schema → restoreDeclaredChartVariant → 原 schema/来源校验，但只在 surface=note 时采集 declaredChartContract；Research 默认 adapter 没有该契约，真实公开缺 variant 输出因此失败并消耗原有一次修复。

生产仅去掉契约采集条件中的 Notes 专属限制，仍要求 kind=container。宿主 workbenchPanelPrompt 只能给出唯一明确 schema；原 restoreDeclaredChartVariant 不变，只给不存在的属性补明确注册 variant，不覆盖 null/空串/未知/已有显式值，不修改其它数据。没有新增模型、child、schema推断或权限。

test/fixtures/notes-real-chart-missing-variant.json 前两条公开回放通过实际 ResearchTaskRuntime + 默认 createSubagentAdapter：RED 为2失败、13边界通过；GREEN 为每条 completed、一个原始 child，Notes 同 raw 也一个 child且完整模型一致。测试不调用真实 provider，来源/会话均合成。

反例保留：显式 line/bar 原样；null/空/不支持 variant、无效单位/extra/labels/values仍拒绝；模糊 schema、多对象、明确HTML目标不猜测；宿主要求实际 DataYes 响应时仍因无业务证据失败。

直接5文件101/101、typecheck与diff-check通过；未运行全套或修改Conversation contract/store、HTML共享持久化、依赖、版本号或客户端。证据 /tmp/sherlock-research-chart-contract-20261029/{red.log,focused.log,typecheck.log}。正式后继卡以 e49 为 base；最终集成/包装由Root负责。
