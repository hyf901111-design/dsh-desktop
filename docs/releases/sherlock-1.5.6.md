# EWork Odyssey 1.5.6

适用于 Apple Silicon Mac。标准安装包以 Developer ID 签名，旧版兼容桥沿用原签名。本次按发布要求跳过 Apple 公证。

## 更新内容

- 新增表格模式。可创建工作簿、导入 Excel 或 CSV，使用公式、筛选、排序和去重，支持键盘撤销与重做。
- 表格右侧对话提供可比估值、数据去重和现金流预测快捷用例，结果可直接写入当前工作簿。
- 可根据选区创建图表和智能组件。组件可停靠在可调宽的侧栏，也可放在工作表中随页面滚动。图表默认使用易方达配色。
- 修复切换账号后首次使用套餐模型时偶发的登录失效提示。切换访问权限后，新对话会继承当前设置。

## Release notes

- Spreadsheet mode lets you create workbooks, import Excel or CSV files, use formulas, filter and sort data, remove duplicates, and undo or redo changes with keyboard shortcuts.
- Spreadsheet chat offers shortcuts for comparable-company valuation, deduplication, and cash flow forecasts. Results can be written directly to the active workbook.
- Create charts and AI components from selected cells. Dock components in the resizable sidebar or place them on the sheet so they scroll with it. Charts use the E Fund palette by default.
- Fix an intermittent sign-in error on the first request to a hosted model after switching accounts. New conversations inherit the selected access mode.

## 发布验证


- 正式构建提交 `3cd9b92f3037aad7a8dd0c6728595ef094d79b41` 包含表格模式 `eeb8c9c6e` 与账户切换修复 `6695040c6`。
- 185 项聚焦测试、类型检查、表格交互检查和本地构建通过。标准 App、DMG、旧版迁移包及其内嵌 App 均通过签名和包完整性检查。
- 两条 Cloudflare 更新源和下载入口通过 26 项公开检查，覆盖缓存、单段 HTTP 206 和 blockmap。
- 通过公开 blockmap 和单段 Range 从 1.5.5 重建两个 1.5.6 ZIP，SHA-512 与发布包一致。本次升级校验采用差分重建。

| 差分通道 | 新包（字节） | 实际传输（字节） | 复用（字节） | 成功范围请求数 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 899,491,947 | 119,020,560 | 780,471,387 | 249 |
| 旧签名兼容 | 976,777,417 | 167,278,718 | 809,498,699 | 332 |

- Homebrew Cask 已更新到 1.5.6，Tap 提交 `816dce58bdf4e4322c5008db28d1ede8c2d630f7`，DMG SHA-256 为 `e96cbad459b19066592ccf0b599feb4afe219f145cfa9d1eb5a2ced0341bf03a`。
- 滚动清理移除 1.4.2 的 5 个版本资源。

[下载 EWork Odyssey 1.5.6（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.5.6/sherlock-mac-arm64.dmg)
