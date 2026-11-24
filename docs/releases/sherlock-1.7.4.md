# EWork Odyssey 1.7.4

适用于 Apple Silicon Mac。

## 中文

- 搜索会话按钮左侧新增视图切换。可以按目录浏览，也可以把最近使用的会话放在同一个列表里。重启客户端后会记住上次的视图和访问顺序。
- 收起侧栏后，主页悬停面板会跟随所选视图，显示当前会话和运行指示。在目录视图里可以直接展开「个人看板」和「协作看板」。
- 首次安装后，从「个人看板」打开「自选研究看板」即可查看行情。看板预填 5 只股票和 2 个指数，自选列表与行情、新闻和公告联动。可以编辑或删除看板，删除后重启也不会重新出现。
- 新建或调整 PowerPoint 时，会按内容关系安排图表、时间线和正文。优化已有演示时会复用可编辑对象、检查各页布局，并保留状态配色。生成完成后可从对话里的文件卡片打开成品。
- 客户端新开窗口时进入主页。刷新当前窗口时保留正在使用的会话，修复启动时意外跳到表格应用的问题。
- 点击消息中心以外的区域即可关闭菜单，包括嵌入的演示编辑器。知识库的文件夹加号已与计数标签对齐。
- 图像应用恢复画布宽高比的选项现称为「原比例」。行情看板的公告组件可以单独切换公司，选择指数时会提示暂无公司公告。

## English

- Use the button to the left of Search to switch between folders and a single list of recently used conversations. The app remembers your view and visit order across restarts.
- Hover over Home in the collapsed sidebar to see the same view, including the current conversation and its running indicator. Folder view gives direct access to personal and shared boards.
- New installations include a Watchlist Research Board under Personal Boards. It starts with five stocks and two indices and links the selected instrument to its chart, news, and announcements. You can edit or delete the board. Deleting it persists across restarts.
- PowerPoint creation and layout editing now arrange charts, timelines, and text according to their relationships. When refining an existing deck, the app reuses editable objects, checks each slide, and preserves status colors. Open the finished presentation from its file card in the conversation.
- New windows open on Home. Reloading an existing window keeps the current conversation. This fixes an unexpected switch to Spreadsheets at startup.
- Click outside Notification Center to dismiss it, including inside the embedded presentation editor. The add-folder button in the knowledge library now aligns with the count badges.
- The image app labels its original canvas aspect ratio option “原比例” in Chinese. You can switch companies directly in the announcements widget. Selecting an index shows that company announcements are unavailable.

## 发布范围

本版提供 macOS Apple Silicon 安装包、标准更新和旧签名兼容更新。安装包使用 Developer ID 签名，本次跳过 Apple 公证。

## 发布验证

- 构建提交 `fdb0e8632602521c99f703828b6cf06bf932b269`。226 项发布和相关功能检查、类型检查和生产构建通过。验收批次已合并至本地 main。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.7.4 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.7.3 ZIP 与公开版本资源，分别重建两个 1.7.4 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 1,031,087,042 | 100,940,371 | 930,146,671 | 255 |
| 旧签名兼容 | 1,114,255,028 | 150,571,597 | 963,683,431 | 395 |

- Homebrew Cask 已同步到 1.7.4，Tap 提交 `3612f6c7bba4bf922ae682f63a89463956ce2c05`。公开 Cask 的 DMG SHA-256 为 `918629d9bb7c03fcdea5ed51fd28a7a2e4feede4c55ede41003e483947c30caf`。
- 滚动清理移除了 1.6.9 的五个版本资源。1.7.3 的两条差分基线均可访问。

[下载 EWork Odyssey 1.7.4（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.7.4/sherlock-mac-arm64.dmg)
