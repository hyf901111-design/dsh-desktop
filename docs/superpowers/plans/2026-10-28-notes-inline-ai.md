# 笔记空白行 AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 空白行按空格用真实 AI 在稳定锚点写入富文本与组件。

**Architecture:** 复用 NotesEditor generate 与主进程能力循环。inline-ai.ts 维护触发和锚点插入契约，独立 React composer 使用现有默认头像与处理样式；documentId+blockId 在所有写入前校验。

**Tech Stack:** React 18、BlockNote、Yjs、Electron IPC、Vitest、Chromium。

**Spec:** docs/superpowers/specs/2026-10-28-notes-inline-ai-design.md

## Global Constraints

- 仅空白正文 paragraph、折叠起始光标且非 IME/只读时触发。
- 提示：按 space（空格）以启用 AI，或按“/”启用命令
- 不运行全功能单元测试，不构建共享客户端，不推送。
- 不修改 React/Yjs 单例修复。

## Review Focus

- 输入法、标题、代码、非空段落和选区不得吞掉普通空格。
- 用户移动光标或编辑邻近段落后仍按稳定锚点写入。
- 原锚点有新内容时保留新内容；删除锚点禁止末尾兜底。
- 取消、切换文档、重试迟到结果不可落入其他文档。
- 组件能力与普通文字均真实插入并在保存重开后保留。

### Task 1: 触发和锚点协议

- [x] 新增聚焦回归，先确认缺少空白行触发失败。
- [x] 实现 inline-ai.ts 触发条件、documentId+blockId 校验及原位插入。
- [x] 实际 BlockNote fixture 覆盖文本、组件、编辑/删除锚点与保存重开。

### Task 2: 行内 UI 与真实 AI

- [x] composer 复用 avatar 和 AI processing；支持多行、IME、发送与取消。
- [x] NotesEditor generate、组件 capability 与服务 AI 协议传递锚点；过期/取消阻止迟到写入，错误保留需求。
- [x] 浏览器回归覆盖真实 bridge 请求、组件回执、宽窄/主题与 Esc。

### Task 3: 验证和交接

- [x] 运行直接相关 notes 回归、生产 preload 单例回归、typecheck、diff check。
- [x] 中文本地提交，官方 git:handoff 生成 base=8416133492d4809440d803b67cf938a67a2e9ede 增量卡。
