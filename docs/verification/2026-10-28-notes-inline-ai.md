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

## APFS 集成依赖图后续修复

集成提交 `6874c876c98f341da1d4b99bdea93a92ea5ae6e9` 的独立 APFS 依赖图重跑时，正文保存正常，但 13 条行内浏览器用例中的 12 条无法打开入口。保留该图、不改源码或依赖，以生产 preload 构建及真实浏览器探针捕获到：

- 业务直接导入的 `ySyncPluginKey.key` 为 `y-sync$1`，`getState` 无 binding；编辑器已安装的真实插件为 `y-sync$`，binding 存在。
- Space 的 pageerror 为“笔记插入位置尚未就绪，请稍后重试。”，调用栈在 `captureNoteInlineAnchor`。
- bundle 同时包含 canonical 与 integration 两个物理路径的 `y-prosemirror/src/plugins/keys.js`，而 ProseMirror state 只有 canonical 一份。BlockNote 引用外部 y-prosemirror，并非内嵌实现。

修复仅为 preload 的既有 dedupe 增加 `y-prosemirror`，不扩大 ProseMirror/Tiptap 家族、不改已有 React/Yjs 去重或锚点判定。新增强制双物理 peer 回归：临时复制真实 y-prosemirror 包，将行内 helper 的 import 通过 bare re-export 导入该 peer；缺少 dedupe 时稳定复现 `y-sync$1`/`y-sync$` 失配，修复后断言真实 helper 可获取 binding、最终 keys.js owner 只有一份，继续执行全部 Space/插入/保存用例。

同时，独立复核发现 PM 光标保留在空白段落时，点击现有 smart/link 组件 textarea 后 Space 仍可能被正文 React capture 拦截。新增真实 NoteCreationBlock textarea 回归先复现吞空格，再以 `target.isContentEditable` 和原生交互控件/`contenteditable=false` 祖先过滤修复；普通正文入口条件保持不变。

最终相关回归增为 **9 文件 96 项**，其中 14 条真实行内浏览器用例。功能图和真实 APFS integration 图均通过；后者通过临时测试 loader 读取拟合入的 config/editor 与新回归，所有其它 production source、实际依赖和 integration Git 状态保持原样，未重装依赖、未修改 timeout 或放宽断言。类型检查和 diff check 同时通过。

身份和红绿证据：`/tmp/sherlock-notes-y-prosemirror-20261028/`。`runtime-identity.json` 为原始 integration RED，`inline-binding-identity-red.json` 与 `inline-module-owners-red.json` 为稳定强制 peer RED；`green/runtime-identity.json` 为实际 integration 加最小 config 修复后的原生探针（同为 `y-sync$`、binding 有效、composer 可见、pageerrors 为空），`integration-green.config.mjs` 保存无源码变更的实际依赖图测试投影方式。
