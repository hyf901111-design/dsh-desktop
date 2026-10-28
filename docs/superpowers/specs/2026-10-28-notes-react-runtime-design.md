# 笔记预加载 React 运行时修复

用户反馈切换笔记后正文空白，应用 Console 在 `useNoteUiLocale` 报 `useReducer` 的 dispatcher 为 null。沿真实预加载构建追踪发现，复用其它 worktree 的依赖时，同一 preload 会同时打入两份物理 React；已有去重只覆盖 BlockNote，未覆盖 React 与 ReactDOM。

在 preload 的既有 `resolve.dedupe` 增加 `react`、`react-dom`，使挂载器、渲染器和编辑器 hooks 使用同一运行时。集成依赖的 APFS 克隆进一步复现两份 Yjs 构造器：输入虽出现在 DOM，Yjs 却报 `Unexpected content type in insert operation`，保存的 note fragment 为空，语言重挂载和重开时正文消失。因此同时去重 `yjs`，确保渲染事务和持久化快照属于同一构造器族。保留 BlockNote 去重、浏览器解析条件、沙盒包装和自定义元素兼容。笔记存储、受控编辑、保存、历史及语言逻辑不变，无需清除或重写用户笔记。

使用生产 electron-vite preload 配置构建真实 `mountNotes`/`NotesApp`，在 Chromium 中覆盖空文档、默认空段落、真实保存的已有 Yjs 文档，检查运行时错误、编辑、语言切换、确认保存与重新打开。夹具强制提供第二份物理 React/Yjs peer，保证平铺依赖的 CI 也能复现身份冲突；验证每类模块只有一个、没有 Yjs 身份警告，并实际解码草稿及保存的 note fragment，确认其包含编辑内容。保留既有编辑器注册表回归与类型检查。开发 worktree 不构建或替换共享客户端；交由集成批次统一验证。
