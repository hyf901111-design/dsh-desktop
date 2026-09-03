# Sherlock 0.8.0 发布记录

日期：2026-09-03。平台：macOS Apple Silicon。

## 来源与版本内容

- 用户已完成本轮研究画布与模型配置修复验收，并明确要求向现有用户发布 0.8.0。
- 正式客户端构建提交：`eea2f5c939faee8d3e74b7354b680c80ef9914f7`；正式构建前本地 `main` 干净，版本为 0.8.0。
- 本版修复无对话研究画布会话的创建、标题与侧栏持久化，新研究不再复用已有画布；组件边缘工具栏自动避让，生成结果在来源附近置顶显示。
- 智能容器与“基于所选创建”支持按用户要求生成自包含交互网页、用户体验地图等专业交付物，并修复实时检索时工具调度失败。
- 修复首次配置模型且当前模型为空时，模型列表读取失败并显示原始校验错误的问题。
- 中英文用户更新日志位于 `src/preload/about-info.ts`。

## 聚焦验证

- 发布前运行 22 个直接相关测试文件，共 580 项通过；类型检查与构建通过。未运行全功能测试。
- 正式源码 gate 通过：本地 `main` 干净，版本与更新日志均为 0.8.0。
- `./script/build_and_run.sh --formal` 成功；打包运行时校验通过，包含 Node、apache-arrow 与内置 PPT Skill。
- 正式包中的真实 `@deepseek-ai/dsh-client-connection` 已确认包含可空 `current` 模型选择兼容逻辑。
- 本地正式 App、旧版升级后的 App 与公开 DMG 挂载 App 均通过真实可见界面检查，不以进程存在替代 UI 验证。

## 签名与公证

- 正式 App：`com.evanarts.sherlock`；Developer ID Application: yafeng he (FAV8TLDK73)。
- App 公证：`6dc13a06-cb9a-40a4-bd02-b5c8b4cc588c`，Accepted。
- DMG 公证：`84577974-ca82-44d9-afe5-d541766bebea`，Accepted。
- App / DMG stapler、deep-strict codesign、Gatekeeper 全部通过；DMG `hdiutil verify` 通过。
- 旧版兼容桥外层为 `0.8.0 / io.dsh.desktop`，满足 Sherlock Desktop Update Signing 指定要求；内嵌为已公证的 `0.8.0 / com.evanarts.sherlock`，包含可执行 ShipIt 及 Squirrel / Mantle / ReactiveObjC。

| 文件 | 字节数 | SHA-512（Base64） |
| --- | ---: | --- |
| sherlock-mac-arm64-legacy.zip | 452733952 | `OuBIoc8Nw3dzmY0GItfyC1S4OyFOeo+oHMoEZnwzSo6uNBzV96K44dJ4S6Q2FBlCGdvvLUbQTCOar1JbY7Ik3Q==` |
| sherlock-mac-arm64.zip | 405724342 | `3ChOieQ5OKsSXhOpqOhAw03uuk4jMv/wC3kxKvv2Mv+vEi6iAQxzwc5+7QYL8B/kb2PW9DJZ4vzNQDcc0aGifQ==` |
| sherlock-mac-arm64.dmg | 326902386 | `3Xuh4dvdiDc11MSipfaIjiXO8mPRp+Nqz1Bf//Ue4xw1Ust2GhmxcmeDQWnhQ7hed2Xhbwdh2Bxr/TLg696PCA==` |

两套更新元数据逐项与最终资源的 SHA-512、大小一致。

## 迁移与共存

- 独立测试默认目录 `dsh-desktop` → `sherlock-desktop`：仅复制缺失文件，目标新值与源值均保留，迁移标记生成。
- 真实 DSH Desktop 0.6.3 与 Sherlock 0.8.0 在隔离环境中同时运行，两套独立哨兵互不改写。

## 公开发布与升级

- 5 个不可变资源全部上传至 `releases/v0.8.0/`，随后提升稳定 DMG 和旧版兼容、公证两条 feed；临时上传 Worker `sherlock-release-upload-e3658729` 已删除。
- 两条公开 feed 均为 0.8.0，内容与预备元数据逐字节一致；所有资源 HTTP 200、大小正确，非元数据资源 Range 0–0 返回 206 / 1 字节。
- 不可变资源缓存为一年 immutable，稳定 DMG 为 `no-store, no-cache`，两个 feed 为 `no-cache`。
- 从稳定公开地址重新下载完整 DMG，全量 SHA-512 与正式包一致；显式添加 quarantine 后，DMG 与挂载 App 的 stapler / Gatekeeper 均通过，挂载 App 为 `0.8.0 / com.evanarts.sherlock`，并启动到真实 Sherlock 主界面。

### 真实旧版升级

- 0.6.3：真实客户端从公开兼容 feed 发现并完整下载 0.8.0，下载 ZIP 的 SHA-512 与 feed 一致；产品安装入口调用 ShipIt 原位升级为 `0.8.0 / io.dsh.desktop` 兼容桥，随后桥转换为 `0.8.0 / com.evanarts.sherlock` 正式 App。
- 0.7.9：真实公证客户端从公开公证 feed 发现并完整下载 0.8.0，下载 ZIP 的 SHA-512 与 feed 一致；ShipIt 于 19:13 完成原位替换。
- 两套升级后的 App 均通过 deep-strict codesign 与 stapler；携带同一隔离目录重开显示完整主界面，再次检查更新为 up-to-date，侧栏更新按钮隐藏，独立数据哨兵保持不变。
- 全部升级验证使用独立 userData、appData、Home、Squirrel 与下载缓存；0.7.9 测试前清除了一个指向上轮 `/tmp` 测试包的失效 launchd ShipIt 注册，重新注册当前测试副本后升级成功。未触碰正式用户会话数据。

## 云端保留与最终复核

- 所有公开资源、真实升级、迁移、共存与 Gatekeeper 门禁通过后，预演并精确删除最老的 0.7.1 两个版本对象：`sherlock-mac-arm64.zip` 与对应 blockmap；未删除其他版本或稳定入口。
- 删除后两个对象回查均为 404；0.7.7、0.7.8、0.7.9 与 0.8.0 回滚/当前资源均为 200，两条 feed 仍为 0.8.0。

下载：[固定 0.8.0 安装包](https://updates.evanarts.com/releases/v0.8.0/sherlock-mac-arm64.dmg)；[稳定下载入口](https://updates.evanarts.com/download/sherlock-mac-arm64.dmg)。

## 源码同步边界

- 发布记录与保留清单提交后，同步到既有 Fork 的 `codex/sherlock-cloudflare-updates` 发布分支；不推送版本标签，不合并上游 `main`。
- 构建产物、测试用户数据与 `/tmp` 证据目录不进入 Git。

本轮详细本地证据：`/tmp/sherlock-formal-release.LeZZI8/`。
