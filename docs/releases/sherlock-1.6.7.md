# EWork Odyssey 1.6.7

适用于 Apple Silicon Mac。

## 中文

- 创建研究看板后会先收到需求拆解，再看到取数、生成组件和刷新结果的阶段进展。行情、汇率和主题新闻优先复用可定时更新的数据源。

- 期货日报可切换品种，按栏目查看期限结构、持仓分布、合约明细和排行。汇率看板提供趋势和逐日明细，科技早报合并重复报道并链接原文。

- 预算试算和方案对比可生成独立网页。直接在看板里修改人数或费用即可重算，也可导出网页。网页跟随易方达、浅色、深色和彭博四种主题，整理画布时按正文高度排版。

- 修复研究组件页签点击无响应，以及对话首页已选项目时顶栏缺失、首次点击斜杠菜单无响应的问题。自动整理会为图表读数、明细和来源栏留出间距。

- 图像画布支持右键编组、整体缩放和导出选中的图层，工具栏可切换画布比例。编辑器底栏与顶栏同色，图层和品牌资产侧栏的分隔线与标题对齐。

- 消息入口和消息列表以圆点提示未读状态。内置浏览器右侧的斜杠子菜单可独立滚动，修复了菜单透出网页内容的问题。

## English

- Research boards now acknowledge a request with a breakdown, then report progress as data arrives, components are built and refreshes finish. Market, exchange-rate and news boards use sources that support scheduled updates where available.

- Switch products in the futures daily report to explore the term structure, open interest, contract details and rankings. Exchange-rate boards show trends and daily figures. The tech briefing groups duplicate coverage and links to the original articles.

- Budget calculators and comparison tools can open as standalone webpages on the board. Edit headcounts or costs to recalculate, or export the page. Pages follow the E Fund, Light, Dark and Bloomberg themes and fit their content height when arranged.

- Fixed unresponsive research component tabs and a missing toolbar or unresponsive first slash-menu click on the home screen after selecting a project. Arranging a board now leaves room for chart readings, details and sources.

- Right-click selected image layers to group, resize together or export them. Change the canvas aspect ratio from the toolbar. The editor footer matches the toolbar, and the Layers and Brand Assets dividers align with their headings.

- Unread dots now appear in the notification entry and message list. Slash-command submenus in the built-in browser scroll independently and cover the webpage beneath them.

## 发布验证

- 构建提交 `babb5a5c25d7256bafd9a5e43d770b0df8026c87`。320 项聚焦检查、类型检查和生产构建通过。正式包在隔离配置中成功打开对话首页，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 已使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验签名、两个 ZIP、DMG 及其中的 App。按要求跳过 Apple 公证。
- 两个公开更新源均提供 1.6.7 和中英文更新日志。已核验版本资源与稳定下载地址的缓存策略、文件名、单段 Range 响应和 blockmap。
- 从线上前一版 1.6.5 的缓存分别重建两个 1.6.7 ZIP。两份合成文件的 SHA-512 均与签名发布包一致。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 934,334,832 | 93,212,117 | 841,122,715 | 176 |
| 旧签名兼容 | 1,011,812,891 | 137,015,322 | 874,797,569 | 280 |

- Homebrew Cask 已同步到 1.6.7，Tap 提交 `b1238db5aba7ac15591054e63c8e32804ebd5c6d`，公开 Cask 的 DMG SHA-256 为 `5fd95bfd24a739951c3dd157043a7f68d1f5de88301ed7673568770dff82a7e8`。
- 滚动清理移除了 1.6.0 的五个版本资源，1.6.5 的差分基线仍可访问。

[下载 EWork Odyssey 1.6.7（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.7/sherlock-mac-arm64.dmg)
