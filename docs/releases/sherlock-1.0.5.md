# EWork Odyssey 1.0.5

日期：2026-09-21。平台：macOS Apple Silicon。

## 更新日志

- 修复组件定时任务关闭右侧栏后露出原面板的问题，重新展开时保留任务设置
- 定时任务页签纳入已打开页签菜单，切换与选中状态保持一致
- 对话页签新增图标，页签宽度贴合内容，拥挤时优先显示当前页签并缩略其他文字
- 保持页签图标尺寸，仅选中的可关闭页签显示关闭按钮
- 优化协作成员弹层背景与阴影，减少头像下方的残影色块

## 发布范围

- 发布用户已验收的右侧栏、页签和协作成员弹层优化。
- 保留 Developer ID 与旧版兼容桥签名，按用户要求跳过 Apple 公证与 stapling。
- 验证双通道公开资源、Range/206 与差分合成 SHA-512，不执行旧客户端全量安装重启测试。
- 从干净本地 main 构建，同步 GitHub hyf、main，不推送版本标签。

## 构建与客户端验证

- 用户验收的集成批次 `20260921-05` 已晋升本地 main；正式构建提交为 `1b5bf39ca82b2a42b2f3e397157251dab03475b6`。构建前全部 worktree 干净，本地功能分支已合入 main。
- 12 个测试文件共 83 项聚焦检查、类型检查及构建通过，未运行全功能测试。
- App、DMG 签名验证通过，DMG CRC 和两份 ZIP CRC 通过；包内主程序、preload 与构建输出逐字节一致。
- 兼容桥外层标识 `io.dsh.desktop`、内嵌标准 App 标识 `com.evanarts.sherlock`，两层版本均为 1.0.5；旧证书指定要求验证通过，ShipIt、Squirrel、Mantle、ReactiveObjC 齐全。
- 明确设置 `mac.notarize=false`，未运行 Apple 公证、stapling 或声称通过公证 Gatekeeper 验收。
- 实际启动签名客户端，关于页显示当前版本 1.0.5 和五项中文更新日志。发布后手动检查更新返回“已是最新版本”，正常工作区、账户与会话可见，主界面保持打开。

## 公开资源验证

- 已保存并核对 1.0.4 双通道元数据、ZIP、blockmap 和 DMG，旧包大小与 SHA-512 匹配公开元数据。
- 按顺序上传五个不可变资源、更新稳定 DMG、提升双通道元数据；临时上传 Worker 已删除。
- 两条更新源均为 1.0.5，中英文更新日志、文件大小和 SHA-512 与本地签名构建一致。
- 公开 blockmap 逐字节一致；ZIP、DMG、新旧稳定地址的首部、中部、尾部共 15 次 Range 请求均返回正确的 206、Content-Range 和字节内容。
- 不可变资源采用 immutable 缓存，元数据 no-cache，稳定安装包 no-store。
- 从公开稳定下载地址完整获取 DMG（单段 Range 并发下载），与本地签名 DMG 逐字节一致，CRC 验证通过。
- 兼容通道 1.0.4 → 1.0.5：实际传输 185,472,902 字节，复用 362,994,332 字节，762 次单段 Range/206 请求；重建 548,467,234 字节，SHA-512 与签名构建一致。
- 标准通道 1.0.4 → 1.0.5：实际传输 134,991,834 字节，复用 362,019,921 字节，804 次单段 Range/206 请求；重建 497,011,755 字节，SHA-512 与签名构建一致。
- 差分校验使用真实公开 blockmap 和 electron-updater 下载器，没有全量回退，也未执行旧客户端全量安装重启测试。

## 发布地址

- 标准更新源：https://updates.evanarts.com/notarized/latest/latest-mac.yml
- 兼容更新源：https://updates.evanarts.com/latest/latest-mac.yml
- 稳定安装包：https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg
- 本次为已签名但未公证的 macOS Apple Silicon 版本，不包含 Intel 或 Windows 发布。

## 保留策略与源码同步

- 所有公开资源、完整 DMG 和双通道差分验证通过后，仅精确删除 `releases/v1.0.0/` 下五个对象，并确认逐项返回 404；保留 1.0.1 至 1.0.5。
- 清理后两条公开更新源再次查询均为 1.0.5。
- 已验收代码和发布构建提交已同步 GitHub `hyf`、`main`；发布记录、库存清单随收尾提交同步，不推送版本标签。
