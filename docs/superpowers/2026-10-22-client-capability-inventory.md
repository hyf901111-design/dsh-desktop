# 客户端会话能力目录（2026-10-22）

这是 Notes 普通会话与 Harness 研究/普通对话入口共用的能力清单。它不是全客户端功能清单，也不表示目录之外的功能已经可以由模型调用。

当前注册表共 17 项语义能力（inspect/apply 分别计数）。本轮将同一类型目录接入 Harness 现有工具循环，新增研究画布 apply/undo、窗口缩放/全屏、当前会话视图切换。可用性由真实界面与宿主权限动态决定，不表示全部客户端按钮已经覆盖。

| 语义 ID | 参数 | 真实共享处理器与完成依据 |
| --- | --- | --- |
| `notes.components.create` | `prompt` | `useInlineComponentGeneration.startAndWait`；复用单卡生成、进度、数据绑定、停止与澄清。真实组件完成并保存后才返回成功，澄清返回 pending，失败/取消终止组合。 |
| `notes.components.style` | `scope: note/selected`；`theme`、`titleBar`、`frame` 至少一项 | `updateNoteComponentPresentation` 同时供选中组件控件和会话调用；仅更新 research 节点的 `notePresentation`。`frame:false` 仅去除组件外层边框，保留表格和内容内部边线；缺省或 true 保留外框。整篇范围递归覆盖全部研究组件，无需选择。等待 Notes 保存与渲染帧后回执。 |
| `notes.components.layout` | `scope: note/selected`；`width: full/number`、`height: auto/number` 至少一项 | 与手动宽高拖柄共用 `updateNoteComponentLayout`、边界计算和撤销事务，只更新 `noteSize`。full/auto 清除对应手动轴；数值像素四舍五入，宽度以组件实际可用宽限制，高度 180–2400。折叠组件从可见祖先测量，无可测布局时保留请求宽度并由渲染层限制。支持整篇、单选和多选研究组件，递归查找；不修改正文、containerSpec、主题或对齐。真实保存后回报 saved，并返回各目标实际保存的 width/height。 |
| `notes.export` | `format: pdf/docx/md`；可选 `path` | 同工具栏的 `exportNoteWithSnapshots` → `saveNoteExport`。截图包含当前组件主题/顶栏，真正写入后返回路径。省略路径使用原生保存框；路径必须与宿主从本次肯定目的地语句提取的完整绝对路径全等；前后缀、引用和否定不授权直写。无法唯一确定时使用原生保存框。 |
| `notes.blocks.align` | `scope: note/selected`、`target: paragraphs/researchComponents`、`alignment: left/center/right` | 与段落菜单共享 `changeNoteAlignment`，只修改对应块的 `textAlignment`。组件容器与正文段落必须分别指定目标；保持正文、组件 payload、现有宽度。所选范围绑定稳定组件/段落 ID，变化后拒绝旧请求。 |
| `notes.components.inspect` / `notes.components.apply` | inspect 空对象；apply `blockId/revision/containerSpec` | 仅当前明确选中的单个研究组件；复用 `createNoteComponentDataActions` 的 SHA-256 payload revision、结构校验和最终 CAS。apply 仅替换完整 containerSpec 并等待真实保存，保留其他节点属性/块/正文。先 inspect 再 apply，旧版本可重新读取后重试。 |
| `notes.challenge.configure` | 可选 `level: 0–4`、`commentsExpanded: boolean`，至少一项 | 复用真实挑战 controller 配置与 Yjs 保存，不改正文、不重置既有预算；回执区分设置已保存与校验等待/运行，不宣称已校验完成。 |
| `notes.components.data` | `action: inspect/configure/refresh`；修改需真实 revision | 仅当前明确单选且已绑定的生成组件；复用 NoteComponentDataService、真实配方与 CAS。configure 仅启停/频率，refresh 读取真实 status，失败保留旧内容和上次成功。原生金融控件不支持；不开放来源切换、自由绑定或整篇批量。 |
| `canvas.inspect` | 空对象 | 复用 `CanvasActionBridge.inspect`；仅当前 session 存在有效绑定时提供，执行再检查可见 Notes 上下文与画布绑定。真实数据进入后续工具上下文。 |
| `canvas.apply` / `canvas.undo` | `revision/operations` 或 `revision/actionId` | 复用 CanvasActionBridge → 原 canvasActionController，既有整批校验、最后写入前 CAS、取消与撤销不变。原生 market/table/chart/kpi 数据通过既有 artifact 校验后交给真实处理器。applied/unchanged 为成功，pending 保留“同步待确认”，不宣称已同步。 |
| `ui.zoom.in` / `ui.zoom.out` / `ui.zoom.reset` | 空对象 | 复用 `executeDesktopMenuCommand` 的三个真实菜单动作；回执返回实际 zoomLevel。Notes 入口也共用此窗口处理器。 |
| `ui.fullscreen.set` | `enabled: boolean` | 复用菜单 toggle-fullscreen；仅当前状态不同时切换，并等待实际状态确认。相同设置不重复反向切换。 |
| `ui.mode.set` | `mode: conversation/research/notes` | 可信当前会话原生 header 的同一个 `selectView` 处理器。仅当前 session，无模型 sessionId；以新 header binding 确认导航。完成后必须重新查询目录；board-only 等原生视图限制保留。 |

主题枚举为 `light/dark/enterprise/openterminal/auto`，`enterprise` 即易方达。组件节点覆盖层复用 workbench palette 和已有 iframe 主题消息。选中组件的“组件外观”控件提供同一能力的手动入口，包含中英文顶栏和外框开关。

外观修改会保存到原笔记，不是仅导出时临时覆盖。明确要求修改组件外观并导出时，可先执行 `notes.components.style({scope:'note',theme:'enterprise',titleBar:false,frame:false})`，等待保存成功后再 `notes.export({format:'pdf'})`。当前没有不改变原笔记的导出独立外观参数，不能声称支持这种临时覆盖。

## 会话及权限边界

普通输入先取得稳定 ID、说明、JSON Schema、可用性和当前账户/会话/文档/选择上下文，再由模型输出结构化 capability calls。宿主验证每个参数并串行调用固定处理器。不能传 IPC 名称、JavaScript 或任意能力名执行；不依赖输入关键词决定是否进入目录。旧的明确创建判定仅保留在最终旧格式组件结果的插入适配器内部，不会在规划前截断“创建＋导出”。

每轮最多 6 次模型往返、单批 8 次操作、总计 16 次。任一 pending/cancelled/failed/unavailable 即停止后续依赖操作。文档内容和附件仅作为引用材料，不能提供授权或导出路径。结果展示由宿主真实回执生成；文字与组件文档结果继续留在预览，并附操作回执，回执补录不覆盖既有 accepted/discarded 状态。组件生成必须真实完成，不能凭“accepted”立即开始导出。源 DOM 冻结前等待共享 workbenchTransition 标记结束和两次绘制帧，总上限 1.2 秒；支持 reduced-motion、取消，且不等待任意循环动画。

执行前核对账户、session、document、当前生成请求、可编辑状态、可见编辑器及语义内容指纹；用户在执行过程中编辑正文后，不继续应用旧操作。组件创建转发原始图片、引用、正文和选区上下文；跨步不重置正文、草稿或会话历史。旧会话/取消后的回复被忽略，导出写盘前再次检查取消。已经发生的持久化效果不会回滚。创建回报 placeholder/applied/saved 与 blockId（包含真实单卡生成和绑定保存阶段），样式回报 applied/saved 阶段；主进程导出在真实 writeFile 前后记录 writing/saved 与路径。取消或超时后最多等待 5 秒收取原请求终态，保留已确认效果并停止后续操作；缺少终态时如实显示最近阶段和未确认状态，绝不宣称未执行。

同请求 ID/参数的并发调用共享同一 Promise，重复调用返回既有回执；不同参数复用 ID 被拒绝。每个组合保留至多 32 条回执，主进程保留至多 512 个含操作的已完成请求结果（进程生命周期，不跨重启）；达到上限拒绝新生成并提示重启，不淘汰旧回执重做副作用。组合总体 600 秒，创建桥 250 秒、其他桥操作 100 秒。取消原生保存框由用户完成；超时/停止后禁止继续写盘。

## 尚未接入的家族与扩展点

- 研究/对话已通过 client_capabilities/client_action 复用同一目录，canvas inspect/apply/undo 已统一；research_canvas_* 原入口仍保留并共享底层处理器。研究 inspect 现在声明 presentation/presentationFields，apply 可单独提交 `{op:"presentation",fields:{workbenchStyle:"enterprise"}}`，复用手动 `setWorkbenchStyle`，按当前看板保存；该操作不能与内容/整理混批。需重新 inspect 获取新 revision 后才能继续整理，展示偏好不宣称支持内容事务撤销。
- 窗口缩放/全屏及当前会话三种视图切换已登记；设置、全局主题、更新与其他菜单尚未覆盖，不开放任意 menu command。
- 组件尺寸布局已支持整篇及多选；组件内容修改和数据绑定操作仍限单选。批量数据操作需要宿主捕获目标清单与逐项 revision/CAS，不能靠模型枚举或移除 selected 门禁实现。
- 研究组件顶栏、外框已有独立持久化开关 `titleBar:false`、`frame:false`；外框指组件宿主边界，不移除内部表格边线或任意 HTML 自定义边框。导出沿用保存后的实际外观，不提供仅导出时的临时去框。
- 文件查看器/附件节点外观：当前仅 research 节点。研究组件内置 HTML 如果自己不遵循主题令牌，外层不能保证改写其自定义固定颜色。
- 插件/MCP、账户、云文档、日程、下载、发布和 OS 级操作：没有登记或授权；不宣称会话已支持。
- 跨模式 Notes 文档操作：ui.mode.set 已可激活当前会话 Notes 并重新捕获目录，但 Harness 入口尚未建立 NotesEditor 的独立文档/选区/语义指纹与保存 lease，因此不能紧接着直接导出或改写笔记。当前需在该 Notes 自身会话继续；后续接文档 adapter，不能删除 notes 门禁或借用其它打开文档。
- 公开 API：这是内部可信宿主协议，没有公开任意传输调用。新能力在注册表添加类型、schema、可用性和共享处理器即可；不应增加自然语言关键词分支。

## 证据分层

聚焦测试覆盖 schema、host 回执、幂等、取消、账户/会话与正文变化、持久化、创建后导出、待澄清停止、普通文本预览。Playwright 使用真实 NotesEditor、脚本化外部模型与导出 stub，证明前端组合流程。服务测试实写 Markdown，PDF 聚焦测试使用模拟 Electron printer。真正 Electron PDF 内容、原生保存框及客户端重启恢复仍由集成后的原生验收完成，不能由这些测试替代。

## 本轮直接验收范围

- 在真实 NotesEditor 中，全笔记研究组件右对齐后，正文富文本、组件 payload 和宽度保留；保存内容与实际布局一致。
- Notes host → renderer → selected component inspect/apply → NotesStore → 导出链覆盖真实处理器；仅模型输出与原生 PDF printer 仍沿测试替身。
- 选区、正文、payload 或会话在异步 hash 中改变时拒绝旧写入，重新发送并 inspect 后可继续；没有选中、不同目标、非法结构均无副作用。
- 研究会话工具 → HTTP → session bridge → 真实 workspace 的主题变更保持其他看板不变、保存失败不假报成功、旧 revision 可重新 inspect 重试；保留既有手动主题和全局试用行为。


## 2026-10-23 跨模式运输与验收

Harness 原工具循环直接登记 `client_capabilities` / `client_action`，没有第二个模型规划器或关键词分流。前者无模型参数，后者只有能力 ID、arguments、requestId。真正 sessionId 和 live turnId 由执行器当前用户会话派生；普通用户分支的 `parentSession` 仅为历史谱系，仍须以分支自身 sessionId 匹配当前可见窗口，不能借父会话绑定。`origin:subagent` 或非零 delegationDepth、已结束轮次与宿主已登记的定时任务均不能借用当前窗口。

固定 `/client-capabilities` 端点复用 ResearchContextBridge 的 127.0.0.1/token/无 Origin/限体积及断连取消。可信原生 header 每次视图或 session 变化发布 90 秒绑定（30 秒续约）；Main 再核账号、窗口实例、当前 session、模式、可读/可写权限。切换或关闭绑定会取消旧 generation 的在途画布请求，显式 caller cancellation 与已发出的导航请求分别报告；导航不会假称笔记导出或挑战已完成。

Main 每轮保留最多 32 个操作回执、最多 100 个轮次；达到上限拒绝新操作，绝不因时间过期淘汰回执后重新执行同一副作用。模式变更后的新目录保留同轮既有回执，并依据实际画布绑定/权限重建可用性。跨进程重启不承诺重放。普通对话可执行窗口与当前会话导航；导航到研究且实际画布就绪后，可继续 inspect → apply → undo。研究详情可通过 `canvas.inspect({ids:[实际ID]})` 读取，不能指定另一个 session。

直接验证包含真实注册工具 → 认证本地 HTTP → Main 服务 → CanvasActionBridge → 原 canvasActionController 的读取/改名/CAS/撤销与重复回执，原生 header 注入 hook → selectView → 新 Main context，取消/错误账号/外部窗口/失效 mode/无画布/只读共享权限，以及 Notes 既有保存和导出回执回归。测试不替代集成后的原生 GUI 验收。
