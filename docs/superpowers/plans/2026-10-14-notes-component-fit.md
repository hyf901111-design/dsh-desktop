# 笔记组件自适应修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 笔记模式复用研究组件时，内容按组件的实际可用尺寸显示，消除网页组件的固定 iframe 高度裁切。

**Architecture:** 保留原生研究组件和正文组件尺寸控制；对齐两个宿主的布局约束。以真实 NotesApp、原研究组件渲染器和浏览器布局作对照，修复必要的尺寸传递。

**Tech Stack:** React、BlockNote、原生研究组件、Vitest、Playwright。

**Spec:** 用户 2026-10-14 请求：笔记组件内容自适应与研究模式一致；进一步优化大型多页 PPT 滚动。PPT 性能由独立分支处理，统一在新集成批次验证。

## Global Constraints

- 基线 b69912cb0062edd6dea927c96a8ce17d300e6aec；不修改版本或公开更新源。
- 只运行直接相关聚焦检查；通过后作中文本地提交。
- 功能工作区不构建共享客户端；集成后按本地测试手册验证真实主界面。

## Review Focus

- HTML iframe 填满宿主，保留交互状态。
- 用户改变组件宽高后内容重排，手柄和选择边框正常。
- 窄正文与窗口宽度变化后内容仍完整可访问。
- 重新打开笔记保持已保存尺寸，正文之外的研究几何不被更改。
- 金融、日历和长回复仍使用原生组件及自身滚动策略。

### Task 1: 对齐笔记宿主布局

**Files:** `src/preload/notes/style.css`、`scripts/lib/notes-components.mjs`（仅必要时）、`test/notes-component-layout.test.js`。

- [x] 添加真实浏览器对照测试：同一 HTML 组件在研究/笔记宿主下，iframe 使用全部可用高度而非默认 150px。
- [x] 运行测试并确认失败来源是笔记宿主布局：笔记 150px、研究 278px。
- [x] 修复宿主布局，验证窄宽度、手动缩放、交互状态和重新打开。
- [x] 运行组件原生渲染/交互聚焦检查及类型检查，提交中文说明。

Ruling: 只对齐宿主布局，不复制组件或重写研究几何 — 原生组件已经复用，差异来自笔记父层没有 flex 高度约束和 HTML 零内边距 — 由真实渲染器的浏览器尺寸对照保护。

Ruling: 更新旧手柄测试的外侧命中预期 — 原始 b699 连续两次失败；其前提是 PPT 对象手柄越过阅读区域，但已验收的可视边界裁切允许笔记外侧手柄直接被命中 — 保留尺寸变化、对象不误修改、内部对象缩放和组件选中断言。

Evidence: 四个组件聚焦文件 14 项通过；更严格的重新打开检查单独通过；类型检查与 diff check 退出 0。

### Task 2: 集成与客户端验证

- [ ] 审阅笔记与 PPT 两个分支，生成精确交接卡，通过官方预检后进入新批次。
- [ ] 执行本地测试构建与包检查，使用原生 UI 对照组件布局并连续滚动大型 PPT。
- [ ] 保持客户端打开，报告实际证据与性能测量边界；等待用户验收后再接受/晋升。
