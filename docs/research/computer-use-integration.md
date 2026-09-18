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

聚焦检查：18 项 controller/bridge 测试、类型检查、真实嵌入 daemon 的 metadata/工具清单/关闭探针通过。用户气泡长网址在 Chromium 280–800px 布局探针中无水平溢出。Photoshop 绘制、最终包权限归属、可见光标与停止仍需集成客户端实测；本段不代表这些验收已经完成。
