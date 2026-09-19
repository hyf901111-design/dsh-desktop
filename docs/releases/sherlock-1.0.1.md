# EWork Odyssey 1.0.1

日期：2026-09-19。平台：macOS Apple Silicon。

## 更新日志

- 修复左侧栏看板区与工作区标题遮罩漏缝，滚动时完整遮挡标题下方文字，保留柔和渐隐效果
- 客户端宽度低于1280像素时，新建看板或进入研究模式自动收起左侧栏；手动展开后切换看板或模式保持展开

## 发布范围

- 包含用户验收通过的侧栏遮罩修复和研究模式自动收起行为。
- 按用户要求跳过 Apple 公证及 stapling，保留 Developer ID 与旧版兼容桥签名。
- 仅运行发布聚焦检查及两项侧栏改动的直接相关检查，更新验证采用双通道公开差分合成，不运行旧客户端全量安装重启测试。
- 源码同步至既有私有仓库 awake-ai-lab/sherlock-desktop 的 hyf 与 main，不推送版本标签。

## 构建与本地验证

- 从干净的本地 main 提交 `411c92280ad1` 构建；发布前正式源码门禁通过。已将该提交以快进方式同步到 GitHub 私有仓库的 hyf 与 main。
- 15 个测试文件共 102 项聚焦检查通过，类型检查与生产构建通过；未运行全功能测试。
- 标准 App 与 DMG 使用 Developer ID 签名，App 深度签名及包内运行时资源检查、DMG 签名与 CRC、两份 ZIP CRC 均通过。按用户明确要求关闭 notarization，不执行 stapling 或 Gatekeeper 公证验收。
- 包内主进程及 preload 与本次构建输出逐字节一致；中英文 1.0.1 更新日志均进入安装包。在真实客户端主界面进入关于页，确认当前版本为 1.0.1，两条中文更新日志完整显示，随后返回主界面。
- 兼容桥外层标识为 `io.dsh.desktop`，满足旧证书 `8B8FCCFB659D94D5C9A9CE2B735EB0FAE457CC7B` 的指定要求；内嵌 App 标识为 `com.evanarts.sherlock`，两层版本均为 1.0.1。ShipIt、Squirrel、Mantle、ReactiveObjC 齐全。
- 发布前保存 1.0.0 的双通道元数据、ZIP、blockmap 和稳定 DMG；旧 ZIP 与线上 SHA-512、稳定 DMG 与线上对象摘要匹配。

## 公开资源验证

- 按顺序上传 5 个不可变资源、更新稳定 DMG 别名、提升双通道元数据，临时上传 Worker `sherlock-release-upload-f4353b17` 已删除。
- 标准与兼容更新源均返回 1.0.1，并包含正确的中英文更新日志；元数据中的文件大小和 SHA-512 与本地签名构建一致。
- 5 个不可变对象的大小和 R2 对象摘要与本地一致，2 份公开 blockmap 逐字节一致。标准 ZIP、兼容 ZIP、DMG 以及新旧两个稳定下载地址的首部、中部、尾部共 15 次 Range 请求均返回精确的 256 字节与正确的 206/Content-Range。
- 不可变资源具有 immutable 缓存，更新源具有 no-cache 缓存，稳定地址具有 no-store 缓存；新稳定地址下载文件名为 `EWork-Odyssey-mac-arm64.dmg`。
- 兼容通道 1.0.0 → 1.0.1：实际传输 185,473,996 字节，复用 362,872,404 字节，762 次单段 Range 请求；重组 548,346,400 字节，SHA-512 与本地签名构建完全一致。
- 标准通道首次差分在最后一个 11,479,330 字节的 Range 传输中遇到服务器中断连接，立即停止，未全量回退；单独请求该完整范围后，其 Content-Range 与全部字节均与本地构建一致。随后使用新的输出文件重新执行完整差分校验。
- 标准通道重跑通过：1.0.0 → 1.0.1 实际传输 135,092,701 字节，复用 361,833,538 字节，792 次单段 Range 请求；重组 496,926,239 字节，SHA-512 与本地签名构建完全一致。两条通道均未进行全量回退或旧客户端安装重启测试。

## 发布地址

- 标准更新源：https://updates.evanarts.com/notarized/latest/latest-mac.yml
- 兼容更新源：https://updates.evanarts.com/latest/latest-mac.yml
- 稳定安装包：https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg
- 本次为签名但未公证的 macOS Apple Silicon 版本，不包含 Intel 或 Windows 发布。

## 保留策略与源码同步

- 全部适用验证成功后，精确删除最旧的 `releases/v0.9.11/` 下 5 个对象，保留 0.9.12、0.9.13、0.9.14、1.0.0 和 1.0.1；删除路径均重新探测为 404，双通道仍指向 1.0.1。
- 发布验收记录和 R2 库存清单单独提交，继续快进同步到私有仓库 hyf 与 main，不推送任何版本标签。
