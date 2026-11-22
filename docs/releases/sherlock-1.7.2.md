# EWork Odyssey 1.7.2

适用于 Apple Silicon Mac。

## 中文

- 从图像应用打开「探索」后，「自选行情看板」和「白酒龙头研究工作台」都可以直接进入研究应用并继续播放。自选行情看板在实时行情加载时也能完成组件连线。
- 研究看板现在会使用系统代理搜索证券和获取公开行情，修复了配置代理后出现「公开数据源不可用」的问题。
- 播放 PPT 或研究报告制作示例时，返回对话首页会自动收起右侧栏。对话首页和对话模式下，右侧栏不再重复显示「对话」页签。制作 PPT 时，从知识库拖入参考 PDF 后，知识库会保持展开，方便继续查阅。

## English

- Both the Watchlist Dashboard and the Liquor Industry Research Workspace demos now continue into Research when launched from Explore in the image app. The watchlist demo can finish connecting its widgets while live quotes load.
- Research boards now use the system proxy for security searches and public market data. This fixes the “public data source unavailable” message that could appear with a proxy configured.
- The presentation and research report demos now collapse the right sidebar when returning to Chat Home. Chat Home and conversations no longer show a duplicate Chat tab in the sidebar. When creating a presentation, the knowledge library stays open after you drag a reference PDF into the prompt.

## 发布范围

本版提供 macOS Apple Silicon 安装包，并支持标准更新和旧签名兼容更新。

## 发布验证

- 构建提交 `1e0b5343ee230a5c5ddc783eb097a066a7d02181`。259 项发布聚焦检查、类型检查和生产构建通过。验收批次已合并至本地 main。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.7.2 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.7.1 ZIP 与公开版本资源，分别重建两个 1.7.2 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 965,781,364 | 79,598,755 | 886,182,609 | 137 |
| 旧签名兼容 | 1,043,708,984 | 125,839,982 | 917,869,002 | 273 |

- Homebrew Cask 已同步到 1.7.2，Tap 提交 `904123e6bcfcf01652623384e6fede0c89320f82`。公开 Cask 的 DMG SHA-256 为 `63f015f10ed7960944a44a30915292e793dc31e2f479c515f759e29d2b46b636`。
- 滚动清理移除了 1.6.7 的五个版本资源。1.7.1 的两条差分基线均可访问。

[下载 EWork Odyssey 1.7.2（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.7.2/sherlock-mac-arm64.dmg)
