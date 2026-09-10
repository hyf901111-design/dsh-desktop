# 研究组件生成时保留对话与输入框

2026-09-10 真实 Electron 验收发现：从画布“容器”创建真实生成任务后，右侧从“对话”切到“任务管理”，共享对话与底部输入随之隐藏。通过只读 CDP 页面 WebSocket 和真实服务返回的 `plugins/dsh-better-sidebar/client.js` 定位到 Better Sidebar 0.14.1 的自动子任务 effect：`detectNewDirectSubagent` 检测直属子任务从 0 变为非零后，按 `autoOpenSubagent` 默认设置打开并激活 `subagent` tab。

在 `scripts/lib/patch-sherlock-better-sidebar.mjs` 的既有内置插件补丁链中增加窄条件：当前侧栏包含固定的 `sherlock-research-conversation`，且真实画布存在 `queued` 或 `running` 组件时，仅阻止该 effect 的自动切换。判断直接读取组件绑定真实任务状态后的 DOM 属性；不改任务创建、状态更新、用户偏好或手动 `openTab`。无生成任务、任务已完成/失败/取消、或研究退出后解除固定时，原自动打开逻辑不变。effect 仍更新快照基线，避免生成完成后迟到补开任务管理。

聚焦验证：`npx vitest run test/research-generation-sidebar-focus.test.ts test/bundled-plugin-profile.test.ts`，2 文件 20 项通过。新检查执行实际变换后的自动子任务 effect，覆盖 queued/running 保留对话、draft/完成/失败/取消等非活动状态仍按原偏好切换、退出研究后的普通对话行为、无新增子任务的基线行为、手动调用任务 tab，以及补丁二次应用字节幂等。JavaScript 语法、TypeScript 与 `git diff --check` 均通过。

应用路径：`prepare-bundled-plugin-profile.mjs` 在打包内置 Better Sidebar vendor 时调用该变换；不是 node_modules conversation 的 postinstall 补丁。最终真实客户端需重新生成插件 profile/本地构建后验收“生成时保留输入 → 手动查看过程或任务管理 → 返回对话”。本轮未修改正在运行的客户端，也未启动真实模型任务；上述聚焦测试不冒称完整真实 UI 验收。
