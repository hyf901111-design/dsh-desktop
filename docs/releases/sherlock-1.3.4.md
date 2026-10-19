# EWork Odyssey 1.3.4

日期：2026-10-19。平台：macOS Apple Silicon。

## 更新日志

- 对话首页的主题卡片保留入场动效，停留 3 秒后自动收至底部并露出三分之一，鼠标悬停时回弹展开。
- 点击组件底栏的数据来源或更新状态，可直接打开对应组件的“数据与自动更新”设置；已登记多个兼容来源的组件支持下拉切换。
- 自选股、个股行情、市场指数、新闻和公司公告新增可切换的数据来源，支持保存刷新频率和暂停状态。
- 组件底栏同时显示数据源名称与刷新频率或当前状态，更新失败、暂停时也保留来源，悬停显示完整说明并使用小手光标。
- 切换来源或刷新时保留组件布局和交互状态；部分取数失败时继续显示上次有效数据及图表，并保留原有来源和成交量单位。
- 优化数据设置中下拉箭头的间距与深浅主题显示，来源选项只显示来源名称，保留键盘操作和关闭后的焦点恢复。
- 修复启动页被主界面样式覆盖导致白色标志出现在浅色背景上的问题，深浅外观均保持清晰对比并保留启动动效。

## English

- Home theme cards keep their entrance animation, retract to one-third visibility after three seconds, and expand again on hover.
- Click a component footer source or update status to open its Data and Auto-update settings. Components with multiple registered compatible sources can switch between them.
- Add selectable data sources for watchlists, individual stock quotes, market indices, news and company announcements, with saved refresh intervals and pause settings.
- Component footers show the source alongside the refresh interval or current status, retain source names on errors and pauses, and provide full details on hover with a pointer cursor.
- Preserve component layout and interaction state while switching sources or refreshing. Partial fetch failures retain valid previous data and charts, including their source and volume units.
- Refine dropdown arrow spacing and light and dark appearances in data settings. Source options show source names, with keyboard operation and focus restoration preserved.
- Fix desktop shell styles overriding the startup background, keeping the logo readable in light and dark appearances while preserving the startup animation.

## 发布范围与校验边界

- 发布用户已验收的集成批次 20261019-01、20261019-02；OpenTerminal 全看板样式及恢复试用的新批次 20261019-04 均按用户明确选择单独暂存，保留分支、工作目录和验收证据，不纳入本次构建。
- 应用关于页和两条更新通道使用一致的中英文日志，保留历史日志。
- 按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 公证检查；保留 Developer ID、旧兼容证书签名及包完整性检查。
- 仅执行发布与本次功能直接相关的聚焦检查、类型检查和公开差分校验，不执行旧客户端全量升级或安装重启测试。
- GitHub 同步 awake-ai-lab/sherlock-desktop 的 hyf 与 main，不推送版本标签。

## 发布结果

2026-10-19 已完成 Cloudflare R2 双通道发布。标准通道与旧证书兼容通道均返回 `1.3.4`，两条通道、应用关于页和本文的 7 条中文、7 条英文更新日志一致。

- [新版稳定下载地址](https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg)
- [标准通道元数据](https://updates.evanarts.com/notarized/latest/latest-mac.yml)
- [旧证书兼容通道元数据](https://updates.evanarts.com/latest/latest-mac.yml)

`notarized/latest/` 是既有通道路径；本次按用户要求未执行 Apple 公证、stapling 或 Gatekeeper 公证验证。

### 构建来源与排除范围

- 用户验收的运行时代码提交：`04e180efb8b80b843b3caf84db3b54321c4b876b`。
- 打包提交：`6292a3d6f3a13fd8ecacc5d0667d55753ceed4a1`；正式源码预检通过，使用用户已测试的签名应用打包，关键运行模块及启动页资源哈希一致。
- 发布检查点：`8d3a95a694da3011c7f9b108f71df9d0496ebaeb`；相较运行时代码仅补充暂存决策及发布管理记录。
- OpenTerminal 试用批次 `20261019-04` 已按用户选择暂存。保留集成提交 `5cb7169dc8acf477bc5685e0974347ee56a538a7`、功能分支及工作目录；后续未验收样式保存为私有 WIP 提交 `2dc58811d15810802155fcf621ade46c3dde36a3`，未纳入本版运行时代码或发布主干。

### 聚焦验证与签名

- 前序功能与发布相关聚焦测试 111 项通过；启动页修复相关聚焦测试 20 项通过，两组有重叠，不合计为独立测试总数。类型检查通过，未运行全功能测试。
- 启动页回归验证覆盖深浅外观、运行中切换外观及主界面样式保留；真实客户端已核验启动页对比度、主界面、原有会话和关于页版本及日志，修复获用户验收。
- 标准应用标识为 `com.evanarts.sherlock`，Developer ID 身份指纹为 `DDFBC7F4DA5EC49721E454BB06329C6D1E8A7B9F`，签名校验通过。
- 兼容桥外层标识为 `io.dsh.desktop`，满足旧证书固定要求，证书指纹为 `8B8FCCFB659D94D5C9A9CE2B735EB0FAE457CC7B`；内嵌应用为 `com.evanarts.sherlock`，Developer ID 签名及 ShipIt、Squirrel、Mantle、ReactiveObjC 依赖校验通过。
- 标准 ZIP 的 70,540 个条目、兼容 ZIP 的 150,480 个条目均通过 CRC 和关键模块一致性检查。

### 公开资源与差分更新

公开校验覆盖 10 个资源、20 个 Range 样本，版本、长度、SHA-512 关联、blockmap 内容及单段 HTTP 206 均通过。版本资源保持 immutable 缓存，两条更新源保持 no-cache，两个稳定下载地址保持 no-store；新版下载文件名正确。

两条差分均使用真实公开的新旧 blockmap 和实际 electron-updater 下载器，从已校验的 1.3.3 ZIP 复用旧数据，以单段 Range/206 合成 1.3.4 ZIP；未触发全量回退，合成文件 SHA-512 与发布包完全一致。

| 1.3.3 → 1.3.4 | 完整 ZIP 字节数 | 实际传输字节数 | 复用字节数 | 请求数 | SHA-512 校验 |
| --- | ---: | ---: | ---: | ---: | --- |
| 标准通道 | 527,846,914 | 50,459,871 | 477,387,043 | 97 | 通过 |
| 旧证书兼容通道 | 582,678,110 | 82,471,269 | 500,206,841 | 191 | 通过 |

独立 Node 校验进程出现 TLS socket timeout listener 数量警告。源码检查指向 Node 验证传输在复用连接时累积回调；应用更新器使用 ElectronHttpExecutor。未屏蔽警告或修改产品代码，两条差分的完整哈希验证均通过。

公开稳定 DMG 为 435,430,013 字节，完整 SHA-512、代码签名与 `hdiutil verify` 均通过。首次下载连接中断后，先确认已下载前缀与冻结产物逐字节一致，再续传完成校验。

在独立临时配置目录启动相同的已签名应用，真实主界面加载后通过原生菜单执行“检查更新”，日志确认当前版本和最新版本均为 `1.3.4`。该检查未执行旧客户端安装替换或重启升级，不能等同于完整升级验收。

### 滚动保留与发布记录

全部适用发布校验通过后，按预演计划仅删除最早版本 `1.2.2` 的 5 个不可变资源。清理后 14 项检查通过：5 个被删资源返回 404，1.3.4 的 5 个版本资源、2 条更新源及 2 个稳定下载地址保持有效。清单现保留 `1.3.0` 至 `1.3.4`。

本次详细验证记录位于 `/tmp/ework-release-1.3.4-20261019.eaiV3Y`，包含公开资源、签名、两条差分、DMG 完整性、原生更新检查及保留清理报告。GitHub 仅同步发布相关源码与记录，不推送版本标签。
