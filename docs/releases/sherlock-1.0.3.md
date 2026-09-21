# EWork Odyssey 1.0.3

日期：2026-09-21。平台：macOS Apple Silicon。

## 更新日志

- 桌面画笔和坐标点击改为目标窗口后台执行，不再主动移动系统鼠标
- 完善后台窗口输入准备，提升窗口失去活动状态后的点击与连续画笔稳定性
- 修复桌面控制空闲一段时间后应用和窗口查询持续失败的问题
- Mac 锁屏或休眠时停止桌面输入，解锁后可继续发起任务
- 改进桌面操作错误提示，并修复成功观察后仍累计连续失败次数的问题

## 发布范围

- 包含用户验收通过的后台桌面操作及会话稳定性修复。
- 保留 Developer ID 和旧版兼容桥签名，按用户要求跳过 Apple 公证与 stapling。
- 验证双通道公开 blockmap、单段 Range/206 与差分合成 SHA-512，不执行旧客户端全量安装重启测试。
- 本地 main 为发布源码，发布相关源码同步到 GitHub hyf；不推送版本标签。

## 构建与客户端验证

- 从干净本地 main 提交 `2c86114351f2` 构建，正式源码门禁通过。
- 12 个测试文件共 114 项聚焦测试、类型检查及生产构建通过，未运行全功能测试。
- 标准 App 与 DMG 签名有效，包内运行时验证、DMG CRC、两份 ZIP CRC 通过；主进程与 preload 和本次构建输出逐字节一致。
- 构建显式设置 `mac.notarize=false`，未执行公证或 stapling。
- 兼容桥外层标识 `io.dsh.desktop`，满足旧证书指定要求；内嵌标识 `com.evanarts.sherlock`，两层版本为 1.0.3，ShipIt、Squirrel、Mantle、ReactiveObjC 齐全。
- 实际启动本次签名客户端，关于页显示“当前版本 1.0.3”，五项中文更新日志完整可见；返回主界面并保持打开。
- 发布前保存 1.0.2 双通道公开元数据与对应 ZIP、blockmap、DMG，已核对旧 ZIP 和 DMG 的大小及 SHA-512 与公开元数据一致。

## 差分验证

- 兼容通道 1.0.2 → 1.0.3：实际传输 177,188,415 字节、复用 371,260,303 字节、764 次单段 Range/206 请求；合成 548,448,718 字节，SHA-512 与签名构建一致，无全量回退。

- 标准通道 1.0.2 → 1.0.3：实际传输 126,913,954 字节、复用 370,081,927 字节、779 次单段 Range/206 请求；合成 496,995,881 字节，SHA-512 与签名构建一致，无全量回退。
- 两通道均使用真实公开 blockmap 和实际 electron-updater 差分下载器，未执行旧客户端全量安装重启测试。

## 公开资源验证

- 依次上传 5 个不可变资源、更新稳定 DMG 别名、提升双通道元数据；临时上传 Worker `sherlock-release-upload-01f85fe5` 已删除。
- 两个公开更新源均返回 1.0.3，中英文更新日志、文件大小及 SHA-512 与本地签名构建一致。
- 5 个不可变对象大小和对象摘要匹配，2 份公开 blockmap 逐字节一致；标准 ZIP、兼容 ZIP、DMG 和新旧稳定下载地址共 15 次首部、中部、尾部 Range 请求均返回正确的 206、Content-Range 和字节内容。
- 不可变资源为 immutable 缓存，元数据为 no-cache，稳定地址为 no-store；品牌下载文件名为 `EWork-Odyssey-mac-arm64.dmg`。

## 发布地址

- 标准更新源：https://updates.evanarts.com/notarized/latest/latest-mac.yml
- 兼容更新源：https://updates.evanarts.com/latest/latest-mac.yml
- 稳定安装包：https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg
- 本次为已签名但未公证的 macOS Apple Silicon 版本，不包含 Intel 或 Windows 发布。

## 保留策略与源码同步

- 全部公开资源与双通道差分验证通过后，精确删除 `releases/v0.9.13/` 下 5 个最旧对象，逐项确认返回 404；保留 0.9.14、1.0.0、1.0.1、1.0.2、1.0.3。
- 清理后双通道再次查询仍为 1.0.3。
- 构建源码提交 `2c86114351f2` 已快进推送至 GitHub `hyf`；发布记录与库存清单另行提交并同步同一分支。本地 main 保留全部发布提交，不推送版本标签。
