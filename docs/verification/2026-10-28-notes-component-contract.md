# 笔记真实图表合同、格式恢复与菜单层级

基线：`31d70798b39a9119f24714df7b325fd016a119b5`。本功能 worktree 未构建、替换或操作共享客户端，也未安装、删除依赖或调用真实模型。最终 packaged 验收由父集成任务执行。

## 真实故障与证据

父任务在 fd4b 原生客户端的合成 QA 会话 `session-73d3aece-bf30-44b7-8f8a-dd901244c81b` 真实请求了“原位图表验收”折线图，数据只有 10月1日10、10月2日20、10月3日15，要求注明演示、不查行情、保留上下正文。主 agent 已在锚点建立组件；文字生成也真实成功，因此问题位于组件子任务最终交付验收。

仅针对父任务授权的该 QA 会话四个子任务记录提取公开终稿 text 与 turn/end.reason，未输出私有推理、凭证或其他笔记。四次均为 SDK 正常 text 输出及 completed，均缺少宿主唯一 chart 合同要求的 variant；其中一个还含无效空 unit。

| child ID | finish | variant | unit |
| --- | --- | --- | --- |
| 09ee0ae5-f01f-4de4-b48a-9da0dbc0a1b8 | completed | 缺失 | 演示值 |
| b07bec71-81be-46bd-896a-d0fa39149788 | completed | 缺失 | 演示值 |
| 781feab6-9723-4dbb-8261-fbabf68515bf | completed | 缺失 | 空字符串 |
| d69d938b-b922-493c-8c0c-b54d4e20e857 | completed | 缺失 | 未提供 |

原公开终稿与诊断日志保留于 `/tmp/sherlock-notes-real-component-20261028/`；仓库 fixture `test/fixtures/notes-real-chart-missing-variant.json` 只包含上述合成演示图表的四份公开 JSON。没有伪造模型成功或修改原生会话历史。

原错误为 `Error invoking remote method 'notes:request': Error: 生成内容格式无效，自动恢复未完成。`，raw 文本与 RED 证据保留。产品只去掉该已知 Notes IPC 包装，显示真正原因，失败组件及行内框保留需求供重试；其他 IPC / 普通文本不改写。

## 修复边界

- 现有 workbenchPanelPrompt 生成“唯一交付格式”时同时暴露同一宿主结构化 chart schema。Notes adapter 仅从这份唯一、已注册的合同补回一个不存在的 variant，先完整 chartDataIssue 校验，再通过现有 artifact、来源与 HTML 验收。没有新增自然语言变体猜测、generic 默认或数据修补。
- 显式 null、空串、不支持或不同 variant 均不覆盖。多个对象、不明确合同、缺/坏数值、额外字段及无效 unit 保持失败。三个合法真实 raw 补 discriminator 后所有原字段逐一相等；无效空 unit 的 raw 不会被悄悄清理后当成功。
- Notes 本地 SDK 支持时，格式恢复直接在同一个 live child 上 followup，再等待 whenIdle。公开结果与完成原因仅取本轮事件后缀，使用 SDK 的 finalAssistantOutput / foldConsumedWork。原需求、证据及两次 turn 留在同一真实会话；不隐藏历史、不制造/去重 ID、不新 spawn 格式修复 child。其他研究适配器仍走既有恢复路径。
- 格式恢复继承原授权，临时 allow=[]，90s 预算沿用无工具合成阶段；只扣新增模型排队时间。父 signal 取消立即取消该 child，同 ID 换实例或 session 身份改变均拒绝。取消/超时后若 native loop 尚未 idle，工具限制保持至同一 idle 观察结束才释放。最终仍由原 run dispose 清理。第一轮证据不会因同 child 重复并入来源记录。
- 只增加当前已存在 rc.7 SDK public API 的显式包依赖声明；没有 npm install、版本漂移或 node_modules 修改。React/Yjs/BlockNote 单例、正文锚点与迟到结果保护不变。
- 颜色子菜单被 SideMenu wrapper z20 限制，原 AI z80 遮住菜单；降低局部 AI 至 z10，现有 SideMenu20、FormattingToolbar40 与全局 modal 层级保持。明暗主题真实相交取点覆盖颜色、格式、段落菜单及滚动后菜单。

## 聚焦验证

RED：真实有效图表 raw 在 generateNoteComponent 中稳定报原格式错误；同 child 两 turn 生成 fixture 在旧代码下也报原错误；IPC 包装通过失败 receipt 直接泄漏。对应 `chart-red.log`、`same-child-red.log`、`ipc-red.log`。无效 unit 的拒绝用例修复前后都保留。

GREEN：

```sh
npx vitest run test/notes-inline-ai-browser.test.ts test/notes-preload-runtime.test.ts test/notes-inline-component-generation.test.ts test/notes-client-capability-actions.test.ts test/notes-service.test.ts test/notes-ai.test.js test/notes-document-capability-adapter.test.ts test/notes-client-capability-bridge.test.ts test/notes-rewrite-range.test.ts test/notes-component-generation.test.js test/note-component-repair.test.js test/note-chart-contract-recovery.test.js test/component-generation-real-shapes.test.js test/component-generation-prompt-routing.test.js test/cartesian-chart-template.test.js --reporter=dot
```

15 文件 **316/316**，含原 Notes104范围、新菜单明暗2用例、组件 receipt 清理、真实公开终稿回放、同 child 真实 SDK 事件形状两 turn、取消/身份/空输出/超时/工具权限，以及直接受影响的组件数据/图表/提示路径。24 条浏览器测试运行真实生产 preload NotesApp/BlockNote/Yjs。

```sh
npx vitest run test/research-task-runtime.test.js -t 'repair|cancel|synthesis|malformed|truncated|output' --reporter=dot
npm run typecheck
git diff --check
```

运行时选定范围 **62/62**，199 未选；typecheck、diffcheck 通过。非全功能测试。日志 `focused-final.log`、`runtime-repair.log`、`typecheck.log` 位于上述 `/tmp` 证据目录。菜单独立 RED/GREEN、实际相交祖先链与截图位于 `/tmp/sherlock-notes-menu-layer-20261028/`。

既有 Memory/PPT annotation/ConversationRoot 旧 fixture 基线记录沿用前轮；本轮未改、未重跑，也未列为通过。

## 后续原生验收

父任务合入并构建后，在新的合成 QA 笔记真实生成明确演示折线图，核验一个逻辑组件任务的实际 child 数量、失败/停止重试、插入位置、上下正文、保存与重开。此处是公开终稿/SDK seam 的回放证据，尚不等于新 packaged 客户端的真实模型成功。
