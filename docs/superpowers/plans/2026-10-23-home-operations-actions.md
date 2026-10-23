# 首页四卡动作实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 四张小卡可直接打开看板/笔记，或回输入区插入内置技能及主题留白模板。

**Architecture:** 继续由首页 controller 管理动画和点击生命周期；独立 actions 模块组织导航与技能调用。原生页面桥负责会话准备/Tab，既有技能输入桥扩展可选预填与选区，复用真实 input shell。

**Tech Stack:** TypeScript、现有 preload/renderer 页面事件桥、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-23-home-operations-actions-design.md`

## Global Constraints

- 看板 native view=`research`，笔记=`notes`；PPT/研报技能 ID 固定，revision/alias 从实时数据获取。
- 六个全角主题空格自动选中，不发送、不覆盖已有草稿/图片/引用、不绕过只读。
- 保持已验收视觉与运动，功能工作区不构建共享客户端；仅聚焦验证，中文本地提交。

## Review Focus

- 无工作区或无 current 会话时，提示/原生物化路径明确且不会建多个会话。
- 用户切换会话或身份后，慢技能查询不写入另一个草稿。
- 已编辑的提示词与附件在重复点击、失败或撤销时得到保留。
- 输入区仍 inert 时不抢焦点；主题选区须按真实 chip 占位长度定位。
- Tab 点击、键盘激活、快速连点与卸载均只产生一次有效动作。

### Task 1: 原生会话与 Tab 导航（repo_recon）

**Files:** 新增 `src/preload/home-operations-navigation.ts`、`test/home-operations-navigation.test.ts`；修改两份现有 client patch 注册文件。

**Interface:** `installHomeOperationsNavigation({document?,sessions,workspaces,inputHub,composerBlocks}) => dispose`；window request/reply=`sherlock:home-action-request/reply`，action=`research|notes|composer|cancel`，reply 含 sessionId。

- [x] 写并观察当前会话复用、无会话去重、原生 Tab、取消/只读红测。
- [x] 实现窄原生桥及幂等 patch/export/cleanup。
- [x] 运行导航与直接 patch 回归。

### Task 2: 技能标签与预填（interaction_recon）

**Files:** `src/shared/integration-ui.ts`、`src/preload/integrations/skill-use.ts`、`skill-composer.ts`，以及对应两份测试。

**Interface:** `SkillComposerPrefill={text:string;selectionStart:number;selectionEnd:number}`，`IntegrationBridge.useSkill` 增可选 `prefill`。输入前校验范围/16000上限及真实 reference，插入后选中主题；已有同 reference 与非空正文不叠加模板。

- [x] 用真实 SessionInputShell 观察标签+模板/选区/附件/重复/非法输入红测。
- [x] 用 native insertReference/insertText、fresh draftRev 实现，保持旧使用技能路径。
- [x] 运行对应 skill composer/use 聚焦检查。

### Task 3: 首页接线与动作组织（root，focused_browser_tests 验证）

**Files:** 新增 `src/preload/home-operations-actions.ts`；修改 `home-operations.ts`、`index.ts`；新增 actions 测试、扩原浏览器测试。

**Interface:** `createHomeOperationsActions(document,bridge).run(card,{signal,revealComposer}) => Promise<void>`；`mountHomeOperations(document,{onAction})` 点击调用，revealComposer 等输入区稳定并解除 inert 才 resolve。

- [x] 观察四卡当前无行为的红测。
- [x] 实现看板/笔记调用导航，PPT/研报先回输入再准备会话、读取 catalog、调用 useSkill(prefill)；失败可见，防重且不自动发送。
- [x] 运行跨真实 shell 的 actions、浏览器回输入时序、生命周期检查。

### Task 4: 验证与交付

- [ ] 类型检查、直接受影响回归与独立审查；修复后聚焦复验，不跑全仓。
- [ ] 中文本地提交及精确 tip 交接；独立原生客户端验证四入口与选区，保持可测试。
- [ ] 记录实际证据、限制与源提交，按既有多会话流程集成。

## 验证与后续构建

- 2026-10-23：四动作、导航和技能输入相关测试 106 项通过；此前 preload 6 项通过。类型检查、diff 检查通过；只运行直接相关检查。
- 独立审查发现的会话 A→B→A、取消后 RAF 聚焦、catalog 等待期间编辑草稿三处竞态均已加入真实 SessionInputShell 红绿回归。原生 ready 回执捕获 draftRev，prepare 校验原版本后才允许添加。
- 用户最新明确要求用正式客户端构建，不用临时客户端。已停止临时预览；按本地 main 集成和本地测试运行手册构建，不发布、不递增版本，不把自动检查记作用户最终验收。
- 用户另追加窄栏响应式优化，单独修改与提交；最终合并后统一构建正式客户端核验。
