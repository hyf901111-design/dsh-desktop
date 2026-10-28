# 笔记 HTML 交互保存与行内 AI 焦点定位

基线 `fa83107f0bc9c10f8f1d07dae2b3a96536543d2c`。父任务已在原生 2b2b 包验证全新笔记 Space 文字和图表真模型生成、唯一 child、精确演示序列 10/20/15、上下正文与手工编辑保留，并切笔记、退出重开确认图表保存。这一轮只处理随后验收发现的 HTML disclosure 交互与空白行焦点定位，不构建或操作共享客户端。

## 根因与最小改动

原生“查看全部数据”的第一次点击按设计选中卡片，第二次应正常单击展开，无需双击。旧 Notes portal 把 HTML 交给通用 ResearchHtmlArtifact，交互 journal 却固定交给画布 snapshot.artifacts 的 sink。新笔记组件并不在该画布内，sink 返回 false，ACK_V2 发送 rejectedEventId；沙盒 pending 匹配后要求 reload，外层重建 srcdoc，展开立刻消失。父原生观察到 iframe AX ID 重建；同一生产 resolver 的真实双层 iframe 回归也复现了该链路，没有 pageerror。

新增仅 Notes 使用的 React context/bridge，持久化现有 `node.config.interactionState`，不新增存储格式、不调用或伪造画布 accepted。Research context 为空时仍执行原同步 sink 路径；沙盒、CSP、HTML 验证不放宽。

- 每个 Notes 编辑器串行提交 journal。校验当前前台/存活编辑器、Native instance/session、blockId/nodeId、原 HTML 完全一致、可编辑、合法 event/state。事件 ID 幂等校验，不覆盖不同同 ID 事件；合并最新 config、尺寸与内容。
- 更新 Notes payload 后必须等待原 `persistConfirmed()`（沿用 saveQueue/revision/conflict 检查），再复核目标和事件，才能返回真实保存 ACK。待保存的 React payload 不提前确认 iframe。持久化确认失败时，仅精确回滚仍由本次写入的 payload，较新编辑保留；已确认保存后再失去 view/session guard 仍拒绝 ACK，但不会反向改写已确认的原文档。排队中的后续操作会在失效目标上停止。
- bridge 等待异步保存，防止历史失败或乱序旧 ACK 回退新确认结果。ACK 先到时保留观察 barrier，等待对应 node state 追上；匹配后正常接受后续 Undo。保存失败期间发生的真实 Undo 也会在 pending 结束后恢复观察。仅未确认的失败事件被过滤。
- journal 变化仅更新 resident view 数据，不拆掉 Native iframe。保留既有大小、主题、来源、默认脚本限制和交互入口；只读 Note 不能提交变更。
- 脚本补丁通过 AST 限定真实 ResearchHtmlArtifact / Notes view 函数，忽略安装资产末尾恢复 metadata 中的同名字串；不会删除或重写 HomeGuide 等其它函数。新旧 helper 路径使用同一生成函数，补丁幂等，未修改 node_modules。

长组件下空白行的滚跳是另一条布局时序问题：measure effect 只排队 placement，focus effect 已对初始 top0 或旧 A 布局 scrollIntoView。现在 placement 绑定完整 anchor 对象，只有当前锚点完成测量并提交 DOM 后才聚焦。宽浅/窄深下，Esc→Space 的旧 scroll2167→76/2151→60、直接 A→B 的旧1146px回跳都已真实 RED；修复后当前空白 y390、滚动保持，连续三次及不 Esc 换锚点均可见。普通输入、IME、Stop/错误焦点恢复保持。

## 真实浏览器与聚焦证据

`notes-html-interaction-browser.test.ts` 使用 electron-vite 的实际 production preload 配置和现有单例 resolver，运行真实 NotesApp、BlockNote/Yjs、resident renderer、双层 opaque sandbox 及真实字体字节。模型、保存等外部 I/O 使用合成 fixture，未调用真实用户数据或模型；host ACK、iframe capture/reload 与持久化路径未造 stub。

四项浏览器验证覆盖：物理 disclosure 和 input → 真 Notes save → unmount/reopen replay；save 挂起时没有提前 ACK 或事件确认、无 reload；save 失败确实 false ACK、回滚恢复旧 disclosure 后可重试；真实只读 editor 零写入。原通道两项有效行为 RED 保存在 `/tmp/sherlock-notes-html-baseline-red-20261028.log`；最终截图为 `/tmp/sherlock-notes-html-interaction-20261028/notes-html-open.png`、`notes-html-save-failed.png`。初始滚跳 RED/GREEN 与截图在 `/tmp/sherlock-notes-scroll-focus-20261028/`；A→B 反例由独立 reviewer 真实复现并纳入同一 browser 文件。

主要聚焦命令：

```sh
npx vitest run test/notes-inline-ai-browser.test.ts test/notes-preload-runtime.test.ts test/notes-inline-component-generation.test.ts test/notes-client-capability-actions.test.ts test/notes-service.test.ts test/notes-ai.test.js test/notes-document-capability-adapter.test.ts test/notes-client-capability-bridge.test.ts test/notes-rewrite-range.test.ts test/notes-component-generation.test.js test/note-component-repair.test.js test/note-chart-contract-recovery.test.js test/component-generation-real-shapes.test.js test/component-generation-prompt-routing.test.js test/cartesian-chart-template.test.js test/notes-html-interaction.test.ts test/notes-html-interaction-bridge.test.js test/notes-html-interaction-browser.test.ts --reporter=dot
npx vitest run test/component-interaction-state.test.js -t '^(?!.*patches the actual renderer)' --reporter=dot
npx vitest run test/component-shared-state.test.js test/component-shared-state-browser.test.js --reporter=dot
npm run typecheck
git diff --check
```

最终主命令 **18 文件366/366**，含生产 preload 行内28、真实 resident HTML4、controller33与bridge9。通用 journal **10/10、1个已核验基线 fixture未选**；原 shared-state单元/浏览器 **11/11**；typecheck、diff-check通过。最终日志位于 `/tmp/sherlock-notes-html-interaction-20261028/{focused-final,common-journal,shared-state,typecheck}.log`。未运行全功能测试。

## 单独保留的基线失败

本轮未改变的旧 `component-interaction-state` “patches the actual renderer” fixture 调用 restoreResearchGridWorkbench 时，在 Notes patch 执行前解析当前已安装 SDK 的恢复 metadata 就报 `Unexpected non-whitespace character after JSON at position 787040`。含此失败的探索命令未标通过。已真正执行 `git show fa83107f:...` 的基线 restore 实现（仅把模块相对资源 URL 指回相同源目录），在同一只读资产上精确复现；源码与当前 restore 文件逐字相等，SDK SHA256 与错误记录见 `/tmp/sherlock-notes-html-interaction-20261028/baseline-metadata-restore.json`。未改旧 fixture、恢复函数或依赖以掩盖它。其余十条通用 journal 与现有 shared-state 路径另行聚焦。

Memory/PPT annotation/ConversationRoot 旧基线记录仍沿用前轮，未改、未列为通过。所有新真实模型、原生包交互/菜单/停止/主题/保存重开验收由父任务从官方新集成提交构建后执行；本功能 worktree 不构建、不推送。
