# EWork Odyssey 的 Homebrew 分发

软件源为公开仓库 [awake-ai-lab/homebrew-tap](https://github.com/awake-ai-lab/homebrew-tap)，与私有客户端源码分离。首期支持 Apple Silicon Mac、macOS 12 Monterey 或更新系统。

## 安装与升级

```bash
brew tap awake-ai-lab/tap
brew install --cask ework-odyssey

brew update
brew upgrade --cask ework-odyssey
```

安装位置为 `/Applications/EWork Odyssey.app`。客户端内更新仍可使用；因为 Cask 声明 `auto_updates true`，日常无参数 `brew upgrade` 可能跳过它，更新时显式指定上述名称。Homebrew 升级使用完整 DMG，客户端内更新仍可使用现有差分机制。升级前退出客户端。

若之前已手动安装，先退出客户端、备份并将原 `/Applications/EWork Odyssey.app` 移到其他目录，再执行安装命令。不要使用 `--force` 强行覆盖；也不要使用 `--adopt`，因为对声明自动更新的应用，Homebrew 可能跳过版本/内容比较，把旧应用登记为新版而不替换文件。不要删除 `~/Library/Application Support` 中的客户端数据。

卸载使用 `brew uninstall --cask ework-odyssey`。Cask 不提供清理用户数据的 `zap` 操作。

## 后续版本同步

完成正式发布手册的公开验证、签名和包完整性检查后，再更新 Tap。不得在 R2 上传或 feed 提升前更新 Cask。生成工具只读取正式 feed 和版本资源，不构建客户端、不写公开 feed、不推送任何仓库。

```bash
brew tap awake-ai-lab/tap
ework_brew_tap="$(brew --repository awake-ai-lab/tap)"
# 先确认此 checkout 工作区干净，再执行下列同步。
git -C "$ework_brew_tap" pull --ff-only

node scripts/update-homebrew-cask.mjs \
  --version 1.4.0 \
  --dmg dist-release/sherlock-mac-arm64.dmg \
  --tap "$ework_brew_tap"

brew style "$ework_brew_tap/Casks/ework-odyssey.rb"
brew audit --cask awake-ai-lab/tap/ework-odyssey
git -C "$ework_brew_tap" diff -- Casks/ework-odyssey.rb
git -C "$ework_brew_tap" add Casks/ework-odyssey.rb
git -C "$ework_brew_tap" commit -m "发布：更新 EWork Odyssey 至 1.4.0"
git -C "$ework_brew_tap" push origin main
```

版本号替换为本次已发布版本。DMG 必须是签名、公证、staple 后的最终文件。工具流式计算 SHA-256 和 SHA-512；核对线上版本、feed 中固定 DMG URL、SHA-512、大小以及版本资源 HEAD 后原子写入 Cask，拒绝降级和同版本换包。命令失败不改现有 Cask。更新时同时提交版本、SHA-256，保留固定版本 URL。发布 Cask 后用 `brew update`、`brew info --cask awake-ai-lab/tap/ework-odyssey` 核对版本；不要把这些检查称为已完成跨版本安装升级。

若 Cloudflare 发布后回滚，停止 Tap 提升；若 Tap 已推进，立即回退该 Cask 提交，使其重新指向已验证版本，并记录回滚原因。不要重打同版本不同字节的包。R2 清理前应确认 Tap 当前版本对应的 DMG 不在删除清单中。
