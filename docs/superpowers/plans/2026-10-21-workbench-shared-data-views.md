# Workbench Shared Data Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline, task by task. User authorizes autonomous implementation; do not add confirmation pauses. Use a separate reviewer only for the final review required by the skill.

**Goal:** 共同记录一次确定，按业务组合不同视图并可靠交互，减少重复生成与跨卡矛盾。

**Architecture:** 新增严格的共同数据/视图引用契约，宿主生成非执行数据 artifact；已有 HTML/金融等路径保留。由现有共享状态 SDK执行确定性交互，面板只存独立展示状态。

**Tech Stack:** JavaScript ESM, existing artifact renderer, parse/validation helpers, Vitest and Chromium focused checks.

**Spec:** docs/superpowers/specs/2026-10-21-workbench-shared-data-views.md

## Global Constraints

- 仅聚焦测试，每个通过验证的修改中文本地提交；不推送、不发布、不晋升main。
- 不改用户现有数据/草稿/手动框；第一版共用数据路径仅明确模拟数据，真实资料保持原流程。
- 不截取字段/记录、不猜共同值、不给普通组件添加节点；原始单位、空值和说明保留。
- 完整视图就绪后才交接本地集成包；feature worktree不得构建共享客户端。

## Review Focus

- 非法/重复ID、未声明字段、危险键、非JSON值与容量溢出须在任务启动前拒绝。
- 视图未知字段、重复比较对象、缺失/相反日期、重叠资源与零/负数不可静默丢失。
- 筛选后排序只改变当前视图；恢复时控件值、可见行、比较项与详情保持一致。
- 窄框/长中文/长备注及四主题不得裁切标签或隐藏操作。
- 老工作台重试和真实来源路径、保存/共享/导出、模板数据读回不能回退。

### Task 1: Strict data and view contracts

Files: create packages/dsh-research-task-runtime/dataset-view-contract.js; test test/dataset-view-contract.test.js.
Interfaces: validateWorkbenchDatasets(value)->validated array; validateDatasetView(config,datasets)->{dataset,view}; datasetViewDataIssue(artifact)->string|undefined.
Steps: write rejecting/preservation/ref tests; verify RED; implement validation with exact keys/budgets; run focused tests; Chinese commit.
Completion: 8-record identity/units/null/long-text roundtrip and every invalid input fail before dispatch; no renderer or tool exposure yet.

### Task 2: Deterministic composable renderer

Files: create dataset-view-artifact.js and dataset-view-runtime.js; tests dataset-view-browser.test.js and dataset-view-artifact.test.js.
Interface: renderDatasetViewArtifact(data)->HTML spec|null. Raw HTML uses retained source snapshot; runtime registers once and receives dataset/config from inert JSON. Source values are rendered with textContent/escaped static first paint.
Steps: RED for consistent records/compare/schedule, sorting/filter/restore, missing/conflict/long-text and narrow geometry; implement; run Chromium/contract checks; Chinese commit.
Completion: three distinct views of one dataset, all original values equal; semantic interaction restore and four-theme responsive geometry verified.

### Task 3: Tool/plan/acceptance integration

Files: workbench-plan.js, workbench.js, component-template-registry.js, artifact-output.js, workbench-design-contract.js, planning guidance and bundled component skill; focused plan/dispatch/model-retention tests.
Steps: RED for actual tool creating three prepared views from one shared dataset with zero child generation; implement optional API and preserve persisted inputs/retry; expose concise guidance with example and update skill version; run directly affected checks/typecheck; Chinese commit; final independent review; handoff/merge through batch20261019-05; native local build/verify and realistic business-only generation test.
Completion: actual tool boundary renders all records directly; old/deferred/source routes retain behavior; final package/UI verified. Speed claims use observed native timings only. Full goal stays active while other requested financial/content/interactions remain unverified.

## Execution ledger

- 2026-10-21: design grounded in failed native book benchmark; existing feature edda791f and integration a49dee42 clean. Task1 ready. No new API exposed or shared client rebuilt for this work yet.
- Task1 complete: dataset-view-contract.js and 30 red→green checks. Limits:5datasets,200records/dataset,24fields,8000characters/cell,48000bytes/dataset,192000total,4sections,8000viewbytes. Every record declares all fields; null is explicit; day-only or timezone-bearing schedule instants only. Negative/zero/false/arrays/literal markup preserved. Evidence /tmp/dataset-view-contract-{red,green}-20261021.log. No tool or renderer exposure yet.
- Task2 complete: deterministic records/compare/schedule sections and shared SDK state. First paint retains all records; compare shows current object headers; missing schedules remain visible; real overlaps are marked without changing times. Tests cover filtered reordering without moving hidden identities, selected details, complete selector/tab restoration, read-only controls, narrow/wide layout, and four themes × three widths for long schedule owners. Two actual browser RED cases (fixed button height, missing schedule zone/header) repaired at host/presentation level. 58 related checks passed; /tmp/dataset-view-renderer-final-20261021.log. No tool exposure or client replacement yet.
