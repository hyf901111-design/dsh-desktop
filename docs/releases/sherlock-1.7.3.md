# EWork Odyssey 1.7.3

适用于 Apple Silicon Mac。

## 中文

- 客户端内置 Python、Node.js、文件搜索工具及常用办公和数据分析库。在新 Mac 上，读写 Word、Excel、PowerPoint 和处理常见表格数据时，无需先安装开发环境。
- 可以把右侧知识库的文件直接拖到当前应用。Excel 和 CSV 可在表格中打开，笔记支持在段落中插入文件，演示和研究看板也可接收适用的文件。
- 在浏览器右侧打开「完整表格」后，可以在原网页上方滚动查看表格。动态网页更新时，发送对话更稳定。修复了 Mac 跨屏拖动窗口时可能出现的主进程错误。
- 左栏收起后，悬停主页按钮即可切换会话。浮层紧贴左栏、使用圆角和磨砂背景，随深浅主题切换，各工作区可单独折叠。在网页上悬停时，面板也能保持展开。
- 运行中发送的排队消息会立即出现在排队列表中。改进了模型连接中断和工具调用格式异常时的任务恢复，减少工具标记混入回复的情况。工作台续作时会保留原任务和附件。
- 笔记支持从空格菜单插入本地图片，也可以通过对话为正文生成配图。改进了图像画布恢复原比例、底图选择和发送反馈，修复了切换应用后演示示例草稿进入错误会话的问题。
- 消息中心支持提交带图的问题反馈。研究看板改进了分组统计和历史卡片的复核，修复了行情演示直连时苹果股票和美股指数的走势显示。

## English

- The Mac app now includes Python, Node.js, file search, and commonly used Office and data libraries. A fresh Mac can read and write Word, Excel, and PowerPoint files and process tabular data without installing developer tools first.
- Drag files from the knowledge library into the active app. Open Excel and CSV files in Spreadsheets, insert a file into a note paragraph, or drop supported files into Presentations and Research boards.
- Open a full table from browser chat and scroll it above the original webpage. Chat submission handles changing pages more reliably. Moving a window between Mac displays no longer triggers the reported main-process error.
- Hover over Home in the collapsed sidebar to switch conversations. The rounded, frosted panel sits flush with the sidebar, follows the light or dark theme, and stays open over webpages. Each workspace can be collapsed separately.
- Queued messages appear as soon as they are sent. Tasks can recover from more connection interruptions and malformed tool calls, reducing cases where tool markup appears in a reply. Continuing a workbench task retains its request and attachments.
- Insert a local image from the note editor’s space menu, or ask chat to illustrate a note. Image editing has improved aspect-ratio restoration, background selection, and send feedback. Presentation demo drafts now stay with the intended conversation when switching apps.
- Submit feedback with images in the message center. Research boards handle grouped statistics and historical cards more reliably. Direct-market demos show corrected Apple stock and US index trends.

## 发布范围

本版提供 macOS Apple Silicon 安装包、标准更新和旧签名兼容更新。安装包使用 Developer ID 签名，本次跳过 Apple 公证。

## 发布验证

- 构建提交 `ccc9380942977c0e06a71277658586d5406e5e05`。281 项发布和相关功能检查、类型检查和生产构建通过。验收批次已合并至本地 main。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 已在仅含系统工具的任务环境中验证随包解释器、文件搜索、Office 文件读写和数据处理。问题反馈服务及图片存储迁移已部署。
- 两个公开更新源均提供 1.7.3 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.7.2 ZIP 与公开版本资源，分别重建两个 1.7.3 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 1,031,033,227 | 156,551,478 | 874,481,749 | 176 |
| 旧签名兼容 | 1,114,192,447 | 208,152,904 | 906,039,543 | 309 |

- Homebrew Cask 已同步到 1.7.3，Tap 提交 `6af0646d3145f83731b572c952ab5e9c149105c8`。公开 Cask 的 DMG SHA-256 为 `32841f11893496db86caedf06f60f676f54ada0ff970b5665ef0cf63fcfb939c`。
- 滚动清理移除了 1.6.8 的五个版本资源。1.7.2 的两条差分基线均可访问。

[下载 EWork Odyssey 1.7.3（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.7.3/sherlock-mac-arm64.dmg)
