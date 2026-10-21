# Notes Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在现有笔记模式交付低打扰、五档、可定位评论、AI优化/回复与真实一致预期比对。

**Architecture:** BlockNote/Yjs持久化等级、原生评论和锚点；正文语义指纹驱动有界增量调度。独立运行时生成结构化检查，程序校验原文及计算一致预期；右侧注册证据页签，人工写作与账户/会话生命周期仍由原通道控制。

**Tech Stack:** React/TypeScript、BlockNote、Yjs、现有Harness和受控IPC；不加依赖。

**Spec:** ../specs/2026-10-21-notes-challenge-implementation.md

## Global Constraints

- 默认关闭；五档、灰色评论、常驻回复、依据条件显隐与右侧独立页签。
- 仅有实际证据才能判事实错误；一致预期仅infodb，计算由程序执行。
- 不改用户正文/草稿/格式，不全功能测试，不在功能worktree构建共享客户端。

## Review Focus

- 输入法组词/样式/评论/心跳不产生重复请求。
- 响应晚到、切会话/账号/后台时不写旧评论或替换旧文本。
- 原文重复/删除/格式化后不把问题挂到另一段；多行回复不丢草稿。
- 一致预期零/负/缺失及历史回退不造成虚假强结论。
- 宽窄切换、浅深色、长评论与证据页签保留输入焦点及全部内容。

### Task 1: Review runtime and deterministic consensus

**Files:** 新增 packages/dsh-research-task-runtime/notes-challenge-runtime.js、notes-challenge-consensus.js 及聚焦测试。共享类型 src/shared/notes-challenge.ts 已冻结。
**Interface:** 导出 generateNoteChallenge(ctx,input,signal)→ChallengeResult；registerNotesChallenge(ctx,{isTrustedRequest})→dispose，端点 /sherlock/notes/challenge。后台请求不写主会话对话；继承会话模型/实际可见只读来源，严格预算和取消。优化与回复不能任意写正文。

- [x] 先写正常/无问题、超时/取消、伪造锚点/证据、口径和快照边界失败测试。
- [x] 实现可审查结果、确定性计算及实际授权来源接入；不可用明确返回checks。
- [x] 聚焦测试、只读审查和中文独立提交。

### Task 2: Scheduler, native comments and interaction

**Files:** 新增 src/preload/notes/challenge-*；修改 editor.tsx/style.css、main/notes/service.ts；测试对应模块。
**Interface:** 调用 Task1 HTTP；Yjs存等级及原生评论metadata。语义正文变化→有界请求→重新核验→原生thread+mark；优化只替换有效原文范围，回复同线程。

- [x] 测试等级/停顿/最短间隔、IME、未完成句、合并/取消/预算/旧结果/去重。
- [x] 五档滑条与原生宽窄评论，依据显隐、常驻多行回复、解决及恢复。
- [x] 受信IPC与请求取消、人工写作优先；只读审查和中文独立提交。

### Task 3: Evidence tab and delivery

**Files:** scripts/lib/notes-challenge-client.mjs，接入 notes-client.mjs；相关补丁/浏览器测试。

- [x] 测试右侧页签按当前会话接收真实依据、原文定位、关闭与用户文本转义。
- [x] 实现右栏页签及全链路浏览器验证，类型检查和独立审查。
- [ ] 经现有集成批次交接/预检/合并，./script/build_and_run.sh --verify；包检查，原生笔记输入/五档/评论/回复/优化/证据/重启恢复，保留客户端打开。

## Ledger

- 2026-10-21：已读取原session完整用户修订和最终方案；Figma原生外壳、评论及五档滑条已取得高保真上下文及截图。使用现有隔离功能worktree，之前工作台修改已分别提交 f7fa7381/ce19775f，不把其新效果冒充已构建客户端。
- Ruling: 后续用户修订覆盖早期状态条、独立开关、回复入口和撤销按钮设计；低打扰要求优先，过程信息仅在右侧页签中用户主动查看时呈现。

- 2026-10-21 实现审查：runtime/consensus、scheduler/anchors、IPC、右侧证据页签已分别中文提交。重要修正包括非全年/调整口径不与全年EPS比较、IME停顿与定时预算、失败后等待实际变化或重查、软换行锚点、长线程输入容量、人工写作取消、同原文锚点去重更新。
- 生产UI验证使用真实 mountNotes 注入路径，没有额外注入fixture CSS；宽/窄、浅/深、常驻多行回复、仅原文替换、解决、Yjs恢复及原生手动评论均为实编辑器路径。
- 关闭仅暂停自动检查，已有评论、依据与回复仍能阅读；此行为已再次核对原设计session用户认可的状态。
- 来源边界：只识别实际授权且明确只读SQL schema的infodb工具；API发现式MCP未被可靠识别时返回unavailable，不以示例或外部数据替代。滚动数据与C4本轮未启用；单段超过12000字符保留待检并标明partial。
- 下一验证门：本地集成预览包真实模型任务、重启恢复和右栏来源链路；未把浏览器mock结果当作模型效果。
