# Sherlock 0.9.0

日期：2026-09-08。平台：macOS Apple Silicon。

## 更新日志

- 新增构建模式，自动拆解研究工作台并并发生成独立组件；简单问答仍在对话中完成。
- 组件预设小、中、大三种规格，提前规划内容与尺寸，整理画布时统一同行大小并整齐排列。
- 组件框按约 0.5 秒间隔依次出现，后台生成任务保持并发。
- 生成进度展示真实检索主题与子任务回报，并补充当前任务说明和页面构建步骤。
- 修复搜索权限误判、重复生成和重试提交失败，限制无效检索循环并如实提示数据缺失。
- 优化连接中断、超时和限流提示，保留重试过程并减少不必要的生成内容。

按用户要求跳过 Apple 公证与 stapling，保留双通道签名、安装包完整性和公开差分更新验证。

构建模式和组件修复已由用户在本地签名客户端验收；集成批次 20260908-01 已完成正式交接与晋升。

## 发布验证

- 正式构建来源：干净的本地 main，提交 `ccdaf5296c43f98c9e0575ea4b661ce41cde4e5b`。GitHub 私有仓库 `awake-ai-lab/sherlock-desktop` 的 hyf、main 已同步该构建提交。
- 发布、关于页和研究生成相关聚焦检查：13 个文件、178 项通过；TypeScript 类型检查和构建通过。未运行全功能测试。
- 标准 App 和 DMG 的 Developer ID 签名与包运行依赖通过。兼容桥外层 `io.dsh.desktop` 满足旧证书要求，内嵌 App 为 `com.evanarts.sherlock`，ShipIt、Squirrel、Mantle、ReactiveObjC 齐备。
- 正式签名 App 的真实主界面启动正常，关于页面显示 0.9.0 和六项中文更新日志。
- 隔离默认目录迁移确认复制旧数据、不覆盖目标设置并创建迁移标记。DSH 与 Sherlock 同时运行，实际数据目录不同，两份专用哨兵值保持不变；测试哨兵与额外进程已清理。
- Cloudflare 按版本产物、稳定下载、元数据顺序发布。8 个公开对象的状态、大小、缓存策略、首尾单段 Range / 206 字节及元数据一致性通过，临时上传 Worker 已删除。
- 从公开地址重新下载的 DMG 与本地签名产物 SHA-512 相同，DMG 完整性、签名和其中 App 的版本、Bundle ID、深度签名验证通过。
- 按要求未进行 Apple 公证、stapling 或 Gatekeeper 公证验证。通道目录名 notarized 不代表本次进行了公证。
- 证据目录：`/tmp/sherlock-release-0.9.0`。

## 公开差分验证（0.8.9 → 0.9.0）

实际使用 electron-updater 的 GenericDifferentialDownloader，通过公开新旧 blockmap 与单段 Range / 206 重建 ZIP，禁止全量回退。未执行旧客户端完整安装或重启升级测试。

| 通道 | 完整 ZIP 字节 | 实际下载字节 | 复用字节 | 请求数 | SHA-512 |
| --- | ---: | ---: | ---: | ---: | --- |
| 标准 | 406046938 | 104101948 | 301944990 | 742 | `U207raSp5wGT3+hyFcT1mpYaOfTeVx2PLmQixlO4rOceB8GBV1q92M3UWKgzW7prClQfCMabHKCqPx6nltKSOA==` |
| 兼容 | 453102737 | 151133608 | 301969129 | 724 | `ORUYi4VmGooNKOrnnhPtJ28quCjZ42YZkgBCEMF+Kjl9tjzBI+kIuOGKJtk0BuNIlK3tKBjoFdswZpl+t5UTig==` |

两个通道的重建 ZIP 均与本地签名构建产物的 SHA-512 完全一致。

## 保留策略

全部公开验证通过后，仅删除最旧的 0.8.5 版本目录内五个对象。保留 0.8.6–0.9.0，当前双通道元数据、稳定下载及 0.8.9 差分基线均保留。
