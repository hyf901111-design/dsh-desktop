# 30 类组件模板与数据刷新实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 30 类组件通过固定宿主模板呈现数据，并按用户设置直接调用数据接口刷新内容。

**Architecture:** 保留现有渲染器，统一模板注册表与可持久化结构化数据。独立数据绑定记录经过验证的工具请求及字段映射，主进程负责定时取数、去重、验证和原位发布；组件视图保持稳定。

**Tech Stack:** Electron、TypeScript、JavaScript、现有 Harness 工具和插件集成、Vitest 聚焦检查、真实客户端验收。

**Spec:** `docs/design/component-templates-and-data-refresh.md`

## Global Constraints

- 仅本地 main 集成和中文提交；每个可验证修改单独提交。
- 不跑全功能单元测试；只跑受影响的聚焦检查。
- 最终使用 `./script/build_and_run.sh --verify` 和包检查，核验真实界面并保持打开；不公证、不发布、不推送、不改版本。
- 用户已授权自主实现，不增加重复确认。

## Review Focus

- 动态参数字典在模型 schema、代理和 MCP 传输中保持完整。
- 旧 HTML 卡片升级及模板依赖完整，不能导致整块研究区空白。
- 数据刷新失败/超时/空数据时保留旧数据；晚到结果不能覆盖新设置或用户编辑。
- 组件缩小、长名称、大列表和长时间序列不遮挡控件或裁掉主要内容。
- 暂停、删除、切换账户、重启和休眠恢复不会产生重复调用或跨组件写入。

### Task 1: 定位并修复真实取数参数链路

**Files:** `packages/dsh-integration-runtime/schema-projection.js`、`tool-proxy.js`、`src/main/integrations/query-arguments.ts` 及相关集成测试。

- [ ] 捕获 ETF 实际工具输入与原始/投影 schema，证明空参数出现的位置。
- [ ] 添加参数完整性回归，修正契约或序列化问题，保留服务端原始 schema 校验。
- [ ] 核验实际 DataYes 带参数业务请求，禁止无效参数重复循环；中文提交。

### Task 2: 统一 30 类模板与直接数据挂载

**Files:** `packages/dsh-research-task-runtime/component-template-registry.js`（新增）、`workbench-design-contract.js`、`artifact-output.js`、`workbench.js`、`workbench-plan.js`、现有各渲染器与模板测试。

- [ ] 注册唯一模板 ID、数据类型、模板版本、尺寸与交互能力，清单准确覆盖 30 类。
- [ ] 保留结构化模板数据，允许经过验证的真实数据直接挂载，不重复启动生成模型。
- [ ] 对齐格式/时间/来源校验、空值处理和模板级局部错误；覆盖真实和模拟路径并提交。

### Task 3: 数据绑定与无模型刷新执行器

**Files:** `src/shared/component-data.ts`、`src/main/component-data/*`（新增）、`src/main/index.ts`、`src/main/integrations/service.ts`、`packages/dsh-research-task-runtime/canvas-tools.js`。

- [ ] 定义稳定连接/工具引用、请求参数、时间窗口、字段映射和目标组件；复用集成凭据及现有授权。
- [ ] 实现有界字段映射、响应验证、相同请求合并、单组件单次执行、失败退避和状态持久化。
- [ ] 原位提交同模板新数据；验证重复数据、陈旧响应、并发修改、暂停/删除与重启恢复；提交。

### Task 4: 刷新设置和视图状态保留

**Files:** `src/preload/component-data/*`（新增）、`scripts/lib/component-data-refresh.mjs`（新增）、`scripts/lib/component-interaction-state.mjs`、`scripts/lib/figma-container-menu.mjs`、相关 IPC/画布接口。

- [ ] 组件更多菜单展示数据源、刷新频率、立即刷新、暂停、上次成功与错误状态。
- [ ] 将现有自动刷新接到数据执行器，未绑定数据源时明确显示状态，避免默默重生成。
- [ ] 刷新后保留矩阵位置、手动尺寸、排序、筛选、图表选择与滚动；无数据变化不重绘。
- [ ] 验证真实 UI 配置与定时执行，提交。

### Task 5: 30 类样式、交互、自适应与性能验收

**Files:** 现有 market/interactive/gantt/native 模板、`docs/design/research-component-catalog-v1.md`、相应聚焦测试及视觉验收脚本。

- [ ] 建立 30 类验收矩阵，每类检查窄/标准/宽尺寸、深浅主题、空/缺失/长数据和关键交互。
- [ ] 修复实际发现的布局/可读性/交互问题，复用共享控件与图表行为，不生成自由样式。
- [ ] 限制大数据 DOM/绘制成本，保持完整数据可查；验证增量更新不造成整窗闪动。
- [ ] 本地构建并在真实白酒、ETF、运营场景验收新建及多次刷新，记录调用、完成数、耗时和限制。
- [ ] 更新目录中经过复验的证据，中文提交，保留客户端供用户测试。
