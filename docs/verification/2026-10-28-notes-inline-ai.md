# 空白行 AI 聚焦验证

基线 `8416133492d4809440d803b67cf938a67a2e9ede`。仅在 Notes 功能 worktree 实现，保留预加载 React/ReactDOM/Yjs 单例配置；未构建共享客户端、未推送。

## 实现与回归

- 真实生产 preload 配置构建 isolated mountNotes/NotesApp，以真实 BlockNote、ProseMirror、Yjs 进行浏览器交互；仅在外部 bridge/模型结果边界提供可控测试响应。
- 空白 paragraph 起始的折叠光标按 Space 唤起；非空、标题、代码、选区、IME、只读保持原键盘行为。占位文字精确验证，Esc 不修改正文，slash 仍调用原生菜单协议。
- 复用未登录默认 avatar 与 en-ai-loading，Enter/Shift+Enter/IME 及窄屏深色、宽屏浅色验证；临时 CSS 为 popup 保留高度，不遮住后段、不进入 Yjs 正文。
- 既有 generate→Notes service→runClientCapabilityLoop→notes-ai 链传递 documentId/blockId/Yjs relative position。段落、富文本、直接组件及真实 notes.components.create 子生成器均在锚点插入。
- unrelated edit 保留；锚点删除、同 ID 重建和换文档迟到结果失效；组件子 job 全程持有原锚点 guard，删除时 reconcile 取消。生成中另一空白行 Space 不覆盖原请求。错误/取消保留需求，可重试。
- references.capture() 保留当前笔记组件内容及附件授权，只去除文字选区。新增先失败的真实 bridge 回归，验证数据与授权不丢失。
- 保存、Yjs fragment 与重新打开验证生成段落和组件；原预加载双 React/Yjs 身份、语言重挂载和内容持久化回归一并通过。

主要命令：

```sh
npx vitest run test/notes-inline-ai-browser.test.ts test/notes-preload-runtime.test.ts test/notes-inline-component-generation.test.ts test/notes-client-capability-actions.test.ts test/notes-service.test.ts test/notes-ai.test.js test/notes-document-capability-adapter.test.ts test/notes-client-capability-bridge.test.ts test/notes-rewrite-range.test.ts --reporter=dot
npm run typecheck
git diff --check
```

结果：9 文件、95 测试通过。13 条新增行内生产浏览器测试，以及主进程/runtime 两条新协议测试包含在内。先观察了缺失入口、同 ID 重建、子组件迟到、段落遮挡、参考资料丢失及无效 position 等 RED，再修复至 GREEN。独立只读复核发现的参考资料遗漏已修复并回归。

外部截图和基线排查证据保存在 `/tmp/sherlock-notes-inline-ai-20261028/`：`inline-1280-light.png`、`inline-620-dark.png`、`memory-baseline.log`、`unrelated-baseline.log`。这些是隔离夹具证据；尚须由集成批次构建后的真实共享客户端完成用户验收与实际模型调用。

## 额外运行中发现的既有基线失败

扩大 Notes 名称匹配测试时遇到三条与本次改动无关的失败。通过临时 Vitest loader 从 `git show 8416133492d4809440d803b67cf938a67a2e9ede:<path>` 读取所有相关 src/packages/scripts 及原测试，在同一依赖环境再次运行，确认基线复现相同失败：

- `test/notes-english-ui.test.tsx` 的 memory chrome fixture 缺少 `data.rows`，报 `data.rows is not iterable`，summary meta 为空；该用例实际检查 Memory。
- `test/notes-command-scope.test.js` 的上游前端 patch fixture 报 `PPT annotation message anchor drifted`。
- `test/notes-composer.test.js` 的原生 composer patch fixture 报 `笔记原生组件签名缺失：ConversationRoot`。

上述失败未标记为通过，未修改 Memory/PPT/上游前端适配代码，也未纳入交接卡的通过检查命令。没有运行全功能单元测试。
