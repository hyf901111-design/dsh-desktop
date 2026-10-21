# 笔记挑战完整目标结果保留计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全部真实目标结果有效时，不因额外未知段落分组丢弃整轮审查；未知分组永不映射或写入正文。

**Architecture:** reviewEntries继续严格验证每个分组的字段、非空合法ID、issues数组与ID唯一性。未知分组只在全部目标恰好出现一次时被丢弃；缺失目标或任何结构错误仍走原一次恢复。已知候选继续经过原精确quote/依据过滤。安全事件记录丢弃数量，过滤统计只统计目标分组。

**Tech Stack:** ESM runtime、Vitest、本地集成客户端。

**Spec:** docs/superpowers/specs/2026-10-21-notes-challenge-v16.md。新增根因证据 /tmp/notes-review-shape-diag-native-structure-evidence-20261022.json：6个目标齐全、7个合法形状分组、1个未知ID、两次均整轮503。基线dc58c49a2c393f8699e2da2a84cf533ba74debe2。

## Global Constraints

- 不接受或猜测未知ID属于哪段，不按quote反查映射；不接受标题或上下文的额外结果。
- 目标分组重复、未知字段、issues非数组、ID类型错误、外来分组伴随目标缺失均拒绝；已知目标候选的quote/evidence与输出类型验证保持。
- 原一次恢复、16k跨恢复输出、100k有效流、32768事件、截止时间、工具拒绝、模型路由与不联网边界保留。分组数量的工作量受原解析输出容量约束。
- 正确的部分结果无外来分组时继续诚实partial。正文/日期/讨论/草稿不改；不全套测试、不发布、不推送、不accept/promote。

## Review Focus

- 额外未知组包含看似可定位的quote，也绝不变成目标问题或伪造覆盖。
- 未知组存在且目标缺失时必须失败，不能将模型写错ID当作完成；合法部分结果无额外组仍允许partial。
- 分组结构错误或重复ID（包含未知ID）仍拒绝，不悄悄合并可能冲突的问题。
- accepted-extra事件只含固定字段/计数/哈希；外来候选不进入filtered统计，避免误导诊断。
- 本修复只证明已复现的额外分组错误类型；并列断言漏检、标题干扰与引用范围变化仍单独跟进，不借修复声明它们完成。

### Task 1: 完整目标集合的额外分组投影

**Files:** Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js; Test test/notes-challenge-runtime.test.js.

- [ ] 写RED：完整2目标+2外来有效组一次完成且外来候选不出现；目标候选仍过滤；只有空目标/外来候选不记filtered事件；缺失目标/重复/多字段/非数组/非法ID仍最多恢复一次并拒绝；无外来partial不变。记录正确失败。
- [ ] 实现完整已知集合投影，保持全部分组的形状与ID唯一性校验；只在完整集合存在时丢弃未知组。modelResult只记录一次notes-challenge-review-extra-groups（action/attempt/targetCount/reviewCount/ignoredGroups/requestKey）。filteredReviewStats只读目标组。
- [ ] 聚焦runtime/recall/consensus检查、typecheck、diffcheck；中文本地提交与独立整项复审。
- [ ] 刷新交接并受控集成，从干净integration构建及包/模块一致性检查，核验真实主UI。
- [ ] 原文最多6轮只读复检检查原错误类是否再出现；同时保留其它格式失败诊断与实际候选质量。纯正确带标记零误报对照与四档12错误/5对照复核。恢复原文前台，核对历史/正文/日期/两草稿；不删除新增或旧评论来改进结果。

**Completion:** 根因类先红后绿并在实际包验证；不把所有HTTP200等同事实全覆盖，也不把额外组忽略当作允许错误ID替代真实目标。
