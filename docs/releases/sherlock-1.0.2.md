# EWork Odyssey 1.0.2

日期：2026-09-20。平台：macOS Apple Silicon。

## 更新日志

- 优化多人协作画板切换，点击后立即进入画板，加载内容时显示居中的小尺寸圆环提示
- 减少画板重复加载请求，完善加载失败重试与快速切换时的状态处理
- 修复框选边线部分边缘发灰，统一蓝色描边并对齐屏幕像素
- 缩小右侧会话正文与输入框两侧留白，提高窄屏空间利用率
- 修复下载更新并重启后，消息图标旁的下载图标长时间残留

## 发布范围

- 包含本次用户验收通过的画板切换、框选、布局及更新图标修复。
- 按用户要求跳过 Apple 公证及 stapling，保留 Developer ID 与旧版兼容桥签名。
- 更新验证采用双通道公开差分合成与 SHA-512 校验，不执行全量下载或旧客户端安装重启测试。
- 源码同步至既有私有仓库 awake-ai-lab/sherlock-desktop 的 hyf 与 main，不推送版本标签。

## 构建与客户端验证

- 从干净的本地 main 发布提交 `2ca622bc5c275c0a013067a2700fa3aea7245bdf` 构建；正式源码门禁通过，未遗漏未合并分支或未提交工作树改动。
- 14 个测试文件共 152 项聚焦检查、类型检查与生产构建通过；未运行全功能测试。
- 标准 App、DMG 的 Developer ID 签名有效，包内运行时资源检查、DMG CRC、两份 ZIP CRC 通过；主进程及 preload 与本次构建输出逐字节一致。
- 按用户要求显式禁用 notarization，不执行 stapling 或 Gatekeeper 公证验收。
- 兼容桥外层标识 `io.dsh.desktop`，满足旧证书 `8B8FCCFB659D94D5C9A9CE2B735EB0FAE457CC7B` 的指定要求；内嵌 App 标识 `com.evanarts.sherlock`，两层版本均为 1.0.2，ShipIt、Squirrel、Mantle、ReactiveObjC 齐全。
- 真实客户端关于页显示“当前版本 1.0.2”，五项中文更新日志完整显示，随后返回主界面并保持打开。
- 发布前保存并验证 1.0.1 双通道元数据、ZIP、blockmap 和稳定 DMG，可用于差分基线与入口回滚。

## 公开资源验证

- 依次上传 5 个不可变资源、更新稳定 DMG 别名、提升双通道元数据；临时上传 Worker `sherlock-release-upload-07224a67` 已删除。
- 两个公开更新源均返回 1.0.2，中英文日志、文件大小和 SHA-512 与本地签名构建一致。
- 5 个不可变对象的大小和对象摘要匹配，2 份公开 blockmap 逐字节一致；标准 ZIP、兼容 ZIP、DMG 与新旧稳定地址的首部、中部、尾部共 15 次 Range 请求均返回正确的 206、Content-Range 和完整字节。
- 不可变资源具有 immutable 缓存，元数据具有 no-cache 缓存，稳定地址具有 no-store 缓存，品牌下载文件名为 `EWork-Odyssey-mac-arm64.dmg`。
- 兼容通道 1.0.1 → 1.0.2：实际传输 182,125,919 字节，复用 366,221,845 字节，759 次单段 Range 请求；合成 548,347,764 字节，SHA-512 与本地签名构建完全一致，无全量回退。

- 标准通道 1.0.1 → 1.0.2：实际传输 131,824,872 字节，复用 365,102,603 字节，774 次单段 Range 请求；合成 496,927,475 字节，SHA-512 与本地签名构建完全一致，无全量回退。
- 两通道均使用真实公开 blockmap 与单段 Range 验证；未执行旧客户端全量安装重启测试。

## 发布地址

- 标准更新源：https://updates.evanarts.com/notarized/latest/latest-mac.yml
- 兼容更新源：https://updates.evanarts.com/latest/latest-mac.yml
- 稳定安装包：https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg
- 本次为签名但未公证的 macOS Apple Silicon 版本，不包含 Intel 或 Windows 发布。

## 保留策略与源码同步

- 全部适用验证通过后，精确删除 `releases/v0.9.12/` 下 5 个最旧对象，保留 0.9.13、0.9.14、1.0.0、1.0.1、1.0.2；逐项验证删除路径返回 404，双通道继续指向 1.0.2。
- 发布构建提交已通过原子快进推送同步到私有仓库 hyf 和 main；本发布记录与库存清单另行提交，并再次同步两个分支，不推送版本标签。
