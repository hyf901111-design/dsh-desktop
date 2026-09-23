# Computer use 开源集成评估

日期：2026-09-18。开发基线：`7c381daedef553aef5f154e6be9289bf1cbb594f`。

## 结论

优先用 **Cua Driver 0.28.2 的本地执行层**做第一轮集成验证，保留 EWork 现有的模型、会话、任务调度和授权边界。不要引入另一套独立 agent，也不要用桌面控制替换已实现的 browser_use。

第一条验收任务：从 Dock 打开本机 Photoshop 2025，新建画布，使用 Photoshop 图形工具创建可编辑的五角星。不能用生成一张星形图片、写 SVG 文件或预设固定坐标代替真实应用交互。

本轮完成源码评估、发布包核查以及隔离运行时加载验证；**尚未把 computer_use 注册到产品，也未完成 Photoshop 操作验收**。

## 候选比较

| 候选 | 已核实的能力 | 代价与限制 | 决策 |
| --- | --- | --- | --- |
| Cua Driver 0.28.2 | MIT；TypeScript、Electron、MCP 接口；控件、截图、应用和窗口操作；原生光标；SDK 支持取消信号 | 原生包和 worker 需打包签名；同进程运行默认没有原生光标 UI adapter；macOS 后台 drag 明确拒绝 | 首选，先验证宿主私有 worker/daemon |
| Peekaboo 4.4.0 | MIT；macOS 原生 CLI/MCP；Dock、菜单、对话框、AX、截图、拖拽 | 发布版要求 macOS 15+；CLI 约 75 MB 解包体积；拖拽必须使用共享前台光标；统一视觉需要额外接入 | macOS 专用备选 |
| nut.js | 跨平台键鼠、截图及图像匹配基础能力 | 仍需补齐语义定位、会话、授权、回读验证和光标；开源源码与预编译分发方式不同 | 不作为第一版主体 |

许可证结论只覆盖读取的主项目和 SDK 声明；最终分发仍应针对锁定版本及实际引入的依赖生成 notices，不能把仓库根许可证推断为所有可选组件的许可证。Cua 的可选 Omni/模型组件不在本次推荐依赖内。

## 源码发现

### 接入形态

Cua TypeScript 根入口支持 `CuaDriver.create()` 与 `createPrivateWorker()`。Electron 入口主要提供宿主权限辅助方法，不是一个包含全部产品交互的即插即用组件。

官方 EMBEDDING 文档明确：任意同进程运行时没有 AppKit 光标适配器时，overlay 方法返回 `facility_unavailable`。有可见光标需求，应先验证私有 worker 或 daemon-backed host。

推荐由 EWork 直接启动受管理的子进程，限定 `com.evanarts.sherlock` 宿主身份、生命周期和私有通信通道。不要通过另一独立 app 启动司机程序，也不要使用未经审查的 unrestricted 模式。是否能继承宿主 TCC 权限，必须在实际签名包中验证，不能用源码说明代替实测。

### Photoshop 绘制

已确认 `/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app` 存在。

Cua macOS `drag.rs` 明确拒绝后台拖拽，返回 `background_unavailable`，要求 foreground。Peekaboo 的 drag 文档也要求前台共享光标。因此绘制五角星的拖拽按前台执行设计，不能承诺用户同时操作同一桌面完全不受影响。

第一轮优先选择多边形/星形工具：观察菜单和工具选项 → 设置五边及星形选项 → 在新画布上进行一次受控拖拽 → 回读验证。参数名称和位置按实际 Photoshop 版本观察，不硬编码。控件树不足时使用截图定位，重新观察窗口变化。

如果后续需要画笔连续绘制任意路径，需单独验证按住鼠标时的多段路径接口；目前确认的是起点到终点拖拽，不能把它表述为已具备任意画笔路径能力。

### 光标统一

Cua 已有原生 overlay、会话名和自定义主题，但标签由原生 badge 单独绘制，并不包含在主题文件里。只替换指针主题不会自动变成 EWork 现有的灰底白字居中标签。

必须验证宿主活动事件/光标 hook 能否驱动 EWork 自有覆盖层；若不足，再评估最小原生 badge 补丁。避免同时显示两套 Agent 光标。位置应对应真实操作目标；拖拽中连续跟随；任务完成、取消、失败、进程退出时收起。不能让默认定时淡出覆盖产品的任务生命周期。

## 与现有代码的衔接

- `packages/dsh-research-task-runtime/browser-use-tools.js`：可参考现有模型工具注册、会话身份和截图附件返回方式；新增独立 `computer_use` 工具。
- `src/main/search/local-search-bridge.ts`：复用回环地址、令牌鉴权、请求取消及输入大小上限；新增受控桌面请求路由。
- `src/main/search/conversation-browser.ts`：参考动作串行和每步观察；桌面动作必须使用全局独占执行权，避免不同会话争抢同一鼠标。
- `packages/dsh-research-task-runtime/agent-cursor.js`：视觉基准；桌面覆盖层需要跨窗口显示能力，不能把浏览器 DOM 光标直接搬出窗口。
- 保持驱动适配接口可替换，模型不会直接得到任意 CLI/脚本执行入口。

建议第一版暴露应用发现/打开、观察、点击、输入、按键、滚动、拖拽、结束；绑定应用 PID、窗口标识、当前观察 revision。坐标明确区分屏幕逻辑点、截图像素及显示器缩放。

停止任务必须取消待执行动作和正在进行的手势、释放鼠标与修饰键、隐藏光标；驱动超时/崩溃需由宿主回收。首次权限配置、任务接管和紧急停止入口应在宿主中可见。

截图默认限于任务目标窗口并按步骤获取；内容进入当前模型上下文的范围需要清晰。读取的页面和桌面文本属于外部数据，不能据此扩大用户授权或切换任务目标。

## 已完成的可复现验证

隔离目录：`/tmp/computer-use-evaluation-20260918`，未修改产品依赖或用户的桌面控制权限。

1. 从 npm 安装锁定 `@trycua/cua-driver@0.28.2`，禁用安装脚本；核实对应 arm64/x64 原生包存在，每个解包约 53.45 MB。
2. 在 Node v22.23.2 / arm64 中 import、create、metadata、listToolsJson、shutdown 成功。
3. 在产品同版本 Electron 43.4.0 / Node 24.18.1 中重复上述调用成功。运行使用隔离 userData，无窗口操作、截图或权限申请。
4. 元数据：driver `0.28.2`，contract `0.8.0`，MCP `2025-06-18`，embedded=true。
5. 真实工具清单包含 list_apps、launch_app、click、double_click、drag、press_key、hotkey、move_cursor、set_agent_cursor_enabled、set_agent_cursor_theme、start_session、end_session 等。

证据：`sdk-probe.log`、`electron-probe.log`、`tool-inventory.json`。这证明 SDK 能被当前运行时加载，不证明最终签名包、权限继承、真实输入或 Photoshop 绘制已通过。

## 接入与验收顺序

1. **驱动与权限**：锁定二进制和校验和，在独立功能分支接入私有 worker；校验签名宿主的权限归属、冷启动、退出和权限撤销。
2. **观察与基本操作**：验证应用/窗口身份、AX 与截图坐标一致、中文输入、菜单、重观察和操作后验证。
3. **Photoshop 端到端**：从 Dock 启动，新建明确尺寸画布，绘制五角星；检查截图和图层可编辑性，不修改现有文档，不擅自覆盖文件。
4. **光标与接管**：同款灰色指针及居中白字标签、拖拽轨迹、缩放/多屏定位、任务结束淡出、用户抢占与紧急停止。
5. **签名包复测**：按本地测试手册从集成批次构建，在真实客户端从自然语言对话完成全流程。

每阶段只做直接相关验证。未完成上述流程前，界面不能宣称“已支持 Photoshop 自动绘制”。

## 固定版本与来源

- Cua 源码：`05f29785b508a4441ec3aa06c556a8e8b26c1d71`。
  - [SDK package](https://github.com/trycua/cua/blob/05f29785b508a4441ec3aa06c556a8e8b26c1d71/libs/cua-driver/typescript/package.json)
  - [宿主嵌入与光标限制](https://github.com/trycua/cua/blob/05f29785b508a4441ec3aa06c556a8e8b26c1d71/libs/cua-driver/rust/Skills/cua-driver/EMBEDDING.md)
  - [macOS drag 实现](https://github.com/trycua/cua/blob/05f29785b508a4441ec3aa06c556a8e8b26c1d71/libs/cua-driver/rust/crates/platform-macos/src/tools/drag.rs)
  - [光标主题与原生 badge](https://github.com/trycua/cua/blob/05f29785b508a4441ec3aa06c556a8e8b26c1d71/libs/cua-driver/docs/cursor-themes.md)
  - [0.28.2 发布产物](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.2)
- Peekaboo 源码：`4d3c92eaf6e08ad3f17657daa2754b851bc754f4`。
  - [平台要求](https://github.com/openclaw/Peekaboo/blob/4d3c92eaf6e08ad3f17657daa2754b851bc754f4/docs/platform-support.md)
  - [拖拽要求](https://github.com/openclaw/Peekaboo/blob/4d3c92eaf6e08ad3f17657daa2754b851bc754f4/docs/commands/drag.md)
  - [发布版](https://github.com/openclaw/Peekaboo/releases/tag/v4.4.0)
- [nut.js 官方仓库及分发说明](https://github.com/nut-tree/nut.js)。

## 接入进度（2026-09-18）

已新增 `computer_use` 会话工具和回环鉴权路由；宿主直接管理 Cua 的私有嵌入 daemon，固定 standard 权限模式、不接受模型传入驱动参数或脚本。桌面租约、观察 revision、窗口/像素边界检查、操作后截图、会话结束清理和取消均由宿主执行。

首用缺少系统权限时，由签名 EWork 主进程解释并提供系统设置入口。桌面覆盖层沿用灰色指针、灰底白字居中标签；独立状态条提供停止按钮，快捷键为 `⌘⇧Esc`。原生 drag 是 700ms 有界手势，取消后保留租约至输入清理完成，不声称能中断原生阻塞手势的任意一个事件。

分发锁定官方 universal 二进制 SHA-256：`386db225a3080714a0f9f935525e61efaf46709587ef8b94dd2df81aeb2f6daa`；构建自动准备资源，包验收验证驱动版本和 SDK 可加载性。不开启 unrestricted，不引入第三方模型服务。

聚焦检查：22 项 controller/bridge/模型图片能力测试、类型检查、真实嵌入 daemon 的 metadata/工具清单/关闭探针通过。用户气泡长网址在 Chromium 280–800px 布局探针中无水平溢出。Photoshop 绘制、最终包权限归属、可见光标与停止仍需集成客户端实测；本段不代表这些验收已经完成。

集成签名包 `1ef4d7d` 已完成包完整性与签名验证，实际对话成功执行 `apps` 和 `observe scope=desktop`，截图出现在会话中。实测 GLM-5.3 路由仅声明文本输入，截图在模型边界被转换为文字占位；新增操作前模型能力检查，拒绝纯文本或能力未知的路由，不再让模型通过搜索临时文件补救。这里只证明枚举与截图链路，Photoshop 端到端仍需视觉模型验证。

## 2026-09-19：长任务诊断与连续画笔

当前已接入产品 `computer_use`。本文前面的“尚未注册”描述的是 9 月 18 日评估阶段，不代表当前实现状态。

从用户本地 `session-98938ac4-a3a8-49ac-a62f-2f1da2cd51c9` 的第 4 轮核对：总计 99.66 分钟，52 个模型步骤，51 次工具调用累计仅 24.335 秒；模型等待占主要部分。13 次 observe，9 次观察过期错误，多个模型响应超过原来的 120 秒有效期。原始 3440×1440 PNG 连续进入上下文，且单次直线 drag 无法高效表达自由画笔。

本次改动：

- 截图最长边限制为 1600px、JPEG 78；工具明确使用返回图片的像素坐标，再映射到驱动原始坐标。窗口坐标映射仍基于真实窗口边界。
- 简短 `view-N` 观察标识降低复制错误。观察超过 30 秒时先重读；只有目标/尺寸/几何和输入区域像素一致才能继续。键盘与控件操作要求整张截图与控件树一致。界面改变就返回新观察且 `performed=false`，不发送输入。
- `stroke` 一次提交 1–12 条独立连续笔画，单条 2–256 点、合计至多 768 点；单批 100–8000ms。新 N-API 模块通过真实 macOS 鼠标按下、移动、抬起执行，逐段插值，无终端脚本、SVG 或图片导入替代绘制。
- 每批绘制绑定实际窗口 PID、window_id 与窗口范围；切换前台、窗口移动、停止信号会中止并释放鼠标。宿主在 native worker 完成释放前不交出桌面控制权。Agent 光标跟随实际系统鼠标位置。
- 一轮任务固定 10 分钟或 60 次调用预算，连续 3 次失败后禁止继续输入；预算跨驱动重连保留。运行时计时器会取消慢模型等待，避免只限制工具时间却让任务持续 99 分钟。下一轮用户指令才重置。
- 模型及服务端推理速度未由上述改动改变。10 分钟上限只防止失控等待，不能当作绘制成功的证据。正式验收必须在集成签名客户端发出 Boardmix 任务，核对新建画布中的真实画笔对象。

聚焦验证包含：旧观察复核后输入/不输入分支、压缩后坐标映射、多条笔画只回读一次、非法点边界、取消期间保持 lease、跨失败重连预算、工具 schema 实际注册与模型等待计时器。原生模块另验证加载和非法参数拒绝，不用合成 UI 输入代替产品验收。

实测补充：Boardmix 的窗口列表包含多条离屏的 30px 高工具窗口，模型也曾只传 window_id 而漏传 pid。宿主现在缓存本轮已发现窗口的准确所属进程，允许使用该 window_id 观察；windows 返回可直接调用的 next 参数并过滤离屏/微小工具窗口。缓存不会跨用户会话或下一轮复用，显式传入错误 pid 仍由驱动拒绝。支持 windows 按准确 bundle_id/name 找到正在运行的唯一应用。

首次真实画虎任务在 5 分钟左右建好新白板并到达 stroke，但 Cua 激活窗口返回 `focused=true, frontmost_ordinary=false`，未发送画笔输入。新增兼容处理仅接受这一特定的已聚焦/排序未确认结果；画笔 native 层仍独立检查前台进程、目标几何，以及 WindowServer 从前到后的窗口中实际笔画包围区域未被其他窗口覆盖。辅助标题窗只有在不覆盖绘图区时才不阻挡；权限拒绝或其他驱动错误仍立即失败。检查在笔画内持续进行，取消或遮挡时释放鼠标，并报告遮挡窗口标识。不能直接把 Cua 激活请求被接受当作原生画笔可以执行的证据。

第二次实测识别到 UURemoteServer 在 cursor 层放置的全屏远程光标表面：它的 WindowServer 矩形覆盖整屏，却不代表目标应用无法接收鼠标。现在仅对 cursor 层及以上表面，使用系统 AX 命中查询确认当前笔画点仍归目标进程；普通遮挡窗口、目标移动、进程切换仍拒绝，无法确认命中也拒绝。绘制中持续复核实际命中。另修复 snapshot 更新后 element_token 必然改变而误判整个控件树变化的问题；只有其他语义字段及像素一致才重新绑定新 token。每次输入后等待 150ms 让应用处理绘制再回读，减少成功点击后截图过早导致的重试。39 项聚焦检查及类型检查通过，原生模块重新编译成功；此段仍不代表画虎验收完成。

后续回归进一步发现 Dock 自身也有 layer=20 的全屏表面。提升到普通窗口之上的系统表面统一用 AX 实际命中的进程及窗口几何确认是否穿透，而不依据表面矩形宣称遮挡；普通窗口覆盖仍拒绝。命中的弹窗或其他目标应用窗口因几何不匹配而拒绝。工具提示要求一次仅发一个桌面调用，最新 revision 放到返回数据开头，减少模型同批点击复用旧观察。连续画笔仍待下一签名包实测，不把失败轮次的耗时报告为成功性能。

## 2026-09-21：仅后台输入

当前输入默认改为 `delivery_mode=background`，拒绝 desktop 目标输入，且不接受模型覆盖投递模式。桌面仍可截图观察，应用通过 open 打开、windows/observe 绑定；不自动降级到前台。普通操作复用锁定的 Cua Driver。

drag/stroke 共用原生后台手势执行器：通过动态解析 SkyLight 的 `SLEventPostToPid`、`CGEventSetWindowLocation` 和 `SLEventSetIntegerValueField` 向绑定 PID/window 投递事件，使用私有事件源状态，绝不调用全局 HID 投递或移动物理指针。字段布局参考固定 Cua 源码的 `input/mouse.rs`，其 MIT 许可证随应用保留。缺少所需符号时明确失败。手势每一步校验窗口所有者、可见性、位置和尺寸，允许被其他窗口覆盖；取消和异常只向原目标释放按键，租约等工作线程释放后才结束。覆盖层读取已投递事件的位置，不跟随用户的鼠标。

范围：窗口内左键拖拽、多笔画、cmd/ctrl/shift/option 修饰键；不支持跨窗口拖放、桌面/Dock 输入、fn 手势或最小化窗口。`performed=true` 表示投递完成，不保证目标应用接收，仍须截图确认。私有接口可随系统改变，不能仅凭编译成功宣称支持所有应用。

验证分层：36 项控制器/视觉准入聚焦检查和 TypeScript 检查通过，原生模块编译通过。Boardmix/Electron 后台事件接收、同时操作其他窗口和打包权限验证必须在集成客户端中另行记录，当前尚未完成。

### 集成包 b3177e2 的现场结果与后续修正

从实际签名包的 EWork 对话调用 computer_use，在 Boardmix 新建的专用白板中成功完成 8 秒后台 stroke，回读截图出现黑色曲线；停止按钮成功终止后续任务。标题重命名未通过：模型误把边框当作编辑态，cmd+a 实际选中了白板图形。后续文字工具测试的明确坐标点击返回 `route=accessibility`，仅清除了选择，未激活文本工具。

据此，坐标点击改用与已验证画笔相同的窗口定向原生路径，避免 Cua 将坐标意图转换为不可验证的泛容器 AXPress；显式 element_token 仍使用语义辅助功能路径。增加左/右/中键、单/双击的明确参数，不发送画笔拖动事件冒充点击。39项聚焦检查通过；修正版点击/文字及用户同时移动物理鼠标的验收尚待完成。用户此前反馈“没注意”，不能据此记为并行使用通过。

### 2026-09-21 回归修复（待集成包完整画虎验收）

- apps/windows/open 也绑定宿主创建的显式 session，避免发现操作进入另一个可独立过期的隐式生命周期；SDK 异常读取 inner.message/errorCode，不再只暴露 DriverError.Tool。
- 成功的发现/观察重置连续失败计数；锁屏和休眠取消活动输入，锁屏期间不启动新的操作。
- 原生像素事件补齐固定版本 Cua activate_without_raise 的 AppKit 准备与 Chromium off-window primer。不调用 SetFrontProcess/AXRaise，不移动系统光标。准备会向应用发送 focus/defocus 状态记录，不能把窗口不提到前台等同于完全隔离键盘焦点；仍须按真实并行使用验收。
- 13:17:10 与 13:19:28 两次系统日志均显示合盖状态从 AC 切到电池、Clamshell Sleep、显示器休眠后锁屏；后一次约 0.8 秒恢复 AC。当前失败会话未发送键盘输入，首轮首次调用在 13:17:34，不能把这两次锁屏归因于锁屏快捷键。未修改系统电源或锁屏设置。
- 43 项聚焦控制器/视觉检查、类型检查与原生编译通过。源码检查不代替整条画虎任务验收。

## 2026-09-23：同进程多窗口键盘输入

飞书等客户端会在同一 PID 下保留主窗口及辅助窗口。固定的 Cua Driver 0.28.2 对这类窗口拒绝后台进程级键盘事件，返回 `same_pid_keyboard_ambiguity`。原控制器把该拒绝直接作为任务失败，导致输入框无法输入，后续搜索和快捷键也中断。

现在仅在驱动结构化返回 `effect=refused`、该拒绝码及完全匹配的 PID/window_id 时，对 `type`、`key`、`hotkey` 启用受控重试。`type` 必须使用当前截图的输入框 `x/y` 才会自动重试，以确保前台投递时重新聚焦目标控件；`hotkey` 也需有坐标或控件 token。缺少定位时返回新观察和 `keyboard_target_required`，不发键盘事件。`key` 由驱动在精确窗口聚焦后投递。驱动完成后恢复先前前台应用，控制器仍回读目标窗口；投递结果不能代替界面验收。

带 `element_token` 的 `type` 可能在 AX 写入后才收到同一拒绝码，不能按“未投递”重放。控制器返回 `effect=unverifiable` 和新观察，要求先检查文字是否已经出现，再用坐标输入。其他拒绝、权限错误和部分输入结果均不自动重试。此修复会在必要时短暂激活目标窗口；不保证与用户同时在其他应用键入完全互不影响。聚焦测试覆盖拒绝后的定向重试、目标不明、AX 不确定及错误目标不重放。真实飞书输入仍需从含此提交的集成客户端验收。
