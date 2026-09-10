# 通知与更新：Figma 第 31–37 组实现与核验

设计文件：`Jkyr5rMvgM8GNH6E68xnqd`。2026-09-10 先使用 Figma `get_design_context`、`use_figma` 读取节点及 screenshot 后修改生产组件。外层 1580×1100 是设计展示容器，实际应用窗口 1380×900。

## 节点和实测样式

| 范围 | 浅色 / 深色主节点 | 关键子节点 |
| --- | --- | --- |
| 邀请、聚合、版本卡 | 323:564 / 323:1313 | 336:588、336:603、336:615 / 336:750、336:765、336:777 |
| 下载和过程状态 | 323:711 / 323:1460 | 336:628 / 336:790 |
| 校验与失败 | 323:858 / 323:1607 | 336:717、336:705 / 336:800 |
| 关于检查更新 | 337:588 / 337:986 | 337:629、337:632 |
| 关于发现版本 | 337:680 / 337:1078 | 同结构的版本状态与按钮 |
| 关于下载 | 337:783 / 337:1181 | 同结构的版本状态与按钮 |
| 关于校验 | 337:883 / 337:1281 | 337:972 / 337:1370 |

通知材质：浅色 `rgba(247,247,248,.78)`、白色 `.72` 内描边，深色 `rgba(51,51,51,.88)`、`rgba(88,88,88,.45)` 内描边；Background Blur 原始节点 radius 24 对应 Figma design context CSS blur 12px（背景模糊按 raw/2 换算，阴影不换算）；阴影 `0 2px 10px -3px` 黑色 `.06` / `.16`。圆角 10，padding 12，gap 6。研究侧栏宽 252，设置侧栏宽 212，位置跟随账户区域。内描边不占内容空间。

标题 13/20 medium；正文 12/18；辅助文字 11/17。按钮高 26、圆角 6、水平 padding 10。更新卡高 99，下载卡高 76，校验卡高 67，邀请卡高 123。进度线高 3，圆角 2。圆环使用原始 Figma SVG，900 ms 线性旋转。字体 Noto Sans SC 由全客户端字体模块加载。

关于内容宽 760、模块 gap 24；品牌区 min-height 152、padding 24、gap 32，Logo 132×43.154。版本区列宽 188，gap 8；单一操作按钮 min-width 108、高 32、圆角 8、图标 14、文字 13/20。日志卡圆角 14，左右 padding 24、行 padding 20、左列 104、列 gap 24；版本 18/26，内容 14/24。当前版本读取真实 bridge，日志不会展示高于真实运行版本的条目。

## 行为

- 现有 `updates:download` 流程继续负责下载、重新检查发布新鲜度、原生安装准备和自动重启。没有新增模拟下载或发布路径。
- 下载进度、字节和速率来自 electron-updater 的 `download-progress` 事件；缺少实际计数时不编造大小和速率。
- `downloaded` / `installing` 显示“正在校验更新文件”“完成后将自动重启应用。”及不定进度圆环；About 同步为“校验中…”。移除渲染层第二次安装确认入口。
- 关于：同一按钮显示检查中、更新、下载中百分比和校验中；检查与下载仍调用真实 preload bridge。重复点击被抑制。
- 版本卡详情、消息中心详情发送 DOM 导航事件，由真实 SettingsRoot 打开关于；消息中心在既有 localStorage 范围保留一个最新版本状态记录及已读版本，重新挂载和客户端重开后仍可查看；存储只保留版本记录与稳定状态，读取进行字段白名单和尺寸校验，丢弃任意额外 HTML/对象字段。下载/安装状态与百分比不持久化；冷启动只显示版本及详情，进度与操作必须来自当次 updater 事件。
- 邀请保留既有服务、权限、版本校验、10 秒计时与悬停/焦点暂停、聚合、已读。接受中按钮显示“加入中…”，接受后提供“打开看板”；不擅自跳转。更新正在下载或校验时暂让出通知区域，并暂停邀请倒计时。
- 所有 SVG 从 Figma 导出后内嵌保存于 `figma-notice-assets.ts`，离线运行不依赖临时资产 URL。

## 已执行核验

```
npx vitest run test/sidebar-update-control.test.ts test/update-ui.test.ts test/settings-about.test.ts test/update-state.test.ts test/update-freshness.test.ts test/update-install-lifecycle.test.ts test/research-boards-ui.test.ts test/update-notification-store.test.ts
npx tsc --noEmit -p tsconfig.node.json --composite false
node scripts/verify-figma-updates.mjs
SHERLOCK_BOARD_QA_OUTPUT=output/playwright/figma-collaboration-final node scripts/test-research-boards-browser.mjs --figma-collaboration-focus
```

原 36 项聚焦检查通过；追加通知状态与最新版本记录重挂载/字段校验后，8 个相关测试文件共 47 项通过；类型检查通过。浏览器夹具直接加载生产 `SidebarUpdateControl`、`mountResearchBoardNotifications` 与真实 settings-general About React bundle，以受控 bridge 事件覆盖浅深色检查、发现、下载、校验及深色邀请/接受 10 个状态，页面错误为 0。实测研究侧栏宽 252，发现/下载/校验高分别为 99/76/67，background 与 blur 匹配上述值，Noto Sans SC 字体加载检查为 true。

截图与测量：`output/figma-updates-20260910/`，含 `results.json`、`light-*.png`、`dark-*.png`、`dark-invitation.png`、`dark-invitation-accepted.png`。原稿截图：`figma-group36-light.png`（包含外层展板，请只比较内部应用区域）。

两成员聚焦流程以本地 Worker 和两个独立服务/渲染器执行，退出码 0，`FIGMA_COLLABORATION_FOCUS_PASSED`，`console.json` 中 errors 与 failedRequests 均为空。通过创建协作、真实邀请权限更新/撤销/接受/拒绝、双方打开、双向文本编辑和拖动写回、并发文本与几何合并、共享对话、重新加载、viewer 禁止写入/重命名/邀请/角色修改、管理设置移除项、退出/重新加入、取消协作后的对方撤权及创建者“放回工作区”入口恢复。退出和取消后服务端 `ACCESS_REVOKED` 是预期权限保护。拒绝安排在流程末尾，不绕过服务端拒绝后邀请冷却。

该模式在权限和协作闭环后结束，跳过原脚本后段文件剪贴板、复制回环和其他无关用例。导航几何断言保留，并按 Figma 286:469–477 校正工作区文字为 14/21、时间 11/17；夹具侧栏固定 260px，工具列允许 2px 夹具差异，实际 280px 客户端对齐另由真实 Electron 验收。截图在 `output/playwright/figma-collaboration-final/`：`pending-invitation-owner.png`、`invitation-revoked-live.png`、`held-drag-ephemeral.png`、`viewer-light.png`、`viewer-leave.png`、`cancel-sharing-owner.png`、`cancel-sharing-peer.png`、`invitation-declined.png`。此处是生产 UI + 真实本地服务的集成证据，非真实打包 Electron 整页视觉验收；合成问答模型只用于调用次数和同步检查。

## 验收边界和剩余差异

上述截图验证生产模块，夹具外层侧栏和账户是定位支架，不属于真实客户端整页验收。最终真实 Electron 客户端集成截图、设置面板宽度和浮层锚点由主任务在本地集成构建后验收。未触发真实线上更新下载、安装或重启，以免替换待验收开发客户端；安装的自动完成、新鲜度和失败路径由既有聚焦生命周期测试覆盖。

About 保留真实完整旧版日志，因此旧版段落数量与 Figma 演示摘要不同；不会以演示数据替换真实历史。版本消息记录保存于本机 localStorage，不新增服务端历史接口或入口。未单独实现“正在准备安装”与“正在重启应用”的新业务细分事件：当前真实主进程 `installing` 贯穿准备与退出，渲染持续显示校验和自动重启告知，不伪造阶段或进度。
