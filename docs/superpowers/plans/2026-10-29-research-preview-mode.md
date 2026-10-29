# 研究看板预览与编辑模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 每块看板在本机记住预览模式，锁住人工结构编辑，同时保留组件使用、切页、主题与原生整理画布。

**Architecture:** 沿现有 grid patch restore 记录安装本地状态、独立结构权限和 UI。保留 collaborationCanWrite 对组件使用状态的原有 ACL；整理使用仅在 bundle 内部持有的 Symbol，不能通过公开 options 绕过。页签继续使用原工作区方法，header 通过现有 page 暴露的工作区读取和订阅模式。

**Tech Stack:** React 18、Node patch serialization、Vitest、真实 production bundle + headless Chromium。

**Spec:** 用户提供的三张标注截图与任务消息。

## Global Constraints

- 默认编辑；preview 是每看板本机偏好，不加入共享文档。
- 搜索、筛选、切公司/参数、图表缩放、既有数据联动与刷新可用。
- 预览 More 仅放大阅读、复制组件、添加至组件库、导出、适用的行情资讯刷新、数据源与自动更新。
- 复制组件只写剪贴板；页签 More 隐藏；底栏组件库/绘制/链接/语音灰禁用。
- 功能 worktree 不修改已安装 SDK、不构建/替换共享客户端；不全功能测试，不推送、发布或增版本。

## Review Focus

- 切换模式发生在拖动/缩放/连接中途时回滚草稿，pointerup 不偷写。
- await 中的导入/生成启动在 preview 后不能提交。
- ACL 只读无法经模式切换升权；远端同步和加载仍生效。
- 原生手动整理可用，但公开 geometry/apply/undo 不可伪造授权。
- 复制/库/导出/数据源等菜单动作是真实可用，组件内部交互不被全局 readOnly 禁用。

### Task 1: 状态、结构边界与用户入口

**Files:** scripts/lib/research-preview-mode.mjs（新增）、research-grid-workbench.mjs、research-grid-ui.mjs、board-tabs-client.mjs、board-tabs-ui.mjs、src/preload/research-boards-ui.ts、src/main/state/research-canvas-storage.ts。

- [x] 先添加 production bundle 聚焦测试并确认缺少 preview 行为失败。
- [x] 安装本地模式状态；给结构方法、内容编辑 sink、AI/capability、clipboard/drop/快捷键、页签写入添加独立守卫。
- [x] 加 header 切换、菜单白名单、底栏禁用、拖拽/连接取消和内部整理例外。
- [x] 聚焦 headless 交互、状态重启与 ACL 测试转绿；执行相关既有主题/页签/排列/剪贴板测试、typecheck 与 diff 检查。
- [x] 中文本地提交并冻结 tip，给主任务交接证据；共享原生验收由主任务执行。
