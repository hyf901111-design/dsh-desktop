# 内置研报 V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks use checkbox syntax.

**Goal:** 用户默认可由内置技能生成有预测/DCF/一年走势/证据的正式HTML和PDF，并本地启动测试。

**Architecture:** 延用受控research_report与同源PDF链；schema v2严格增加驱动DCF、原始日行情及四季度实绩。模型结果与假设经独立质量状态和渲染计划统一消费，legacy保持兼容。

**Tech Stack:** Node ESM、BigInt有理数/高精度分数幂、Electron ResearchPdfRenderer、Vitest。

**Spec:** docs/superpowers/specs/2026-10-23-equity-v5-built-in-design.md

## Global Constraints

- 根产品版本1.3.5不变；内置技能/引擎更新v1.4.0。
- 无新网络依赖；不把茅台数值、日期、交易日数或来源可用性当默认事实。
- 实现位于现有隔离功能树；禁止在该树替换共享客户端。
- 只运行直接相关聚焦测试、typecheck和包检查，不运行全套。
- 同格式交付与研究完整性分开；错误引用/单位/金融重复加回/日期不合理时阻断。
- 按后继handoff刷新20261023-01候选后本地构建；不公证/发布/推送/提前accept。

## Review Focus

- 来源哈希或字段被改、未知模型字段、金额类型/单位错误应阻断。
- H2已过现金与未来stub不能重复，终值必须支付再投资。
- 同时SOTP金融NAV与集团现金/NCI的重复计价必须被拒。
- 累计季度/单季及价格收益/总回报不得混用，缺日不能伪称完整一年。
- PDF生成成功不能把缺DCF/行情/季度的研究标完整，书签页码应来自实际打印。

### Task 1: 驱动DCF与独立向量

**Files:** 新增scripts/lib/forecast-dcf.mjs、discount.mjs及test/equity-research-forecast-dcf.test.js、合成fixture。
**Interfaces:** runForecastDCF(packet,facts,calculations,diagnostics,observations)消费核验回执产生的输入，输出带refs与单位的预测、折现、价值桥、三情景、敏感性与反解。

- [x] 先写缺失/重复计价/高精度折现失败测试并确认RED。
- [x] 实现CAPM、预测、actual/365、stub、terminal g/ROIC、权益桥和敏感性。
- [x] 以独立Decimal向量与负向输入核对GREEN。

### Task 2: 市场、季度与主流程

**Files:** schema.mjs、evidence.mjs、calculations.mjs、index.mjs、research.mjs；新增market.mjs、quarterly.mjs、requirements.mjs及聚焦测试。
**Interfaces:** market每日只用事实ID，输出归一化/回报；quarterly引用单季或累计差分结果，输出四季实绩与同比；quality记录required completeness。

- [x] 先记录旧实现无法识别v2/市场范围及遗漏仍full通过。
- [x] 加严格scope/metrics、受控quarterFromCumulative、完整日历/截止检查及结果token注册。
- [x] 默认init v2/full，完整性缺口与双格式状态分离，联通主流程。
- [x] 验证伪造来源、错时间、缺日、累计误标、报告缺项均被识别。

### Task 3: 正式出版与内置技能

**Files:** report.mjs、publication-layout.mjs、publication.mjs、新增research-v5-layout.mjs与测试；SKILL.md/references与_meta.json。
**Interfaces:** 消费统一结果，不重算金融值；同一渲染计划产生真实目录目标。

- [x] 先验证旧full遗漏情况及新类型/渲染缺失RED。
- [x] 补自动DCF/走势章节、封面来源分离和正式深度报告名。
- [x] 固化required slots、输入合同及质量不足处理，做应用场景复核。
- [x] 聚焦回归、独立计算review、源码/引擎指纹和打包版本联动检查；最终上下文审阅与真实包验收见任务4。

### Task 4: 集成与真实客户端验收

**Files:** handoff/候选批次由既有执行器维护，验证证据另存。

- [ ] 中文提交功能，聚焦结果绑定最终tip。
- [ ] 后继handoff、refresh dry-run/实做、preflight、merge。
- [ ] 候选上运行新检查并保存证据；build_and_run.sh --verify与完整本地包检查。
- [ ] 真机主界面、技能版本、实际research_report生成HTML/PDF验收，检查关键页与目录；保持应用打开。
- [ ] 所有已验证修改创建本地中文提交，交付说明实际边界。
