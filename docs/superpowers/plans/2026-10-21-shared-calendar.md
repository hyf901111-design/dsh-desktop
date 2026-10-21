# Shared Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让协作看板成员创建的日程持久共享并被其他成员看到。
**Architecture:** 沿用原生日历组件与现有看板协作服务，在宿主根据会话路由个人或共享存储；使用稳定事项ID的细粒度协作更新。先读现有服务和Yjs文档验证边界，选择无需破坏兼容的实现；任何新增云端协议需求必须先报告，不能部署。
**Tech Stack:** TypeScript, React client patch, Yjs, Vitest, Electron.
**Spec:** docs/superpowers/specs/2026-10-21-shared-calendar-design.md

## Global Constraints
- 不构建共享客户端，不部署、不推送、不发布；个人记录和通知收件记录不自动共享。
- 保留现有查看/编辑权限和账户、看板隔离。
- 不运行全功能测试；每个已验证修改用中文本地提交。

## Review Focus
- 首次并行添加也必须保留双方事项，不能用缺失父map的并发初始化覆盖。
- 查看者、撤权、换号、离线状态不允许写入到其他日历或个人存储。
- 加载失败保留输入和错误，远端变更自动更新已打开组件。
- 删除/完成仅影响匹配日历和事件，刷新/重连不复活已删事项。
- 既有个人日历与草稿保持，界面保存/提醒文案诚实。

### Task 1: 端到端共享日历存储与组件接入
**Files:** src/main/calendar/*, src/main/research-boards-service.ts, src/main/index.ts, scripts/lib/calendar-tool-client.mjs, scripts/lib/financial-widget-client.mjs; 直接相关测试。新模块按职责创建。
**Interfaces:** 宿主calendar request保留现有action；协作请求基于当前认证绑定与组件ID授权；远端共享变更触发calendar changed通知。原CalendarSnapshot仍可被组件消费。
- [ ] 读取现有日历、协作持久化和权限实现，记录最终存储与并发裁定。
- [ ] 为真实共享两人添加、首次并发、重连/重启、隔离权限、组件创建和更新写失败测试并验证失败。
- [ ] 实现细粒度共享存储及宿主路由，移除组件库和CalendarTool的协作禁用，保留个人路径。
- [ ] 运行本次直接相关测试及typecheck、diff check，自审后中文本地提交。
- [ ] 独立任务审查规格和代码；修复具体问题，后续由主控集成并做双客户端验收。
