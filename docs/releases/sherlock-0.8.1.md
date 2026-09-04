# Sherlock 0.8.1 发布记录

日期：2026-09-04。平台：macOS Apple Silicon。

## 来源与版本内容

- 用户已完成本轮研究画布改动验收，并明确要求向现有用户发布 0.8.1；本次同时明确要求不进行 Apple 公证，也不做老版本客户端升级验证。
- 正式客户端构建提交：`c19fe23c81f32f82ff009f1a82c21819a876f861`；正式构建前本地 `main` 干净，版本为 0.8.1。
- 修复客户端重启后，新研究画板首次拖入 PDF、PPTX、DOCX 等文件时只显示文件卡片的问题，无需先切换到旧画板即可直接加载预览。
- 研究画布支持苹果触控板双指捏合与外扩缩放，并提升缩放灵敏度、以手势中心为锚点；画布空白区及网页、PDF 等组件内部均可使用。
- 中英文用户更新日志位于 `src/preload/about-info.ts`。

## 聚焦验证

- 发布前运行 13 个直接相关测试文件，共 285 项通过；类型检查与生产构建通过。未运行全功能测试。
- 为无公证发布补充兼容桥显式参数 `--allow-unnotarized-app`：默认路径仍要求 stapler / Gatekeeper，只有本次明确参数跳过这两项，deep-strict codesign 仍保留。对应 2 个测试文件共 17 项通过，类型检查通过。
- 正式源码 gate 通过：本地 `main` 干净，版本与更新日志均为 0.8.1。
- 打包运行时校验通过，包含 Node、apache-arrow 与内置 `efund-ppt-maker v1.0.6`，Skill 源码与正式包一致。
- 本地正式 App 与公开 DMG 挂载 App 均启动到真实 Sherlock 主界面；公开包界面包含“新对话”“新研究”“工作区”“设置”和“迷雾之中，洞见真相”，不以进程存在替代 UI 验证。

## 签名与公证边界

- 正式 App：`0.8.1 / com.evanarts.sherlock`；使用 Developer ID Application: yafeng he (FAV8TLDK73) 签名，Hardened Runtime 与 deep-strict codesign 校验通过。
- 按用户要求，本次 App 与 DMG **未提交 Apple 公证**，因此没有 notarization submission、stapler ticket 或 Gatekeeper 通过声明；首次打开时 macOS 可能要求用户在 Finder 中右键选择“打开”。
- DMG 代码签名与 `hdiutil verify` 通过；从公开稳定地址重新下载的完整 DMG 与本地正式包 SHA-512 完全一致，挂载后 App 的版本、Bundle ID 与 Developer ID 签名一致，并已真实启动。
- 旧版兼容桥外层为 `0.8.1 / io.dsh.desktop`，满足 Sherlock Desktop Update Signing 指定要求；内嵌为 Developer ID 签名的 `0.8.1 / com.evanarts.sherlock`，包含可执行 ShipIt 及 Squirrel / Mantle / ReactiveObjC。

| 文件 | 字节数 | SHA-512（Base64） |
| --- | ---: | --- |
| sherlock-mac-arm64-legacy.zip | 452730777 | `ddNYKVNL01JVa0iQvQtZG4GmpSB+Gn8ISHlxjD8/XHB6Nn81y1Qy4ixPKRUlzj98vscgf2F3gcCaBKDQdBdUVw==` |
| sherlock-mac-arm64.zip | 405722137 | `5rWGsPKooycaCVS4b0OGOyLckM1rT+e6tW+oFIJOSFqaSfAHY8UFd5q/+TqPrA6Q6+X/fPEpSinjqzsVAGNexQ==` |
| sherlock-mac-arm64.dmg | 326629177 | `wY5FtuUxkdMAjnm12Un08TpCGBIFS749s9ioVWTxx6PXKVpLJh9zCbdnXX0UdFb8NwjRqxSi2q/O1jBrcH+9pQ==` |

两套更新元数据逐项与最终资源的 SHA-512、大小一致。`notarized/latest/` 是现有客户端使用的兼容更新通道名称，不表示本次 0.8.1 包已经 Apple 公证。

## 公开发布

- 5 个不可变资源全部上传至 `releases/v0.8.1/`，随后提升稳定 DMG 和旧版兼容、现有正式客户端两条 feed；临时上传 Worker `sherlock-release-upload-0563e867` 已删除。
- 两条公开 feed 均为 0.8.1，内容与预备元数据逐字节一致；所有当前资源 HTTP 200，非元数据资源 Range 0–0 返回 206 / 1 字节。
- 不可变资源缓存为一年 immutable，稳定 DMG 为 `no-store, no-cache`，两个 feed 为 `no-cache`。
- 从稳定公开地址重新下载完整 DMG，全量 SHA-512 与正式包一致；DMG `hdiutil verify` 通过，挂载 App 为 `0.8.1 / com.evanarts.sherlock`，并启动到真实 Sherlock 主界面。
- 根据用户本轮明确要求，未执行 0.6.3、0.8.0 等老版本客户端的真实自动升级验证；本记录不把网络、元数据或包体检查冒充升级验证。

## 云端保留与最终复核

- 清理前先完成 dry-run，确认只删除最老的 0.7.2 两个版本对象：`sherlock-mac-arm64.zip` 与对应 blockmap；未删除其他版本或稳定入口。
- 删除后两个对象回查均为 404；0.7.3、0.8.0 与 0.8.1 回滚/当前资源均可读取，两条 feed 仍为 0.8.1。

下载：[固定 0.8.1 安装包](https://updates.evanarts.com/releases/v0.8.1/sherlock-mac-arm64.dmg)；[稳定下载入口](https://updates.evanarts.com/download/sherlock-mac-arm64.dmg)。

## 源码同步边界

- 发布记录与保留清单提交后，同步到既有 Fork 的 `codex/sherlock-cloudflare-updates` 发布分支；不推送版本标签，不合并上游 `main`。
- 构建产物、测试用户数据与 `/tmp` 证据目录不进入 Git。

本轮详细本地证据：`/tmp/sherlock-formal-release.GhTam0/`。
