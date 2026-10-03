# EWork Odyssey 1.1.0

日期：2026-10-03。平台：macOS Apple Silicon。

## 更新日志

- 新增网格研究画布，支持对齐、拖动缩放、框选创建与针对组件提问，优化窄窗口布局和一键整理。
- 扩展至74类预置业务组件与图表，覆盖金融行情、财务研究、运营、文件图库、日历、音频及视频。
- 优化模板优先的批量创建与刷新，减少逐卡重复生成；保留完整数据、来源、时点、单位及缺失原因。
- 完善图表图例、键盘读数、完整数据与个人交互状态恢复，统一浅色、深色和企业主题及首次加载动效。
- 统一组件最小尺寸，长标题右侧渐隐并支持悬停滚动预览，修复控件文字溢出和输入框聚焦描边。
- 修复日历日期网格与事件布局；精简链接和智能组件创建界面，输入区域随组件尺寸调整。
- 修复YouTube登录回传，登录后返回原组件并保留视频网址和播放起点。
- 稳定链接网页自适应与手动缩放，修复持续缩小、放大失效及调节组件尺寸后的缩放跳变。
- 加密保存本人网页登录会话与当前页面，客户端重启后恢复；登出和删除组件时同步清理。
- 修复折叠侧栏头像对齐，完善插件与工具配置、MCP取数超时处理和桌面输入稳定性。

## 发布范围

- 用户已验收的集成提交 `c7e1f2a2ff4c46322e9bfeefec4a9eb02534d7c3` 已快进至规范本地 main，批次 `20260928-01` 的晋升确认及租约归档完成。
- 修复干净安装时画布交互补丁与静默刷新参数不兼容，最小复现先失败；22项直接相关检查和按锁文件重新安装、补丁重复执行通过。旧单独表单测试补齐其真实运行作用域中的 workbenchSelected 初始状态。修复提交 `b47fbe75`。
- 保留 Developer ID 和旧版兼容桥签名，沿用用户要求跳过 Apple 公证和 stapling；不宣称已公证。
- 验证两条公开更新源及 1.0.6 → 1.1.0 差分合成，不执行旧客户端全量安装、替换和重启更新测试。
- 同步 GitHub awake-ai-lab/sherlock-desktop 的 hyf、main；不推送标签，不同步上游。

## 本地分支取舍

三处只剩依赖的旧临时 worktree 经核验无暂存修改、无残留跟踪文件且 HEAD 已在 main 中，恢复各自已提交文件；保留原 HEAD 和 ignored 依赖。以下旧分支改名归档，完整保留提交和工作树，不并入已接受实现。已明确取消的集成分支保持原名、原 tip，按精确取消归档识别。

| 原分支 | 保留提交 | 处理 |
| --- | --- | --- |
| `codex/experiment/perspective-parity-preview-20260925` | `af0dc77e68767a12cc7d509924e001719fdcc159` | 旧Perspective实验方案，当前用户接受的网格与预置模板方案取代此路径；`archive/release-1.1.0-20261003/experiment/perspective-parity-preview-20260925` |
| `codex/feat/bundled-component-skill-20260923` | `c21bffbd6b8966365ef6271ba5babc135a6374fd` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/bundled-component-skill-20260923` |
| `codex/feat/bundled-component-skill-main-20260923` | `12796dfbbd4d4ce07e2956d134b0b796f87aa7a2` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/bundled-component-skill-main-20260923` |
| `codex/feat/computer-menu-routing-20260923` | `16cd87220b41c2a4f57d2cb4ccf82d8fdcd4d2bf` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/computer-menu-routing-20260923` |
| `codex/feat/computer-menu-routing-main-20260923` | `d1c0e22b6738f0dc02b168d4e83b13bb8454f3b6` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/computer-menu-routing-main-20260923` |
| `codex/feat/legacy-workbench-prompt-recovery-20260923` | `5cac5cd6c273a403b2a622a9182ea8f29e35631d` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/legacy-workbench-prompt-recovery-20260923` |
| `codex/feat/perspective-charts-20260925` | `5fccca05b542affd8ecefe51d3c52109ad015171` | 旧Perspective实验方案，当前用户接受的网格与预置模板方案取代此路径；`archive/release-1.1.0-20261003/feat/perspective-charts-20260925` |
| `codex/feat/perspective-research-workspace-20260925` | `ccc51cbadf85355e5ca8f91475c7caf76f00a324` | 旧Perspective实验方案，当前用户接受的网格与预置模板方案取代此路径；`archive/release-1.1.0-20261003/feat/perspective-research-workspace-20260925` |
| `codex/feat/research-canvas-wheel-pass-through-20260923` | `39080d139b0c8048830bd234fed374e9cae85b78` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/research-canvas-wheel-pass-through-20260923` |
| `codex/feat/research-child-capability-parity-20260923` | `876e1c14af209ace513735cd2da4c6bc5f3a93a7` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/research-child-capability-parity-20260923` |
| `codex/feat/research-generation-download-guard-20260923` | `9bc3483f0a1c5cd7f28134544c88fca3ede3f917` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/research-generation-download-guard-20260923` |
| `codex/feat/research-generation-reliability-20260923` | `164bab7fd7ab412a37fee154a0877b2c1a74d4a3` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/research-generation-reliability-20260923` |
| `codex/feat/right-tab-icon-refinement-20260923` | `c61c1ac0b615d30f361c0b808b1cd8cb6105a5dc` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/right-tab-icon-refinement-20260923` |
| `codex/feat/right-tabs-tooltips-20260923` | `1e50cc697f9f08810cdf240009a518695f0a52a2` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/right-tabs-tooltips-20260923` |
| `codex/feat/simulated-workbench-acceptance-20260923` | `2c8873e33e0221f316f82bb9743552876091f152` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/simulated-workbench-acceptance-20260923` |
| `codex/feat/structured-workbench-generation-20260923` | `a5e959826950a51bcf76b2a721bf1bc1b34d33d5` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/structured-workbench-generation-20260923` |
| `codex/feat/terminal-card-style-20260926` | `1f052624665b1746629ba48c27d72e658aa54fb9` | 旧终端式样式实验；当前三主题宿主模板已经完成用户验收；`archive/release-1.1.0-20261003/feat/terminal-card-style-20260926` |
| `codex/feat/workbench-figma-runtime-20260923` | `44bf09bf738cc0d00df343b686d85b9d73132f72` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/workbench-figma-runtime-20260923` |
| `codex/feat/workbench-parity-20260923` | `8f3791e08afe04784a096085f0e981374fb1eb84` | 已取消20260923方案及其前置分支，保留历史；当前已验收实现取代此路径；`archive/release-1.1.0-20261003/feat/workbench-parity-20260923` |
| `codex/integration/20260923-01` | `262b603a` | 保留明确取消的集成批次，正式门禁按精确归档 tip 识别；原名保留 |
| `codex/recovery/integration-docs-20260930` | `fa3a12a020a47035bf323abf398555a6e96f3f91` | 相同补丁已纳入main，保留重复恢复提交；`archive/release-1.1.0-20261003/recovery/integration-docs-20260930` |

## 构建与公开验收

### 本地构建与客户端

- 正式构建源码：`b608ef064ef1879545a949a29d704121ef365acb`；干净规范 main 通过 `git:formal:verify`。
- 按锁文件全新安装依赖和补丁重复执行通过；画布交互直接检查22项通过。
- 发布聚焦检查覆盖13个文件、107项。首次发现打包运行夹具未构建新增 YouTube 原生模块，修复夹具并同步内置组件技能版本后，相关2项重跑通过；其余12个文件通过。未运行全功能测试。
- 类型检查、生产构建、打包运行验证通过；内置 `efund-ppt-maker 1.1.1` 与 `ework-workbench-components 1.33.0` 和源码一致。
- 标准 App 和 DMG 的 Developer ID 签名通过；标准 ZIP、兼容 ZIP 的压缩完整性和 DMG 的 `hdiutil verify` CRC 通过。
- 兼容桥内外版本均为1.1.0：外层 `io.dsh.desktop` 满足旧证书要求，内嵌 `com.evanarts.sherlock`，ShipIt可执行，Squirrel、Mantle、ReactiveObjC齐全。
- 真实签名客户端主界面、本人原账户和工作区可见；原生关于窗口与设置关于页均显示1.1.0，完整中文更新日志和旧版本历史可见。客户端保持打开。
- 本次按既有用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证验收，签名有效不等于已公证。

### 公开资源与更新入口

- 发布脚本按不可变版本资源、稳定下载别名、双通道元数据顺序完成上传；上传期间两个公开 feed 仍为1.0.6，完成后均为1.1.0。临时上传 Worker 已删除。
- 两条 feed 的版本、资源大小、SHA-512 和中英文各10项更新说明与准备元数据完全一致，均使用 no-cache。
- 两份公开 blockmap 与本地文件摘要一致；版本 ZIP、DMG、旧稳定下载别名、品牌稳定下载地址共15次首段/中段/末段单段 Range 请求均为206，Content-Range、文件总大小及样本字节一致。
- 版本资源缓存为 immutable，稳定下载地址为 no-store；品牌下载地址 HEAD、文件大小和 `EWork-Odyssey-mac-arm64.dmg` 下载文件名通过。
- 品牌稳定地址按25段单段 Range 完整下载415,663,978字节，公开DMG的 SHA-512 与本地签名DMG完全一致，`hdiutil verify` CRC通过。
- 真实1.1.0客户端手动检查更新显示“已是最新版本”，截图 `manual-update-check.png`。这是版本及更新检查验收，未执行旧客户端全量安装升级测试。

### 差分更新与滚动保留

使用真实 electron-updater 差分下载器和公开1.0.6/1.1.0 blockmap，仅允许单段 Range/206。两条通道合成的完整 ZIP 均与本地签名产物 SHA-512 相同，未执行全量回退或旧客户端安装重启升级测试。

| 通道 | 请求数 | 实际下载字节 | 复用字节 | 完整包字节 | SHA-512 |
| --- | ---: | ---: | ---: | ---: | --- |
| 标准 | 776 | 139,681,023 | 361,257,375 | 500,938,398 | 一致 |
| 兼容 | 751 | 189,148,070 | 362,460,415 | 551,608,485 | 一致 |

全部公开验证通过后，按预演精确删除 `releases/v1.0.2/` 的5个对象，逐项公开确认404；1.0.6两份差分基线 blockmap仍为206，两个feed仍为1.1.0。保留版本：1.0.3、1.0.4、1.0.5、1.0.6、1.1.0。

### 源码同步

目标仓库：`https://github.com/awake-ai-lab/sherlock-desktop.git`。本地main包含用户接受的集成提交、干净安装修复、打包验收夹具修复和1.1.0版本日志。发布记录及库存按中文提交单独保存，使用 `git push --atomic origin main:hyf main:main` 同步指定分支，并以 `git ls-remote --heads origin main hyf`核对最终SHA；不推送版本标签。

公开稳定下载：`https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg`。本次平台为macOS Apple Silicon，未构建Intel和Windows。


本地证据目录：`/tmp/ework-release-1.1.0-20261003`。客户端截图：`about-1.1.0.png`。
