# Sherlock 0.7.9 发布记录

日期：2026-09-03。平台：macOS Apple Silicon。

## 来源与验收

- 用户已验收本地测试批次 `20260903-04`，并明确要求向现有用户发布。
- 批次已通过正式的 accept / promote 流程进入本地 main。
- 客户端构建提交：`ef8e6a936166e550782b0b7d5ef0d13d610bd5b1`。
- 发布工具修正：`5ed1b08d8f43673cdf7a0e9a5034d0cf3b3766ee`：稳定 DMG 地址使用 `no-store, no-cache, max-age=0, must-revalidate`，防止 CDN 将稳定地址缓存四小时。此修正仅涉及发布脚本和测试，不进入已签名 App。
- package / lockfile / 中英文更新日志均为 0.7.9；不再递增版本。
- 未提交 `dist-internal/`、`output/`，未推送公开 Fork 或任何标签。

## 版本内容

研究画板的渐进式上下文引用、按所选资料创建组件、文本/图片/文件粘贴、组件跨画板复制粘贴，以及相关提示、弹层、图标和快捷键焦点修复。详细用户更新日志位于 `src/preload/about-info.ts`。

## 聚焦验证

- 发布聚焦测试：9 个文件，56 项通过；类型检查通过。
- 保留策略测试：4 项通过。
- 稳定下载缓存回归：先验证缺少 `no-store` 时失败，再通过真实发布计划验证；Cloudflare 发布测试 14 项通过。
- 收尾复核：Cloudflare 发布与保留策略共 18 项聚焦测试通过；未运行全功能测试。
- 正式源码 gate：main 干净，已验收功能已集成。
- 正式构建 `./script/build_and_run.sh --formal` 成功；运行时依赖校验通过，包含 Node、apache-arrow 和内置 PPT 插件。
- 真实公证客户端显示完整主界面，而非仅检查进程。

## 签名与公证

- 正式 App：`com.evanarts.sherlock`；Developer ID Application: yafeng he (FAV8TLDK73)。
- App 公证：`b3614611-ffb4-4aa7-a1e8-46436c13480c`，Accepted。
- DMG 公证：`35f2d027-17da-4f07-b1d9-b8e8e23f8e46`，Accepted。
- App / DMG stapler、deep-strict codesign、Gatekeeper 全部通过；DMG hdiutil 校验通过。
- 旧版兼容桥外层：`io.dsh.desktop`，满足原 Sherlock Desktop Update Signing 指定要求；内嵌 App 为上述已公证版本，包含可执行 ShipIt 及 Squirrel / Mantle / ReactiveObjC。

| 文件 | 字节数 | SHA-512（Base64） |
| --- | ---: | --- |
| sherlock-mac-arm64-legacy.zip | 452710030 | `6xI7cmch+ttGT0B2PiPxeEVtHiAPVZQBJ1Nj0pxXxqZhHyrjrin9KjCuuuwAtmCdVNpn942IevF5O5mQIbZa0g==` |
| sherlock-mac-arm64.zip | 405703796 | `gqBpUMyWgy0qmRt3Ybzx1dBIFdgX2ME/0dsTppHB2N0S0+NNkM9wWN6AQn/lVhzFCx1oNY4RLfB3yK+YgYQJ+w==` |
| sherlock-mac-arm64.dmg | 326753903 | `AP8CCeRzQSTAMaMwHDw25U9Ckk+H1tVh3SXQ/1aOo9MXXUR5UsOJORnVlDELh/ViVMzSrqmL1XDfz9kJCg3itQ==` |

两套更新元数据逐项与最终资源的 SHA-512、大小一致。

## 迁移与共存

- 独立测试默认目录 dsh-desktop → sherlock-desktop：仅复制缺失文件，目标新值和源值均保留，迁移标记生成。
- 独立测试兼容桥启动迁移：桥转换为正式 App，哨兵保留，实际主进程成功启动。
- 真实 DSH Desktop 0.1.1 与 Sherlock 0.7.9 同时运行，使用隔离系统应用数据根，两套哨兵互不改写。

## 公开发布与升级

- 不可变资源 5 个全部上传至 `releases/v0.7.9/`，随后提升稳定 DMG 和两条 feed；上传脚本成功退出。
- 公开旧版兼容 feed 与公证 feed 均为 0.7.9，内容与预备元数据逐字节一致。
- 所有资源 HTTP 200、大小正确；非元数据资源 Range 0–0 均返回 206 / 1 字节。
- 不可变资源缓存为一年 immutable，稳定 DMG 为 no-store / no-cache，两个 feed 为 no-cache。
- 本轮临时上传 Worker `sherlock-release-upload-ccfe9d5b` 已删除，并通过 API 复核；两个缓存诊断对象也已精确删除。

- 从稳定公开地址下载完整 DMG（断点前缀加并行 Range 回读），全量 SHA-512 与正式包一致。
- 对公开 DMG 添加 quarantine 后，stapler 和 Gatekeeper 均通过；挂载后确认 App 0.7.9 / com.evanarts.sherlock，App stapler / Gatekeeper 通过。
- 从上述挂载 App 复制到临时目录（不复制隔离属性）启动真实主界面，确认新对话、新研究及工作区入口可用；检查更新为 0.7.9。未代替用户操作系统安全确认对话框。

### 真实旧版升级

- 0.6.3：真实客户端发现 0.7.9，从公开 feed 完整下载兼容 ZIP，显示安装按钮；调用产品安装入口后，ShipIt 于 14:04:23 报告安装成功。原路径先成为 0.7.9 / io.dsh.desktop 兼容桥，启动后转换为 0.7.9 / com.evanarts.sherlock 正式 App。
- 0.7.8：真实客户端发现 0.7.9；以经过原公开 SHA-512 校验的 0.7.8 ZIP 作为旧缓存尝试差分下载。CDN 不支持该多区段请求，客户端自动回退整包下载；ShipIt 于 14:04:49 报告安装成功。
- 两套客户端实际下载缓存的完整 SHA-512 均与已发布 ZIP 相符；升级后 App 的 deep-strict codesign 与 stapler 均通过。
- 两套客户端重开均显示 0.7.9 和完整主界面；再次检查更新为 up-to-date，侧栏更新按钮隐藏，原隔离数据目录的独立哨兵保持不变。
- 0.7.8 升级后的关于页实际展示 0.7.9 更新日志中的本轮功能与快捷键修复。

验证范围与说明：

- 使用隔离的用户数据、Squirrel 缓存和下载缓存；为避免 LaunchServices 不转发测试参数而误用正式数据，关闭测试实例的自动启动，安装后手动携带相同隔离参数重开。未宣称验证了不带参数的自动重启。
- 验收工具缓存了兼容桥旧 Bundle ID。原位更新和身份迁移完成后，仅将临时测试 App 改名为 Sherlock-upgraded.app 再重开检查；安装包内容、签名和用户数据目录不变，发布资源仍名为 Sherlock.app。
- Squirrel 清理临时目录时出现目录非空 / 文件已不存在的警告，但两条安装均明确完成，最终应用和数据验证通过。

### 云端保留与最终复核

- 用 R2 权威对象列表补全原先只记录 0.7.3 / 0.7.6 的过期清单，确认最早实际版本为 0.7.0。
- 全部公开资源、真实升级、迁移与共存通过后，预演并精确删除 0.7.0 的 5 个版本目录对象，合计 1,162,292,893 字节；没有删除其他版本或稳定入口。该云端删除不可直接撤销。
- 删除后 5 个对象带独立查询参数回查全部 404；R2 剩余 30 个版本资源与更新后的清单完全一致。
- 0.7.7、0.7.8 回滚资源与 0.7.9 当前资源均以 HTTP 200 和大小再次验证；两个 feed 仍为 0.7.9，稳定 DMG 仍为正确文件及 no-store 缓存策略。

下载：[固定 0.7.9 安装包](https://updates.evanarts.com/releases/v0.7.9/sherlock-mac-arm64.dmg)；[稳定下载入口](https://updates.evanarts.com/download/sherlock-mac-arm64.dmg)。

## 源码同步边界

现有 Fork 是公开仓库。遵照用户此前明确的源码隐私要求，本次不将源码推送到公开 Fork、上游或新建公开远端；源码与发布记录保留本地 Git。二进制 Cloudflare 发布和私有源码备份是独立事项，私有远端尚未指定。

本轮详细本地证据：`/tmp/sherlock-formal-079.9nD3vj/`。
