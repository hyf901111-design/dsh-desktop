# 画布统一操作协议 Implementation Plan

**Goal:** 右侧对话通过查看、批量变更和撤销工具操作当前画布，不枚举用户话术或组件类型。
**Architecture:** 工具以执行会话绑定目标，经已有主进程认证桥传递到真实 workspace；组件声明可编辑字段，所有变更先验证再一次提交，复用历史和协作权限。
**Tech Stack:** JavaScript runtime / Electron IPC / TypeScript preload / Vitest。
**Spec:** 本任务已批准的统一组件模型、能力声明和通用操作协议。

## Constraints
- 不直接修改用户文件或绕过共享画板权限。
- 只做聚焦测试；独立 worktree，不构建或替换共享客户端，不推送。
- 不以自然语言正则分流；能力按字段/适配器声明。

## Tasks
- [x] 创建 canvas-actions.js 可测试控制器。inspect 返回实时版本和能力；apply 先校验全部操作，再提交一次；undo 使用版本和操作 ID 防止撤销他人修改。
- [x] 增加 canvas-tools.js，注册 research_canvas_inspect/apply/undo。会话由 exec 提供，不接受模型指定。JSON 变更仅可写 capability 声明字段。
- [x] 增加主进程/预加载请求响应桥；仅可信主窗口可绑定和响应；请求超时、失效会话和重复变更返回明确结果。
- [x] 将控制器接入真实 workspace，复用持久化、撤销、资源释放和共享同步；每次 research 发送建立绑定与选择上下文。
- [x] 聚焦覆盖批量失败无部分写入、版本冲突、重复调用、撤销、未知组件能力、IPC 访问和真实 workspace 接入。运行 typecheck，创建中文提交和交接卡。

## Evidence
49 directly relevant tests passed; TypeScript check passed. Isolated Chromium verified production ResearchCanvas delete/undo, content edit and arrange, clear/undo, close and 10-second expiry. Shared Electron and two-client cloud acceptance remain for integration. See docs/research-canvas-actions.md for inherited baseline assertions and storage limits.
