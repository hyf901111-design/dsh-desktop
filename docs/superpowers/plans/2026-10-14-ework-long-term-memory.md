# EWork 长期记忆实施计划

> **For agentic workers:** Use superpowers:executing-plans for the service and integration. Use superpowers:dispatching-parallel-agents for the disjoint UI and runtime tasks after the shared contract is fixed. Steps use checkbox syntax for tracking.

**Goal:** 实现真实跨对话长期记忆、普通设置中的内容展示及管理，构建并启动本地测试版。

**Architecture:** 主进程拥有加密 SQLite、项目绑定及权限；内部 runtime 负责父会话采集和请求级召回。普通设置页展示真实记忆、来源、状态、项目与最近使用记录。

**Tech Stack:** TypeScript、Electron safeStorage、Node SQLite、现有 Cordis rc.7 runtime、原生 DOM 设置页、Vitest。

**Spec:** ../specs/2026-10-14-ework-long-term-memory-design.md

## Global Constraints

- 不递增版本、不公证、不公开上传或推送，不修改用户原会话和凭据。
- 全局/项目/账户隔离；共享会话不自动使用私人记忆。
- 每条记录可查看编辑停用删除；人工修改锁定；删除阻止旧任务重建。
- 8 条、1200 tokens 上限；来源准确，候选不召回；仅运行相关聚焦检查。
- 功能 worktree 不构建共享客户端；完成后经交接与集成执行器进入批准的测试构建。

## Review Focus

- 不同身份、项目切换及共享对话不能串用内容。
- 编辑/删除后已在队列中的提炼结果不能覆盖或恢复旧记忆。
- 临时要求、引用网页与助手未确认建议不能写成长期事实。
- 请求临时记忆不能保存到会话摘要和 request/header 中。
- 设置异步请求、并发编辑和窄窗口不能丢失草稿或隐藏真实状态。

## Task 1: 服务与公共契约

**Files:** src/shared/memory.ts; src/main/memory/{store,service,retriever,bridge,ipc}.ts; test/memory-service.test.ts; test/memory-bridge.test.ts

**Interfaces:** MemoryService.open(options); request(MemoryCommand): Promise<MemorySnapshot>; recall(RuntimeContext); capture(RuntimeTurn); commitExtraction(captureId,candidates); rotateIdentity(); close().

- [ ] 写真实临时数据库测试：跨重启保存、加密、作用范围、编辑锁定、删除防重建、候选、过期、开关、账户轮换、中文短词。
- [ ] 运行 test/memory-service.test.ts，确认缺失功能导致失败。
- [ ] 实现加密 SQLite、项目 UUID、来源、状态、revision 和召回选择。
- [ ] 实现可信 IPC、受令牌保护的 runtime bridge、来源校验及提炼事务。
- [ ] 运行服务/bridge 聚焦测试与中文提交。

## Task 2: 内部运行时

**Files:** packages/dsh-memory-runtime/*; scripts/lib/memory-request-context.mjs; patches/@deepseek-ai+dsh-agent-loop+0.1.0-rc.7.patch; test/memory-runtime.test.js

**Interfaces:** EWORK_MEMORY_BRIDGE={url,token}; POST /recall, /capture, /commit; runtime returns temporary request context and records usage by ID/revision.

- [ ] 写并运行失败测试：召回在真正请求前生效、不同项目与共享跳过、无递归提炼、删除的旧快照撤销、原请求不被改写。
- [ ] 使用 session/event 与 agent/pre-step；受控扩展请求装配，保留 preparedCall，临时内容不入原日志。
- [ ] 工具关闭的结构化模型提炼、引用校验、并发队列与有限重试。
- [ ] 运行 runtime 与依赖补丁聚焦验证；不构建客户端、不修改其他任务文件。

## Task 3: 用户入口与记忆展示

**Files:** src/preload/memory/{view,style}.ts; test/memory-view.test.ts

**Interfaces:** mountMemoryUi(document,{request(command):Promise<MemorySnapshot>}); current session supplied by existing active-session DOM/bridge; resetIdentity and dispose.

- [ ] 写并运行失败测试：普通设置入口、真实内容/来源/项目、空状态、新增编辑删除、错误保留输入、身份轮换清除旧页。
- [ ] 页面沿用设置结构和两种主题，提供偏好/项目预览卡、统计、时间信息与完整列表详情；无假记忆。
- [ ] 搜索、候选、开关、项目绑定、会话不使用记忆和本轮使用入口。
- [ ] 运行 UI 聚焦验证；不改主进程或 runtime 任务文件。

## Task 4: 装配、原生入口与打包

**Files:** src/main/index.ts; src/preload/index.ts; src/main/runtime/harness-runtime.ts; build/harness-node-entry.mjs; build/dsh-desktop.patch.yml; package.json/package-lock.json; build/sherlock-bundled-plugins.json; scripts/lib/profile-runtime-patches.mjs; notes selection bridge.

- [ ] 连接账户 owner、共享检查、工作区解析与 native IPC；切换账户清理缓存。
- [ ] 配置离线 runtime 包映射及依赖补丁恢复；验证最终包不会丢失插件。
- [ ] 消息/笔记选区保存与来源打开接入现有原生路径，旧文件预览导入。
- [ ] 执行 test/memory-* 及直接受影响的 runtime/profile/IPC/settings 测试与 TypeScript。
- [ ] 整体独立复核、修复实际问题，中文精确提交与交接。

## Task 5: 集成本地测试版

- [ ] 生成有效交接卡与聚焦证据，运行集成预检，通过执行器合并；不混入其他未确认功能。
- [ ] 在允许的集成/主干测试来源执行 ./script/build_and_run.sh --verify，显式跳过公证。
- [ ] 运行最终本地包检查，在真实窗口验证主界面、设置记忆入口与新增/编辑/删除操作。
- [ ] 验证第二会话召回、项目隔离及删除后请求，保留原用户数据，保持客户端打开。
