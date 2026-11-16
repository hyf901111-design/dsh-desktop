# EWork Odyssey 1.6.4

适用于 Apple Silicon Mac。

## 更新内容

- 检查到新版本时，更新弹窗会直接显示本次更新日志。下载时可点击右上角的箭头展开日志。
- 「重启更新」改为通栏按钮。通过消息中心的「详情」进入关于页时，可查看待更新版本的说明。
- 消息中心采用双行列表，时间和操作右对齐，「全部」和「未读」筛选固定在顶部。修复在内置浏览器上方打开时面板被遮挡、样式丢失的问题。
- 完善单条和全部标记已读的反馈，支持重试加载及协作邀请操作，并显示邀请过期状态。

## Release notes

- The update popover shows what’s new as soon as an update is found. Click the chevron in the top right to expand the notes while downloading.
- Restart to Update now spans the full width of the popover. Open Details from Notification Center to see the target version’s notes in About.
- Notification Center now uses two-line rows with right-aligned timestamps and actions. The All and Unread filters stay at the top while you scroll. The panel keeps its styling and displays fully over the built-in browser.
- Improved feedback for marking one or all notifications as read, retrying failed loads and collaboration actions, and viewing expired invitations.

## 发布验证

- 构建提交 `dc75cb6fa650fec1c553e2db5cd32440e5381fba`。219 项聚焦检查、类型检查及生产构建通过。验证了消息中心在内置浏览器上方的显示与滚动。隔离客户端启动、默认目录迁移及与 DSH Desktop 共存检查通过。
- 标准 App 和 DMG 使用 Developer ID 签名。兼容桥外层为 `io.dsh.desktop`，保留旧签名及 Squirrel、ShipIt、Mantle、ReactiveObjC，内嵌 App 为 `com.evanarts.sherlock`。签名、ZIP 和 DMG 完整性检查通过。按要求跳过 Apple 公证。
- Cloudflare 两条更新源均为 1.6.4，均包含中英文更新日志。公开资源的大小、缓存策略、稳定下载文件名及单段 Range/206 已核验。两份公开 blockmap 与本地发布文件一致。
- 使用 1.6.3 ZIP 分别从两条通道重建 1.6.4，合成结果的 SHA-512 与签名发布包一致。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 899,670,338 | 136,729,121 | 762,941,217 | 1,037 |
| 旧签名兼容 | 976,966,622 | 286,051,032 | 690,915,590 | 1,265 |

- Homebrew Cask 已同步至 1.6.4，Tap 提交 `113afa70728d9b8d4a76f2dc094b2a3ce34726d5`。公开 Cask 与 Homebrew 解析结果一致，DMG SHA-256 为 `b486becb121996384eb1294415ea33a10901fd74c0405325e08d1b83b73dd3d3`。
- 滚动清理移除了 1.5.5 的五个版本资源，1.6.3 的两份 blockmap 和 1.6.4 安装包仍可访问。

[下载 EWork Odyssey 1.6.4（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.6.4/sherlock-mac-arm64.dmg)
