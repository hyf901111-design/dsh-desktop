# 客户端会话能力目录（2026-10-22）

这是 Notes 普通会话入口已接入的能力清单。它不是全客户端功能清单，也不表示目录之外的功能已经可以由模型调用。

| 语义 ID | 参数 | 真实共享处理器与完成依据 |
| --- | --- | --- |
| `notes.components.create` | `prompt` | `useInlineComponentGeneration.startAndWait`；复用单卡生成、进度、数据绑定、停止与澄清。真实组件完成并保存后才返回成功，澄清返回 pending，失败/取消终止组合。 |
| `notes.components.style` | `scope: note/selected`；`theme`、`titleBar` 至少一项 | `updateNoteComponentPresentation` 同时供选中组件控件和会话调用；仅更新 research 节点的 `notePresentation`。整篇范围递归覆盖全部研究组件，无需选择。等待 Notes 保存与渲染帧后回执。 |
| `notes.export` | `format: pdf/docx/md`；可选 `path` | 同工具栏的 `exportNoteWithSnapshots` → `saveNoteExport`。截图包含当前组件主题/顶栏，真正写入后返回路径。省略路径使用原生保存框；路径必须与宿主从本次肯定目的地语句提取的完整绝对路径全等；前后缀、引用和否定不授权直写。无法唯一确定时使用原生保存框。 |
| `notes.blocks.align` | `scope: note/selected`、`target: paragraphs/researchComponents`、`alignment: left/center/right` | 与段落菜单共享 `changeNoteAlignment`，只修改对应块的 `textAlignment`。组件容器与正文段落必须分别指定目标；保持正文、组件 payload、现有宽度。所选范围绑定稳定组件/段落 ID，变化后拒绝旧请求。 |
| `notes.components.inspect` / `notes.components.apply` | inspect 空对象；apply `blockId/revision/containerSpec` | 仅当前明确选中的单个研究组件；复用 `createNoteComponentDataActions` 的 SHA-256 payload revision、结构校验和最终 CAS。apply 仅替换完整 containerSpec 并等待真实保存，保留其他节点属性/块/正文。先 inspect 再 apply，旧版本可重新读取后重试。 |
| `canvas.inspect` | 空对象 | 复用 `CanvasActionBridge.inspect`；仅当前 session 存在有效绑定时提供，执行再检查可见 Notes 上下文与画布绑定。真实数据进入后续工具上下文。 |
| `ui.zoom.reset` | 空对象 | 复用 `executeDesktopMenuCommand('zoom-reset')`；实际命令完成后回执。 |

主题枚举为 `light/dark/enterprise/openterminal/auto`，`enterprise` 即易方达。组件节点覆盖层复用 workbench palette 和已有 iframe 主题消息。选中组件的“组件外观”控件提供同一能力的手动入口。

## 会话及权限边界

普通输入先取得稳定 ID、说明、JSON Schema、可用性和当前账户/会话/文档/选择上下文，再由模型输出结构化 capability calls。宿主验证每个参数并串行调用固定处理器。不能传 IPC 名称、JavaScript 或任意能力名执行；不依赖输入关键词决定是否进入目录。旧的明确创建判定仅保留在最终旧格式组件结果的插入适配器内部，不会在规划前截断“创建＋导出”。

每轮最多 6 次模型往返、单批 8 次操作、总计 16 次。任一 pending/cancelled/failed/unavailable 即停止后续依赖操作。文档内容和附件仅作为引用材料，不能提供授权或导出路径。结果展示由宿主真实回执生成；文字与组件文档结果继续留在预览，并附操作回执，回执补录不覆盖既有 accepted/discarded 状态。组件生成必须真实完成，不能凭“accepted”立即开始导出。源 DOM 冻结前等待共享 workbenchTransition 标记结束和两次绘制帧，总上限 1.2 秒；支持 reduced-motion、取消，且不等待任意循环动画。

执行前核对账户、session、document、当前生成请求、可编辑状态、可见编辑器及语义内容指纹；用户在执行过程中编辑正文后，不继续应用旧操作。组件创建转发原始图片、引用、正文和选区上下文；跨步不重置正文、草稿或会话历史。旧会话/取消后的回复被忽略，导出写盘前再次检查取消。已经发生的持久化效果不会回滚。创建回报 placeholder/applied/saved 与 blockId（包含真实单卡生成和绑定保存阶段），样式回报 applied/saved 阶段；主进程导出在真实 writeFile 前后记录 writing/saved 与路径。取消或超时后最多等待 5 秒收取原请求终态，保留已确认效果并停止后续操作；缺少终态时如实显示最近阶段和未确认状态，绝不宣称未执行。

同请求 ID/参数的并发调用共享同一 Promise，重复调用返回既有回执；不同参数复用 ID 被拒绝。每个组合保留至多 32 条回执，主进程保留至多 512 个含操作的已完成请求结果（进程生命周期，不跨重启）；达到上限拒绝新生成并提示重启，不淘汰旧回执重做副作用。组合总体 600 秒，创建桥 250 秒、其他桥操作 100 秒。取消原生保存框由用户完成；超时/停止后禁止继续写盘。

## 尚未接入的家族与扩展点

- Notes 的通用目录仍只接入 Canvas inspect；研究会话已有独立 research_canvas_inspect/apply/undo 与数据工具，尚未统一成跨模式目录。研究 inspect 现在声明 presentation/presentationFields，apply 可单独提交 `{op:"presentation",fields:{workbenchStyle:"enterprise"}}`，复用手动 `setWorkbenchStyle`，按当前看板保存；该操作不能与内容/整理混批。需重新 inspect 获取新 revision 后才能继续整理，展示偏好不宣称支持内容事务撤销。
- 客户端导航、设置、主题、窗口、更新及其他菜单：当前只有 zoom.reset；应映射现有 menu command handler，不开放任意命令执行。
- 组件隐藏顶栏已有 `titleBar:false`；去除组件外框/边框没有注册，也没有新增外框持久化模型，不能把隐藏顶栏称为去除边框。
- 文件查看器/附件节点外观：当前仅 research 节点。研究组件内置 HTML 如果自己不遵循主题令牌，外层不能保证改写其自定义固定颜色。
- 插件/MCP、账户、云文档、日程、下载、发布和 OS 级操作：没有登记或授权；不宣称会话已支持。
- 公开 API：本目录是内部 Notes host 适配层，尚未成为全产品跨入口的工具协议。新能力在注册表添加类型、schema、可用性和共享处理器即可；不应增加自然语言关键词分支。

## 证据分层

聚焦测试覆盖 schema、host 回执、幂等、取消、账户/会话与正文变化、持久化、创建后导出、待澄清停止、普通文本预览。Playwright 使用真实 NotesEditor、脚本化外部模型与导出 stub，证明前端组合流程。服务测试实写 Markdown，PDF 聚焦测试使用模拟 Electron printer。真正 Electron PDF 内容、原生保存框及客户端重启恢复仍由集成后的原生验收完成，不能由这些测试替代。

## 本轮直接验收范围

- 在真实 NotesEditor 中，全笔记研究组件右对齐后，正文富文本、组件 payload 和宽度保留；保存内容与实际布局一致。
- Notes host → renderer → selected component inspect/apply → NotesStore → 导出链覆盖真实处理器；仅模型输出与原生 PDF printer 仍沿测试替身。
- 选区、正文、payload 或会话在异步 hash 中改变时拒绝旧写入，重新发送并 inspect 后可继续；没有选中、不同目标、非法结构均无副作用。
- 研究会话工具 → HTTP → session bridge → 真实 workspace 的主题变更保持其他看板不变、保存失败不假报成功、旧 revision 可重新 inspect 重试；保留既有手动主题和全局试用行为。
