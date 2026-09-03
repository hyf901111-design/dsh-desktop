# 无对话研究会话持久化回归

## 范围与来源

- base：`c9a2673b4550867685aaab1ab35b05a817285e55`，本地 `main`。
- feature：`codex/feat/research-session-durable-20260903`。
- 既有修复 `432d8c924af20552e6143f3387d75f9034df8d17` 已经合并到 base；本次不是补漏合并。
- 只修改会话身份、标题、侧栏投影与新建复用条件；不修改版本、发布记录、用户数据或共享客户端。

## 根因

1. 画板由 `researchCanvasStorage()` 优先写入桌面稳定存储，浏览器 `localStorage` 只是尽力镜像。旧侧栏过滤和研究视图恢复却只读取 origin 存储；桌面端随机端口形成的新 origin 或镜像写入失败都会导致两者不一致。
2. `WorkspaceRuntime.connectWorkspace()` 只检查 host `summary.blank`。Host 的 blank 仅由 `turn/start` 改变，添加研究组件不产生对话，因此已占用画板仍被当作可复用空会话。
3. 旧实现只写 engaged 标记，不产生内容标题。Host 会话持久化采用懒物化，不能靠单独的桌面画板数据保证 host 标题与会话事件已经落地。

## 修复约束

- 可见性和复用检查优先读取桌面标记，缺标记时兼容既有 files/artifacts 数组；浏览器存储仅作旧数据回退。
- 读取旧画板时补 engaged 标记，不迁移或重写节点内容；删除最后一个节点后仍保留已建立的研究身份。
- 首个持久组件产生标题候选，通过真实 Session 的既有 rename 通道写入 `session/title`，不创建消息，不发起模型请求，不改变 blank 对话语义。
- 文件使用文件名；卡片使用内容标题；助手内容优先使用正文首个非空行，移除标题前缀并限制长度。
- Host 已有标题优先，手动改名不会被后续组件覆盖。并发持久化只发送一个标题请求；失败后下次画板变更或会话列表刷新可重试。
- 命名延迟或失败不影响画板占用判断，因此新研究仍进入不同空画板。
- 旧画板读取在 React 渲染期间只同步写身份标记，侧栏通知推迟到微任务；正常用户添加组件仍同步通知。

## 聚焦验证

- TDD：新增原始回归先出现 8 个预期失败（桌面恢复 2、侧栏可见/标题 3、占用会话复用 3）；真实 Session 标题链路另有 1 个预期失败；修复后全部通过。
- `test/sidebar-new-session-actions.test.ts`：桌面存储与 origin 分离、旧数组无标记、直接进入研究、侧栏保留、内容标题、Host 标题投影、首组件入口、延迟与失败/重试、已有用户改名保护。
- 首组件覆盖文件 drop 的 `setFiles`、粘贴文字、粘贴组件、网页链接、空智能容器、助手结果与生成摘要；重建 registry 后内容仍在。
- `test/sherlock-composer-workspace-ui.test.ts`：现有真实 React 组件回归。两处拖动结束写入预期调整为不再首次写 engaged，因为旧节点已在读取时补齐该标记。
- `test/research-file-drop.test.ts`、`test/research-canvas-clipboard-ui.test.ts`、`test/research-canvas-storage.test.ts`：直接相关存储和输入路径。
- `test/patch-integrity.test.ts`、`npm run typecheck`、三个 vendor bundle 的 `node --check` 与 `git diff --check`。
- 独立只读审查未发现 Critical / Important；提出的旧画板渲染期通知警告已补真实 React 失败回归并修复。

## 交接后的真实客户端验收

本功能 worktree 未构建或替换共享应用。父任务整合本地 0.8.0 后仍须在真实主界面检查：新研究 → 添加首个组件 → 侧栏命名 → 再次新研究得到空板 → 切到其他会话 → 从侧栏重开原研究（零聊天、节点数量不变）。还应重启本地测试客户端确认稳定存储恢复。不得把本文件中的内存 React 和 RPC 边界测试称为真实客户端验收。

恢复范围是 Host 仍列出的 session。历史上若已有画板但 Host 从未物化、且进程已结束而会话 id 已完全退出 Host 列表，本次不承诺恢复这种孤儿会话；原 native 文件未被删除。父任务在替换仍运行的旧版前，应先给目标零消息 session 写入并确认持久标题，避免旧版的懒物化缺口跨越此次进程替换。未来需要时可从 Workspace 的持久 `sessionIds` 与 `path` 建立候选映射，按 id 检查 native 数组后单独审查同 id Host 重建迁移。
