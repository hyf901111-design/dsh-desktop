# 笔记主审查返回键实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline.

**Goal:** 避免模型复制原段落ID时的一字符错误导致整文失败，保留原有事实覆盖和数据。
**Spec:** docs/superpowers/specs/2026-10-22-notes-review-return-keys.md
**Base:** 6472677b240729bb783ad8cb1e7a4abe84d4125b
**Architecture:** 当前批次返回键精确表；reviewEntries按整份格式回投原ID；数据验证和外部协议不变。

## Global Constraints

- 原target/context/anchor/evidenceID不改；只有出站审查target新增reviewKey；键距离至少2。
- 旧完整精确blockId响应兼容，混合/双字段/重复/未知+缺失拒绝；未知键不尝试原ID。
- 原分批/覆盖/引用/事实底线/限额/重试/期限不放宽；其他action不变。
- 固定计数与枚举日志，无用户文字/ID/模型任意字段。
- 聚焦验证、中文提交、一次新审查、本地集成/包/原生验收；不发布/push/mainpromotion，不改用户正文/日期/讨论/草稿。

## Review Focus

- 原ID恰好等于另一个键、单字符差错、跨批次键复用不得串目标。
- 新旧身份混合、双字段、未知/重复不能被兼容路径误接纳；部分覆盖必须诚实。
- 内部原文证据继续使用实际ID，不能把键作为证据或把context当target。
- 所有过滤/公平限制/consistency与取消边界保持；成功/失败日志不泄露私密输入。
- 实际模型质量/失败率必须以新包验证；源测试不证明语义正确或所有格式问题消失。

### Task 1: 返回键、精确身份解码及验证

**Files:** Modify packages/dsh-research-task-runtime/notes-challenge-runtime.js, test/notes-challenge-runtime.test.js as fixed-diagnostic schema changes require; Create test/notes-challenge-review-keys.test.js.
**Interfaces:** 内部reviewKey(index)、reviewIdentity(value,targets)统一决定字段/模式/精确映射；reviewEntries仍返回原blockId Map。

- [x] RED：出站原ID/内容不变、目标键完整且距离≥2，context/anchor不改；key模式乱序映射和原文证据保留。
- [x] RED：未知/重复/非字符串/混合/双字段、字面ID碰撞、部分/额外组、跨批次与界限；旧精确格式兼容。
- [x] RED：原quote/证据过滤、固定模式日志保密、logger失败、原一次恢复、其他action无键。
- [x] 最小实现并跑keys/identity/runtime/recall/consistency/consensus和typecheck/diff；中文提交、一次独立整项审查及必要RED→GREEN修复。
- [x] 严格后继交接集成，本地构建签名/包/源一致性，实际原文多轮、四档底线/正确/混合/语境控制；保护审计并恢复原文前台。

**Completion:** 新包证实返回键路径实际运行，身份差错/失败较基线改善且原语义控制无回退；所有失败与残余明确保留，未满足则继续修复，不将诊断或仅兼容作为交付。
