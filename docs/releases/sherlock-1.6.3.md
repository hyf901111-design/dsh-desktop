# EWork Odyssey 1.6.3

适用于 Apple Silicon Mac。

## 更新内容

- 探索页新增「复杂表格简单处理」演示。跟随光标新建表格、导入 Excel、用 AI 去重和计算同比，再框选数据生成趋势图与现金流拆解台。
- 在现金流拆解台中，点击瀑布图的柱子可查看调整明细，拖动滑轨可试算回款对现金流和现金转化率的影响。通过组件的「更多」菜单切换易方达主题。
- 知识库新增「我的研究」「我的笔记」「我的表格」分类名称。点击条目会进入对应模式，「所有文件」统计包含这三类内容，计数标签右对齐并随数字长度伸缩。
- 统一研究、笔记和表格输入框中引用当前内容的按钮位置，优化收起侧栏时的知识库图标对齐。

## Release notes

- Try the new spreadsheet walkthrough in Explore. Follow the cursor to create a workbook, import Excel data, use AI to remove duplicates and calculate year-over-year changes, then select cells to build a trend chart and a cash flow bridge.
- Click a waterfall bar for adjustment details and drag the slider to see how collections affect cash flow and cash conversion. The component's More menu lets you apply the E Fund theme.
- The Knowledge Base groups sessions under My Research, My Notes, and My Spreadsheets. Entries open in their corresponding modes, All Files includes these sessions in its total, and count badges resize with their digits and align to the right.
- Context buttons now sit in the same place in the Research, Notes, and Spreadsheet composers. The Knowledge Base icon is centered in the collapsed sidebar.

## 发布验证

- 构建提交 `411813725af2b527bb35c42103ff18acdcd9408b`。168 项聚焦检查、类型检查与生产构建通过。隔离启动的客户端显示版本 1.6.3。
- 标准 App 和 DMG 使用 Developer ID 签名。兼容桥保留 `io.dsh.desktop` 和旧签名，内嵌应用为 `com.evanarts.sherlock`。签名、ZIP 和 DMG 完整性检查通过。本次按要求跳过 Apple 公证。
- Cloudflare 两条更新源均为 1.6.3。公开资源及稳定下载地址通过缓存、文件大小和单段 Range/206 核验。两份公开 blockmap 与本地逐字节一致。
- 两条差分通道均用 1.6.1 重建 1.6.3 ZIP，SHA-512 与签名发布包一致。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 899,665,349 | 81,633,517 | 818,031,832 | 136 |
| 旧签名兼容 | 976,962,709 | 125,655,812 | 851,306,897 | 241 |

- Homebrew Cask 已同步至 1.6.3，Tap 提交 `c11ff9fe761ac8cc03aa83fe446cead77e5d38a4`。已核对公开 Cask 和 Homebrew 解析结果，DMG SHA-256 为 `80e043a5373853287045deeb6e38194881c85acc6f341c8e1d174b22ef58976c`。
- 滚动清理仅移除 1.5.1 的五个版本资源。1.6.1 的两份 blockmap 和 1.6.3 安装包可访问。

[下载 EWork Odyssey 1.6.3（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.3/sherlock-mac-arm64.dmg)
