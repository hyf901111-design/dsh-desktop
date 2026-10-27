# Homebrew 分发

用户已选择通过 Homebrew 安装和升级 EWork Odyssey，并要求执行时自行处理常规选择。

- 使用独立公开仓库 `awake-ai-lab/homebrew-tap`，不公开私有客户端源码。
- Cask 名称 `ework-odyssey`，安装 `EWork Odyssey.app`；首期限定 Apple Silicon、macOS 12 及以上，与现有正式包一致。
- 复用已发布的 Cloudflare `releases/v<version>/sherlock-mac-arm64.dmg`。固定版本和 SHA-256，不使用可变下载别名或 `sha256 :no_check`。
- 保留客户端内更新，Cask 声明 `auto_updates true`，文档使用显式指定名称的 `brew upgrade --cask ework-odyssey`。
- 更新工具从签名、公证后的最终 DMG 计算校验值，与线上正式 feed 的版本、SHA-512、文件大小以及版本资源 HEAD 核对后才写入 Cask；拒绝降级、同版本换包或发布失败时推进软件源。
- 工具只生成本地 Cask。审核、中文提交和推送软件源列入正式发布手册，不在 R2 上传途中自动发布 Cask。
- 对比方案：自有 Tap 可立即维护；进入 Homebrew 官方 Cask 涉及社区审核，后续再考虑；直接下载脚本不能提供标准 brew 管理，因此不采用。
- 本次复用线上 1.4.0，不重新构建客户端、不变更版本、不替换共享应用，不运行全功能测试。
- 验证：工具的失败保护、Homebrew 解析和审查、公开资源 HEAD/Range、独立目录安装。不得把配置验证表述为跨版本升级验收。
