# 笔记挑战格式失败定位计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 定位原文复检的偶发503格式失败，为后续实证修复提供只含结构计数的诊断，不凭猜测改变接收结果。

**Architecture:** 在现有JSON/审查结构验证失败分支写固定事件与有限结构计数；不记录任何正文、引用、ID、模型文字、异常消息、讨论或草稿。原验证、一次恢复、共享预算与路由不变。部署本地集成包后重复真实只读复检，依据真实失败计数决定下一修复。

**Tech Stack:** ESM runtime、Vitest、实际本地客户端。

**Spec:** docs/superpowers/specs/2026-10-21-notes-challenge-v16.md；用户持续优化目标且笔记优先。基线b9957bb37ea1db545baa7147a563dfb62868a69b。实机失败证据 /tmp/notes-anchor-context-native-with-current-user-anchors-20261022.json，requestKey521c10307ecb。

## Global Constraints

- 保留正文、日期、讨论、未发送草稿；不读取历史或增加联网能力。
- 不放宽JSON或reviewEntries验证，不增加恢复次数，不改变100k有效流预算、32768事件、16k输出、截止时间与工具拒绝。
- 不运行全功能测试；feature不构建共享客户端；中文本地提交与多session集成后才能本地构建，不发布、不推送、不accept/promote。

## Review Focus

- 日志键和值都只能来自固定枚举、布尔值、计数与请求哈希，恶意字段名、段落ID和异常文字也不能泄漏。
- 验证成功的空/部分结果不产生格式失败事件；不能把零问题误报为失败或增加重试。
- 第二次失败仍拒绝且只调用两次，第一次失败不污染第二次输入。
- 日志sink异常不能影响恢复或最终拒绝；累计流预算/超时/工具拒绝继续生效。
- 原文结构错误的真实原因未知；新增观测不是已经修复503的证据。

### Task 1: 结构失败安全诊断与实机定位

**Files:** Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js; Test test/notes-challenge-runtime.test.js.

**Contract:** notes-challenge-format-rejected事件只含action/attempt/reason(json-invalid|review-envelope)/jsonChars/targetCount/anchorCount/requestKey；仅解析成功而结构错误时增加valueKind/reviewsKind/reviewCount/nonObjectReviews/unexpectedReviewFields/unknownBlockIds/duplicateBlockIds/nonArrayIssues/unreviewedTargets。种类只为固定JSON类型或missing；计数必须非负整数。

- [ ] 写RED用例涵盖各种review结构缺口、两次失败、私密字段/文字不泄漏、JSON语法失败、logger异常与合法部分结果不记格式事件；确认失败来自缺少诊断。
- [ ] 在原catch中保留解析成功状态并投影结构计数。沿用diagnostic的受保护sink，不改变验证结果、恢复路由与次数。调整已有跨恢复流计数断言以区分事件类型。
- [ ] 运行runtime/recall/consensus直接相关聚焦检查、typecheck、diffcheck；中文提交并独立整项复审。
- [ ] 刷新交接并受控集成；从干净integration按本地手册构建、包检查与模块一致性检查，核验真实主界面。
- [ ] 独立验收笔记前台时重复原文只读复检最多6轮；关联安全日志结构计数。遇到真实失败先分析，若未复现如实保留未定位结论。恢复原文并核验正文、日期、讨论和草稿保留。

**Completion:** 安全诊断有失败先行测试与实机运行证据；对503是否解决仅按真实证据报告，不推断或掩盖失败。
