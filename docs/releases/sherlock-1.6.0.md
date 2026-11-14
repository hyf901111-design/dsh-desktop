# EWork Odyssey 1.6.0

适用于 Apple Silicon Mac。

## 更新内容

- 修复从研究看板切换到浏览器、笔记等页面时，看板底部工具栏或已打开的菜单残留的问题。
- 改善套餐模型运行多步骤表格等长任务时的连接稳定性，减少等待过早超时以及生成完成后误报连接中断的情况。

## Release notes

- Fix a research board toolbar or open menu remaining visible after switching to Browser, Notes, or another page.
- Improve connection reliability for subscription models during long tasks such as multi-step spreadsheet work. Reduce premature timeouts and false interruption messages after a response completes.

## 发布验证

- 构建提交 `498a41b95cecb7882ef91fc6e5845ff579b19c80`。148 项发布与模型测试、84 项看板相关测试、类型检查和构建通过。扩展检查中有 4 项研究预览测试在 1.5.6 基线也失败，涉及组件菜单顺序、连线装饰和组件底部留白。
- Apple 已公证 App 和 DMG。标准 App 与兼容桥内嵌 App 均为 `com.evanarts.sherlock`，兼容桥外层为 `io.dsh.desktop`，保留旧签名及 Squirrel、ShipIt、Mantle 和 ReactiveObjC。签名、数据迁移及 DSH Desktop 共存已验证。
- 套餐模型网关已更新，GLM 5.3 Flash 在生产网关上完成实测请求。
- 两条公开更新源通过 26 项检查，包括稳定下载地址、缓存、单段 HTTP 206 和 blockmap。两条差分路径均从 1.5.6 重建 1.6.0 ZIP，SHA-512 与发布包一致。

| 差分通道 | 新包（字节） | 实际传输（字节） | 复用（字节） | 成功范围请求数 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 899,497,930 | 128,528,824 | 770,969,106 | 1,046 |
| 旧签名兼容 | 976,786,092 | 277,131,524 | 699,654,568 | 1,275 |

- Homebrew Cask 已更新到 1.6.0，Tap 提交 `c7484d2e67294eff3c0de9251abd2abae02c9187`，DMG SHA-256 为 `bb926f56382b399044ad8bdbeb9112a8add2ce68804474574ea52d2efc9d35b4`。
- 滚动清理移除 1.4.3 的 5 个版本资源。

[下载 EWork Odyssey 1.6.0（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.0/sherlock-mac-arm64.dmg)
