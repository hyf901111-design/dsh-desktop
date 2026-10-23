# 首页操作教程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** 在正式客户端实现输入交付物示意和三个可取消的真实界面教程，继续保留物理指针问题的未确认状态。

**Architecture:** 输入框由真实引用同步派生固定装饰；教程由 preload 公共控制器调度独立内存适配器。原生 ConversationRoot 持续挂载，限定 portal 复用研究/输入/任务组件，笔记复用 NotesApp，PPT精确授权只读预览。

**Tech Stack:** TypeScript、React18、现有原生 client patch、Electron IPC、Vitest与浏览器聚焦夹具。

**Spec:** docs/superpowers/specs/2026-10-24-home-guided-examples-design.md

## Global Constraints

- 不调用真实模型、不修改用户草稿/研究笔记/任务projection；示例行情不依赖实时网络。
- 各适配器只持有自己的 runId/sessionId/AbortSignal；退出释放 timers、observers、portal及精确grant。
- 无新增依赖；只跑直接受影响测试；中文本地提交；不从功能worktree替换共享客户端。

## Review Focus

- 快速重复点击、取消后迟到ready或IPC结果不得挂载旧教程。
- A→B→A会话切换不得回到A继续修改或抢焦点。
- 窄窗/右栏变化不能截断运营卡片或把配图缩为居中小图。
- 原生Root/textarea在教程开始和结束之间身份不变；原输入与selection恢复。
- 只关闭教程tab，不覆盖/关闭原右栏文件；grant读取仅限定预置asset。

### Task 1: 原生输入交付物示意

Files: scripts/lib/figma-composer-deliverable-preview.mjs、src/preload/figma-inline-references.css、input-deliverable-assets、test/input-deliverable-preview-browser.test.js。

- [x] 真实InputBar红测→按builtin ID/offset派生单图→删除保焦点→生产CSS cascade和长文/窄窗验证。
- [x] 中文提交4e4fa9bc；32/32直接相关测试与typecheck通过。

### Task 2: 公共教程控制与大卡入口

Files: src/preload/home-guides.ts、home-guides.css、home-guide-timeline.ts、home-operations.ts、index.ts、test/home-guide-timeline.test.ts、test/home-guides.test.ts。

Interfaces: mountHomeGuides(document,{notes,presentation})返回start(kind,context)/reset/dispose；适配器mount(host,{signal,runId,sessionId})→runStep(step)/dispose。

- [x] 时间轴红测：有序执行、暂停冻结、取消后无后续步骤、重播不并发。
- [x] 实现公共控制、center pane定位、退出/身份/会话取消与焦点恢复。
- [x] 大卡click/Enter/Space触发当前case；轨道点击不启动。
- [ ] 运行聚焦测试并中文提交。

### Task 3: 研究教程原生适配

Files: scripts/lib/home-guide-native.mjs、test/home-guide-native*.test.js。

Interface: patchHomeGuideNative(source)；window home-guide-native request/reply，命令限定mount-board/board-* /dispose。

- [ ] 真实nativeCanvas红测→内存registry/provider→组件库/创建/联动/增加/整理。
- [ ] 取消/重挂载/原会话不变/无外部provider请求/幂等升级验证。
- [ ] 中文提交。

### Task 4: 笔记教程

Files: src/preload/home-guide-notes.tsx、home-guide-notes-data.ts、notes/editor.tsx限定optional guide API、tests。

Interface: mountHomeNotesGuide(document,host,{signal,onStatus?})→runStep(write/challenge/select/replace)/dispose。

- [ ] 真实NotesApp红测→内存NotesBridge→分批样文、严格挑战、标记优化替换。
- [ ] 默认编辑器行为回归、取消后不再写入与无正式IPC验证。
- [ ] 中文提交。

### Task 5: PPT教程与精确预览

Files: src/main/home-guide-assets.ts、scripts/lib/home-guide-presentation-native.mjs、src/preload/home-guide-presentation.ts、tests。

Interface: mountHomePresentationGuide(document,host,{signal,sessionId,runId})→runStep(brief/plan/layout/deliver/open)/dispose。

- [ ] 预置asset枚举授权、拒绝任意路径、取消与revoke红测。
- [ ] 私有真实InputBar/TodoPanel+真实右栏Office预览，不伪造用户任务。
- [ ] 真实浏览器组件和native readiness检查后中文提交。

### Task 6: 聚焦复核与正式身份本地交付

- [ ] 新鲜独立review并修重要问题，保存明确的物理鼠标诊断限制。
- [ ] 按multi-session runbook handoff/preflight/integration，main保持干净。
- [ ] ./script/build_and_run.sh --verify，验证签名包与真实主界面。
- [ ] 深浅/宽窄三教程播放与退出恢复，留下正式客户端供测试；更新本计划证据。

## 实现进度与证据（2026-10-24）

- Task2公共控制：15个直接unit通过；入口/短窗/面板/编辑7个browser通过；600/700笔记真实组合5个通过；4项独立审查失败测试已修，身份取消和挂载失败另有红绿。原native主界面终验仍待构建。
- 研究303d43ed/strip2e3f1d64；PPT856b4d39/右栏85f86c57/strip760b49f8；笔记cb5a4eec/组合08b6009f/长暂停5e09d495；输入封面4e4fa9bc/严格orphan修复60c367f6；字体缓存d6c3f8c5。
- 字体真实InputBar两轮五标签逐字删除：相同定义只构造6个，base1，第二轮无新增，卸载0；不等同物理指针根因已定位。
- 额外实现取舍：教程模式用owned-click真实原生tab，原生笔记surface在scopedguide/恢复lease期间抑制，私有NotesApp仍真实渲染；用户导航不强制恢复，身份切换不抢旧焦点。
- 完整patch pipeline在前端原生补丁前先严格卸载教程wrapper，末尾重补输入helper和教程，已连续两遍exit0，最终四个runtime区段各1。曾经发现的孤立helper/Root锚点错误已有独立红绿。
- 只跑直接关联组件/教程/字体/输入测试，没有运行全产品套件。
