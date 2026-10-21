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
- [x] 经现有集成批次交接/预检/合并，./script/build_and_run.sh --verify；包检查，原生笔记输入/五档/评论/回复/优化/证据/重启恢复，保留客户端打开。

### Task 4: Centered document and right-aligned comments

- [x] 按最新用户截图修订，移除评论导致的正文左移；正文始终相对笔记主区域居中，宽屏评论列固定在主区域最右侧；按随后单气泡截图，窄屏浮动气泡贴近原文。
- [x] 真实mountNotes回归覆盖3440/1600/1180/900主区域、右侧全局页签占宽、居中/右边距/横向溢出/滚动及已有交互；中文提交后本地集成构建并原生核验。

## Ledger

- 2026-10-21：已读取原session完整用户修订和最终方案；Figma原生外壳、评论及五档滑条已取得高保真上下文及截图。使用现有隔离功能worktree，之前工作台修改已分别提交 f7fa7381/ce19775f，不把其新效果冒充已构建客户端。
- Ruling: 后续用户修订覆盖早期状态条、独立开关、回复入口和撤销按钮设计；低打扰要求优先，过程信息仅在右侧页签中用户主动查看时呈现。

- 2026-10-21 实现审查：runtime/consensus、scheduler/anchors、IPC、右侧证据页签已分别中文提交。重要修正包括非全年/调整口径不与全年EPS比较、IME停顿与定时预算、失败后等待实际变化或重查、软换行锚点、长线程输入容量、人工写作取消、同原文锚点去重更新。
- 生产UI验证使用真实 mountNotes 注入路径，没有额外注入fixture CSS；宽/窄、浅/深、常驻多行回复、仅原文替换、解决、Yjs恢复及原生手动评论均为实编辑器路径。
- 关闭仅暂停自动检查，已有评论、依据与回复仍能阅读；此行为已再次核对原设计session用户认可的状态。
- 来源边界：只识别实际授权且明确只读SQL schema的infodb工具；API发现式MCP未被可靠识别时返回unavailable，不以示例或外部数据替代。滚动数据与C4本轮未启用；单段超过12000字符保留待检并标明partial。
- 下一验证门：本地集成预览包真实模型任务、重启恢复和右栏来源链路；未把浏览器mock结果当作模型效果。
- 2026-10-21 原生第一轮：集成提交 abcc023124614ff14adf1ecca27dc064ed93ecf8 已经 `./script/build_and_run.sh --verify` 与完整本地包检查通过，版本仍为 1.3.4。真实 GLM-5.3-Flash 对自建虚构笔记识别 15/20 与 90% 矛盾、无对照组唯一归因与错字；同线程不修改回复、显式原句优化、右侧真实原文依据均已核验，原有会话可见。
- 原生验收发现的交付门禁：撤销边界经真实 BlockNote/Yjs 浏览器裁定正确，但撤销优化后评论仍持新引用而暂时隐藏；重启后正文/档位/评论/回复草稿均存在，Yjs 原始编码不同却误触发相同内容恢复提示。两项须修复后重新构建验证，不将首轮部分通过当作最终完成。
- 新增用户修订：组件生成状态卡应绑定触发生成的原消息轮次，新消息不能把旧卡带到最新底部；进度与重试继续在原卡片更新。该项独立聚焦回归后随本批本地预览验证。
- 2026-10-21 原生修复验收：集成提交 b74964fba0b21f7ca022fc356012b337e9120478 构建、签名和本地包检查通过。已有笔记直接打开，无伪草稿提示；标准档位、原文、评论和未发送回复保留。真实模型优化“成度”为“程度”，单次原生撤销仅恢复原句，重做恢复建议，讨论和未发送草稿随同回映；解决重叠标记后另一个活动评论可重新点开。右侧依据只呈现实际原文与本次 review，不再把非金融笔记列入一致预期检查。
- 交付前统一聚焦验证：20文件213项通过，TypeScript检查通过。追加的同轮插队场景使用真实 compactConversationFlow / mergePendingSteeringFlow 红绿回归，3文件20项通过；普通user、steering与pending-steering均为旧卡位置边界，插队后仍保留原卡DOM身份与独立重试。追加修复 1c2414b8 已随集成8f3d84b本地包构建及包检查通过，原生滚动历史核验：8/8卡位于原回复操作栏之后、下一条用户消息之前，后续“你好”下没有重复卡。笔记代码不变。
- 2026-10-21用户新增布局修订：正文仍须相对笔记主区域居中，评论列和窄屏气泡固定到主区域最右侧；不再采用原文旁横向紧邻的位置。纵向锚点、滚动和交互继续保留，按Task4补齐回归及原生验收。
- 布局实现 ea252c6e：正文宽屏左右对称留白以保持主区域中心，评论列/窄屏气泡右边距16px，中等区域正文对称收窄避免遮挡。真实mountNotes覆盖3440/1600/1180/900与全局侧栏变化、评论滚动、输入焦点/草稿、关闭/ESC不复活；3文件18项与类型检查通过。root已目视3440和1180截图，待本地包原生验收。
- 布局交付验收：root补跑4文件19项与TypeScript通过，独立审查通过；集成4c464468426979faefbaadbe0c1dc4071acb615d已按本地手册构建、签名及完整包检查通过。真实3440宽客户端在右侧对话栏打开时，独立虚构笔记“AI挑战 · 布局验收”正文仍居中，真实模型产生的两个评论位于笔记区域最右侧。客户端保持打开。证据记录 /tmp/notes-challenge-native-validation-20261021.json；本条为构建后文档记录，不涉及新产品代码。

### Task 5: Nearby floating comments in narrow note areas

- [x] 复现用户1157px主区域单气泡远离原文：窄屏布局误用了固定最右位置；真实mountNotes回归先失败，水平偏移652.5px。
- [x] 窄屏气泡按实际引用起点定位，优先下方、底部不足时上方，水平方向保持可见；宽屏最右评论列及正文居中不变。
- [x] 相关布局回归增加到12项，覆盖1157/900原文附近、底部翻转、滚动、右边界与原有宽窄切换/草稿/焦点；另补原文滚出上下视口时气泡仍可见且回复焦点/草稿保留。截图已目视。Browser plugin not available，使用既有隔离Playwright真实mountNotes测试，客户端交互仍使用CUA。
- [x] 相关编辑/撤销/内联生成4文件24项回归、TypeScript检查与独立审查通过。日志 /tmp/notes-challenge-nearby-delivery-focused-20261021.log、/tmp/notes-challenge-nearby-delivery-typecheck-20261021.log。
- [ ] 本地集成构建后，点击现有真实评论核验位置与正文保存。
- 审查捕获并修复：选定原文滚出视口后，优先上下位置仍须统一限制完整边界，否则回复框有焦点却不可见。上下两个方向均先观察到失败，再修复。
