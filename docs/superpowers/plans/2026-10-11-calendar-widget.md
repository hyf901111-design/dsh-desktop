# 日历工具实施计划

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task in this session.

**Goal:** 在组件库加入持久化日历事项及系统、会话提醒。

**Architecture:** 独立 calendar-tool 容器；主进程维护本地事项与提醒收据，可信 IPC 与 React 组件同步。复用组件库及看板布局，保持生成型日历不变。

**Tech Stack:** TypeScript、Electron、序列化 React、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-11-calendar-widget-design.md`

## Global Constraints

- 使用现有组件最小尺寸、三种主题和中英文。
- 数据不依赖模型／MCP；本机个人事项，暂不在共享看板开放。
- 客户端运行时后台提醒，重启／唤醒补发，不重复通知。
- 只聚焦测试；中文本地提交；真实客户端验证；不公证、不发布、不升版、不推送。

## Review Focus

- 写入失败保留内存和原文件，禁止假成功。
- 重复事项完成只影响当天，睡眠恢复不轰炸。
- 夏令时缺失时间拒绝保存，月份无对应日期跳过。
- 删除组件暂停提醒；未知组件和共享写入拒绝。
- 缩小尺寸与语言切换不会丢失编辑内容。

### Task 1：存储和后台提醒

Files: `src/shared/calendar-tool.ts`, `src/main/calendar/calendar-store.ts`, `src/main/index.ts`, `src/preload/index.ts`, `test/calendar-tool.test.ts`。

- [ ] 先写聚焦测试：真实日期、重复、时区、原子持久化、补发去重、完成／删除、写入失败。
- [ ] 实现事件验证、发生日期和时间计算，原子存储与持久化提醒历史。
- [ ] 可信 IPC 校验组件存在；系统通知点击发送导航事件；启动、周期和唤醒检查。
- [ ] 运行存储测试及 typecheck。

### Task 2：组件与交互

Files: `scripts/lib/calendar-tool-client.mjs`, `scripts/lib/calendar-tool.css`, `scripts/lib/financial-widget-client.mjs`, `scripts/lib/research-grid-ui.mjs`, `scripts/patch-web-frontend-loading.mjs`, `test/calendar-tool-client.test.js`。

- [ ] 集成独立容器类型和创建动作，默认 620×420，复用网格最小尺寸。
- [ ] 实现月历、事项、搜索、编辑弹层、完成、重复和提醒记录。
- [ ] 会话提示与系统通知导航，后台事件实时同步。
- [ ] 聚焦实际序列化组件测试：添加、编辑、取消、完成、语言切换及提醒提示。

### Task 3：验收

- [ ] 直接相关测试、类型检查、diff 检查与中文本地提交。
- [ ] 本地主客户端构建，真实 UI 创建与提醒验证；检查最小尺寸／窄宽度／主题。
- [ ] 应用保持打开，向用户交付结果和实际限制。
