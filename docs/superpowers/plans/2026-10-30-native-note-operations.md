# 原生笔记操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让空格与右侧对话直接操作同一份可编辑笔记，并让原生表格适合日常编辑。

**Architecture:** 复用现有 Notes lease、capability bridge、BlockNote、Yjs和保存链，增加共用原生操作执行器。简单明确结构在共享 generate 入口直接执行，复杂请求通过同一原生能力编排；原研究组件用于行情与交互内容。表格交互在笔记层完成，不修改共享SDK。

**Tech Stack:** TypeScript、React、BlockNote0.55、ProseMirror、Yjs、既有Notes Main IPC及Vitest/真实NotesApp Browser。

**Spec:** `docs/superpowers/specs/2026-10-30-native-note-operations-design.md`

## Global Constraints

- 当前隔离基线为 `31b3de76ee5c0d05787ef3d7008ec697717ca3e9`；保留当前已实现功能，不从旧main回退。
- 功能worktree不得构建或替换共享客户端，不写用户数据，不通过修改共享node_modules测试。
- 保留4MiB、1万块、owner/session/document/generation/取消与修订门禁。
- 仅相关聚焦验证；每个独立可验收修改用中文本地提交，不发布、不推送。

## Review Focus

- “8×8”与带填充要求的同句请求：前者直接空表，后者不能误走丢失内容的确定性分支；任务1覆盖。
- 移动只改变顺序而不改变块JSON：仍须拥有可撤销记录；任务2覆盖。
- 后续人工修改和同ID重建：撤销不能抹掉新内容或恢复旧身份；任务2覆盖。
- 搜索/输入法与表格单元格焦点：新控件不能触发整卡引用、Space或错误目标写入；任务3覆盖。
- 菜单、拖动途中取消与窄视口：不裁切、不残留、不因缩放而降低可读性；任务3覆盖。

## Task 1: 共用原生操作与快速空表

**Files:** 新增 `src/preload/notes/native-operations.ts` 与对应测试；按现模块边界修改 `packages/dsh-research-task-runtime/client-capabilities.js`、Notes AI规则/结果处理、`src/main/notes/document-capability-adapter.ts`、`src/preload/notes/client-capability-actions.ts` 与 `editor.tsx` 最小接线。实现者先核同名既有模块，禁止并行重复能力。

**Interfaces:**
- Consumes: 现 Notes capability lease、scope、真实editor API、现保存及原位插入锚点。
- Produces: `notes.blocks.read/apply/undo` 三个能力；共享本地执行器与明确空表intent解析。read返回快照身份和revision；apply接收快照、操作批次，返回actionId/changedBlockIds/真实applied或saved；undo绑定actionId及当前读取。

- [ ] 写失败用例：两个入口 `创建一个8乘8的表格` 得到8行8列table，无research块/模型/child调用，64格为空。
- [ ] 写边界用例：`创建8×8表格，填入上文的收入数据` 不丢弃填充要求；失效锚点、只读、忙碌或取消不执行。
- [ ] 复现失败，再实现严格完整结构intent，在共享入口调用同一原生executor/保存链；Side与Space不复制两份逻辑。
- [ ] 复杂内容默认原生表格/正文/列表/代码，仍允许图片与适合的研究组件；无结构化输出时沿现文字兜底在正文给结果，不能仅在需求框报格式错误。
- [ ] 运行该新聚焦组、现capability adapter/lease/inline结果相关组与TypeScript；记录调用数和时间，中文提交。

## Task 2: CRUD、位置归属与精确撤销

**Files:** Task1同一feature；`inline-ai-proposals.ts` 及现capability handlers/contract等必要小范围文件；新增原生操作真实编辑器Browser测试。

**Interfaces:**
- Consumes: Task1原生executor和快照身份；现proposal journal/保存确认。
- Produces: 原子insert/update/move/remove批次、读写真实块ID/父级/顺序、精确undo；统一短反馈和既有确认/撤销界面。

- [ ] 写失败用例：读指定表，修改单元格；正文和列表移动；删除再撤销；一次批次同时插入表格和段落。
- [ ] 写保护用例：重复request、旧修订、Y身份改变、后续人工改写、切会话、保存失败、纯顺序移动。
- [ ] 先全批预检后一次事务；记录块值和相对顺序/父级/身份，保存后返回实际效果；不以全局Undo冒充归属撤销。
- [ ] Space与侧栏保各自明确目标，修订变更不能默默改写文末；减少仅处理笔记任务的内部协议/推理展示，保简短过程和结果。
- [ ] 相关测试及保存重开通过，中文提交并生成正式交接卡；独立审查原权限、事务和撤销边界。

## Task 3: 原生表格尺寸与操作菜单

**Files:** 独立 `codex/feat/notes-native-table-ui-20261030`，新增 `src/preload/notes/native-table.tsx`、`native-table-layout.ts`、`native-table.css` 与真实NotesApp测试，在`editor.tsx`少量接入。不与Task1共写执行器。

**Interfaces:**
- Consumes: BlockNote真实table `content.columnWidths`、行列内容、正文可用宽度、原生编辑器扩展与Undo。
- Produces: 原生table控制条、整体宽度/适应正文/平均列宽、复用原生行列操作、专属顶层菜单。Task1空表可使用同一纯宽度计算器，或Root在集成时接线。

- [ ] 真实NotesApp复现8列默认溢出及左菜单问题，再写窄/宽布局与菜单命中用例。
- [ ] 计算并持久化新表合理columnWidths，已有明确列宽保留；表内局部滚动，不缩小文字。
- [ ] 增加清楚的表格/行/列入口、整体宽度拖柄与键盘动作，复用原生行列增删/移动与单列拖宽。
- [ ] 拖动只预览、结束一次提交，Escape/取消不保存；菜单外点/Escape/模式切换关闭，保留单元格焦点和原编辑器登记。
- [ ] 真实NotesApp验证编辑、拖动取消、键盘、一次Undo、保存重开和旧表列宽；中文提交、正式交接、独立审查。

## Task 4: 合并与实际客户端验收

**Files:** 活动integration批次与`/tmp`验收证据；不手改manifest或租约。

**Interfaces:**
- Consumes: Task1/2与Task3两个干净feature交接卡及精确tip。
- Produces: 官方合并检查通过的干净integration、本地签名测试包、Native验收结果。

- [ ] 正式append/preflight/merge两项功能，保留既有V3、完整9b、IME/fallback及Header修复；冲突分别审查相关hunk。
- [ ] 使用隔离依赖验证installer两遍幂等及最终包字节一致，再运行`./script/build_and_run.sh --verify`和完整包检查。
- [ ] Native分别在Space/侧栏创建8×8并编辑格子，检查快速显示、零模型/零子任务、菜单/拖宽/撤销、保存换会话重开。
- [ ] 实测几条原生读改移删与组合请求；重跑完整中际旭创演示、组件Header直接操作与欢迎页保留；将已有用户新增8×8组件和原生表格均视为用户内容，不删除。
- [ ] 留测试客户端打开，报告实际结果与限制；不自动接受、晋升main或发布。
