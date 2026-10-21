# 笔记重查引用稳定性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重查能参考当前未解决标记的精确引用，减少同一问题因引用伸缩而新增卡片，同时保持独立审查、独立问题与既有讨论。

**Architecture:** 客户端从当前笔记的活动标记投影出只有 blockId/quote 的引用列表；公共纯函数验证引用并按块轮流选择，最多64项、JSON长度8000字符。scheduler 把引用成本计入已有字符预算，IPC 只转发这一个新字段，runtime 严格验证后只向当前 targets 发送相关引用。模型仍独立审查正文，已有引用不是证据或免检名单；宿主不增加模糊合并或重叠丢弃。

**Tech Stack:** TypeScript、React、Yjs/BlockNote、ESM runtime、Vitest、真实挂载浏览器测试。

**Spec:** `docs/superpowers/specs/2026-10-21-notes-challenge-v16.md`；用户要求低打扰、保留正文/讨论/草稿，并优先优化笔记挑战。基线 `82a195a2e85616b61d66969bd434cd0d436ccc54`。

## Global Constraints

- 不覆盖当前用户笔记；正文、已接受内容、讨论、未发送草稿、日期与布局保留。
- 不新增未授权联网或读取历史/文件。引用只来自本次正文内的活动标记，绝不发送评论消息、回复或草稿。
- 不全套测试、不发布、不推送、不改版本；feature worktree 不构建共享客户端。
- 新字段可选；不传字段的旧调用保持行为。所有开启档位的明显错误底线、现有输出/超时/重试/事件预算保留。

## Review Focus

- 已改正确的内容仍有旧标记：模型不得因此认定它错误，纯正确且附标记的实机对照必须零问题。
- 同段两个独立问题或包含关系：不凭重叠合并，不删除新问题；现有独立评论用例继续通过。
- 过期、重复或不存在的引用：前端跳过；runtime 对无效输入严格拒绝，不把它当正文或证据。
- 多块标记与容量：公平选择，最多64项/8000 JSON字符，单quote最多2000字符；引用成本计入scheduler十分钟字符预算。
- 关闭/切换/过期请求：不丢讨论、草稿和待应用建议；不得泄露其他笔记的标记或用户回复。

### Task 1: 当前引用上下文贯通与验证

**Files:**
- Create: `packages/dsh-research-task-runtime/notes-challenge-review-context.js` 及 `.d.ts`。
- Modify: `src/shared/notes-challenge.ts`、`src/preload/notes/challenge-controller.ts`、`src/preload/notes/challenge-scheduler.ts`、`src/main/notes/service.ts`、`packages/dsh-research-task-runtime/notes-challenge-runtime.js`。
- Test: `test/notes-challenge-review-context.test.js`、`test/notes-challenge-scheduler.test.ts`、`test/notes-challenge-controller-browser.test.js`、`test/notes-challenge-service.test.ts`、`test/notes-challenge-runtime.test.js`。

**Interfaces:**
- `ChallengeReviewAnchor = {blockId:string;quote:string}`；`ChallengeRequest.existingAnchors?: ChallengeReviewAnchor[]`，只供 review。
- `challengeReviewAnchors(anchors: readonly ChallengeReviewAnchor[], blocks: readonly ChallengeBlock[]): ChallengeReviewAnchor[]`：投影出唯一且仍精确定位的引用，按块轮流选择；上限64/8000/2000。
- scheduler 可选回调 `getReviewAnchors?(): ChallengeReviewAnchor[]`；调度时估算、执行前重新取当前目标块引用；标记本身变化不触发新检查。

- [x] **Step 1:** 写RED用例：真实挂载的 review 请求携带精确引用，正文/讨论/草稿不变且无回复内容泄漏；IPC 透传新字段；runtime 在每批只送相关引用并拒绝无效引用；helper与scheduler容量/公平/预算用例。Expected: 新行为相关断言失败，而非测试基础设施错误。
- [x] **Step 2:** 实现公共投影与可选类型；controller 回调只读活动标记。scheduler 对实际被检查的 target 块选择引用并把 JSON长度加入现有 chars 计费。IPC 白名单加入 existingAnchors；runtime 验证同块唯一精确引用、重复、64/8000/2000与 review action 限制。
- [x] **Step 3:** review 提示说明引用仅用于稳定范围，可能过时或错误；同问题尽量逐字复用，不扩大背景；新独立问题仍分别提出，不以已有标记作为事实依据。宿主接收/评论匹配逻辑不变。
- [x] **Step 4:** 运行新用例及相关 controller/undo、scheduler、service、runtime、recall、consensus 聚焦检查，`npm run typecheck`、`git diff --check`。Expected: 全部通过，无全功能测试。
- [ ] **Step 5:** 中文本地提交；独立整项复审，处理阻塞发现。按多session手册刷新交接/预检/集成；从干净集成提交 `./script/build_and_run.sh --verify`、包检查并核验真实主UI与新模块source/profile parity。
- [ ] **Step 6:** 实机只读重查：原文附当前引用重复3轮，逐项人工判断新增引用是否为新问题；纯正确内容附引用零误报；四档12错误/5对照仍通过。原文恢复前台，核对讨论、两条草稿、正文与日期保留。有限样例不等于保证所有未来生成完全稳定。

**Completion:** 传递/隐私/容量/独立问题测试与真实模型证据齐备；不能仅凭模型HTTP200或mock回填旧quote宣称重查稳定。遗留重复历史不迁移、不删除、不代替用户解决。
