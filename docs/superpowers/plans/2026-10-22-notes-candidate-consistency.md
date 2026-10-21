# 笔记候选一致性复核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 减少已经指认原文正确或仅针对标题的评语，同时保住真实更正和既有正文覆盖。

**Architecture:** 新增纯数据候选选择/有界上下文及严格决策投影模块，runtime在全部主审查结束后使用剩余总期限执行一次短复核。任何复核不完整或失败保留原结果，父取消仍抛出。外部协议与UI/持久化不变。

**Tech Stack:** ESM runtime、Vitest、现有模型流和本地集成客户端。

**Spec:** docs/superpowers/specs/2026-10-22-notes-candidate-consistency.md；基线1e7c0a8390aa15a31b24c412ccb443fbe7307b7c。

## Global Constraints

- 不缩小现有正文分批/覆盖/明显错误底线，不增工具、联网或会话历史读取。
- 复核最多8条，完整候选+正文JSON最多16000字符，不截断输入；800输出token，最多8秒，保留收尾1秒，剩余不足3秒跳过。
- 只能从既有候选删项，全部序号恰好决策一次；其余字段/覆盖不变，非法决策整批不采用。
- 失败或复核超时保留原结果，父取消/总期限仍终止；用量累计，安全计数诊断。
- 不全套测试，聚焦验证、中文本地提交、受控集成和真实客户端验证；不发布、不推送、不accept/promote。

## Review Focus

- 标题或承认原句无误的误报去除，而带直接更正值的转折仍保留。
- 决策缺失/重复/外来序号或理由不合法不能悄悄误删候选。
- 复核不抢占后续主批次，长文覆盖和正确partial语义不变。
- 局部超时/提供者错误保留主结果，真正取消不被吞掉，迟到响应不写入。
- 上下文包含真实引用及其必要依据，不截断、不记录内容、任意标签或异常文本。

### Task 1: 有界候选复核及运行时接入

**Files:** Create packages/dsh-research-task-runtime/notes-challenge-consistency.js; Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js; Test test/notes-challenge-consistency.test.js and affected runtime/recall/consensus tests.

**Interfaces:** buildConsistencyInput(issues, blocks, title) returns bounded {candidates,context,title} or undefined; applyConsistencyDecisions(value, input, issues) returns original issue objects filtered, or undefined for any invalid decision; generateNoteChallenge外部接口不变。

- [ ] RED：真实两类误报去除，真实更正保留、全部原对象/覆盖不变、无风险候选不请求复核；未知/重复/缺失/非法keep-reason组合保留原结果。
- [ ] RED：候选/上下文容量、完整正文不截断、8条上限；后续主批次先完成；复核失败、超时、父取消、迟到结果、用量与日志隐私。
- [ ] 最小实现纯模块、严格投影及全批次后的剩余期限复核；仅固定计数诊断。比较所有预期失败后再实现。
- [ ] 聚焦一致性/runtime/recall/consensus、类型、diff检查；中文提交与独立整项审查，必要修复先红后绿。
- [ ] 受控交接/集成/构建和包一致性；原文多轮、正确内容、四档错误、真实更正对照；准确记录失败和残余，不改变正文/日期/讨论/两草稿，恢复原文前台。

**Completion:** 通过实际新包验证复核路径及回退/取消边界；不把候选误报改善当作复合断言漏检已解决。
