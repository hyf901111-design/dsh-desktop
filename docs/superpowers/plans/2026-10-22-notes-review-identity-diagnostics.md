# 笔记主审查身份诊断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline.

**Goal:** 区分真实主审查失败中的未知身份来源，给后续修复提供证据。
**Spec:** docs/superpowers/specs/2026-10-22-notes-review-identity-diagnostics.md
**Base:** af7c6d20a86819f7f2755592d09ee93c352f0340
**Architecture:** 纯固定计数辅助函数供合法额外分组和格式拒绝诊断复用；所有校验/返回/流边界不变。
**Constraints:** 只本轮数据；不记录源文字/任意ID/键；近似只分类；无额外模型请求或预算；用户数据保留；聚焦检查，不发布/push/mainpromotion。

### Task 1: 固定身份来源计数与实际验证

**Files:** Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js; Create test/notes-challenge-review-identity.test.js.
**Interfaces:** 内部unknownReviewStats(value,targets,payload)返回5个固定整数计数；reviewShapeStats复用；modelResult合法extra事件复用。外部接口无变化。

- [ ] RED：标题文字/固定title标识、context精确ID、一处替换/插入/删除、非字符串/过长/其他ID、未知空组；完整目标额外组仍接受，缺失目标+近似组仍拒绝。
- [ ] RED：日志只允许固定字段/枚举/计数/哈希，完整私有输入及模型任意字段不泄露；日志异常不影响原异常。
- [ ] 最小实现分类；聚焦新身份/runtime/recall/consistency/consensus，类型与diff，中文提交；一次独立整项审查及必要先红后绿修复。
- [ ] 受控交接集成构建与包一致性，真实原文有限轮检查；确认用户正文/日期/讨论/两草稿，恢复原文前台。记录分类与下一步，失败不伪称修复。

**Completion:** 日志计数可由真实新包确认且无用户数据回归；未知来源仍不确定时明确继续调查，主审查可靠性和复合断言召回仍为全局目标。
