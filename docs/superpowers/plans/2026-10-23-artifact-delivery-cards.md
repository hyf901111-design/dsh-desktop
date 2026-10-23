# 文件交付卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成消息集中呈现可操作的正式文件交付卡片。

**Architecture:** 升级现有 turn-tail 产物插件，补充最终答复明确链接与已核验研报结果；复用文件预览和现有系统打开服务。独立路径模型可序列化注入客户端，无新增依赖。

**Tech Stack:** JavaScript 插件补丁、React 18、Electron、Vitest。

**Spec:** docs/superpowers/specs/2026-10-23-artifact-delivery-cards-design.md

## Global Constraints

- 不修改消息内容、报告文件、用户数据或正式版本。
- 保留 turn/seq 边界；只有最终完成消息呈现卡片。
- 只运行直接影响的聚焦测试；候选树构建和真实客户端验证。

## Review Focus

- 缺失文件与误写链接不能假装已验证完成。
- 相对路径、裸文件名、中文括号和同名文件不得猜错目标。
- 失败或取消的专用工具不能进入成功交付集合。
- 普通网页与代码示例不能成为本地卡片。
- 窄面板、明暗主题及键盘菜单不能裁切文件名或操作。

### Task 1: 文件来源与路径模型

**Files:** scripts/lib/delivery-file-model.mjs; test/delivery-file-model.test.js

**Interfaces:** 输出 normaliseDeliveryPath、deliveryPathsFromMarkdown、mergeDeliveryPaths、verifiedResearchDeliveryPaths 与 deliveryModelSource；均无外部依赖，失败安全返回空值。

- [ ] 先写并运行路径和研报失败边界测试，确认 RED。
- [ ] 实现稳定归一、明确 Markdown 链接提取、同路径去重和核验结果提取，运行 GREEN。
- [ ] 中文本地提交，仅包含本项文件。

### Task 2: 卡片与插件接线

**Files:** scripts/lib/deliverable-cards.mjs; scripts/patch-web-frontend-loading.mjs; src/main/native-file-menu.ts; test/deliverable-cards.test.js; test/native-file-menu.test.ts

**Interfaces:** patchDeliverableCards(source)、patchDeliveryConversation(source)；注入模型和 React 卡片到现有插件，添加 final text/cwd/会话信息；由既有 workspaces 服务完成默认应用打开。

- [ ] 先写补丁/真实 React 渲染/菜单动作测试并确认 RED。
- [ ] 实现卡片、常见类型、辅助折叠、缺失反馈、打开方式与原生菜单动作；补丁幂等且 anchor 漂移失败。
- [ ] 接入安装补丁顺序，运行新测试和已有文件预览、Markdown、原生菜单回归与 typecheck。
- [ ] 中文本地提交。

### Task 3: 视觉、集成与真实客户端验收

**Files:** design-qa.md; handoff metadata（临时目录）；候选批次 manifest 由执行器管理。

**Interfaces:** 现有批次追加交接、merge 预检及 merge 执行器。

- [ ] 用真实补丁组件检查浅/深主题及窄面板，参考图比较并消除裁切、重叠或操作问题。
- [ ] 独立整段审查后修复实际问题，运行聚焦验证、中文提交并保持干净。
- [ ] 生成交接卡追加到 20261023-01，候选集成并执行 ./script/build_and_run.sh --verify 与最终包检查。
- [ ] 在真实主客户端检查现成茅台 HTML/PDF 交付卡片、点击预览、打开方式，并保持应用打开供用户测试；记录实际证据。
