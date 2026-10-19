# 组件数据源与更新设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击组件来源打开统一设置，持久保存来源/周期，为五类金融组件增加真实备用方案。
**Architecture:** 现有绑定引擎管理生成组件完整来源方案；内置组件在可序列化 spec 保存选择，主进程固定适配器取数。两者复用设置视图。
**Tech Stack:** Electron / TypeScript / JavaScript serialized React / Vitest / existing Playwright.
**Spec:** docs/superpowers/specs/2026-10-19-component-data-sources-design.md

## Global Constraints
- 不运行全功能测试；不从功能 worktree 构建共享客户端；不自动合并或发布。
- 保留布局、组件身份与上次成功数据；来源缺失不得变成 0、模拟值或错误来源标签。
- 所有来源只能是主进程固定 HTTPS origins，具备账户与 revision 隔离。

## Review Focus
- 来源切换期间旧响应不得覆盖新来源；Task 1/2 增加并发切换测试。
- 多请求映射不可拆散；Task 1 用两个依赖请求验证完整方案切换。
- 部分行情/历史失败保留原字段及对应来源；Task 3 用报价成功但 K 线失败验证。
- 定时器暂停/手动模式、隐藏/重挂载与账户更换；Task 3 验证请求计数与保存状态。
- 来源参数、证券身份、公告交易所、来源返回脚本/错误数据；Task 2 验证固定请求与拒绝错误身份。

### Task 1: 生成组件完整来源方案
**Files:** src/shared/component-data.ts; packages/dsh-research-task-runtime/component-data-refresh.js/.d.ts; canvas-tools.js; test/component-data-refresh.test.js; component-data-service.test.ts.
**Interfaces:** bind input.sources 保存额外完整 {id,name,requests,mapping}；configure(sourceId) 切换方案，list 返回当前 sourceId 与 sources。
- [x] 写并运行失败用例：两个方案使用不同响应字段，切换后实际应用新值；权限失败不改变原方案；旧请求迟到不得覆盖；多请求方案保持完整。
- [x] 实现兼容验证、持久化、重新授权、revision 与取消逻辑，并更新工具契约。
- [x] 运行引擎/服务相关测试，通过后中文提交。

### Task 2: 固定来源适配器与组件配置
**Files:** financial-widget-contract.js/.d.ts; new financial-widget-sources.js; src/main/financial/public-widget-data.ts; new backup-widget-data.ts; new focused provider tests; existing financial-widget-public/announcements tests.
**Interfaces:** spec.dataSource(default/backup)、refreshMinutes、refreshEnabled；IPC query.source(default/backup)；financialWidgetSources(spec) 返回来源选项/说明。
- [x] 写失败用例：备用新浪价格/K线、巨潮公告证券与日期校验、新闻备用来源、参数拒绝、缓存来源隔离、账户切换取消。
- [x] 实现固定来源读取/解析，复用主进程字节和时间限制；按验证过的字段生成统一结果；旧默认查询行为保持兼容。
- [x] 运行适配器/契约聚焦测试及只读在线探针，通过后中文提交。

### Task 3: 统一面板、页脚入口与调度
**Files:** scripts/lib/component-data-refresh.mjs; component-data-status.mjs; financial-widget-client.mjs/.css; settings/refresh/client/browser focused tests.
**Interfaces:** ComponentDataSettingsPanel 共用视图；生成包装使用 bridge，内置包装使用 spec sink 与现有 refresh ref。
- [x] 写失败交互用例：点击生成/金融页脚打开正确面板；切换来源与频率后序列化仍保留；暂停无周期请求；部分失败仍显示上次有效图表；键盘关闭不触发画布快捷键。
- [x] 实现公共视图、来源下拉、可点击页脚、内置配置与独立周期调度，并保留部分结果的实际来源。
- [x] 在隔离 node_modules 重打运行时补丁，执行受影响测试/typecheck；浏览器验证深浅色与窄尺寸，中文提交。

### Task 4: 审查与交接
- [ ] 对最终 immutable range 进行独立只读审查并处理实际问题。
- [ ] 汇总已实测来源与限制、聚焦测试及截图，生成绑定最终提交的交接卡，保留功能 worktree。
