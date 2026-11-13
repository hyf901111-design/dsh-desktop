# EWork Odyssey 1.5.5

平台：macOS Apple Silicon。保留标准与旧版迁移通道的签名，跳过 Apple 公证。

## 更新内容

- 登录后可按品牌选择内置对话模型；支持图片输入的模型标记「视觉」。模型菜单底部可添加自定义模型。
- 对话支持直接生成图片，也可上传参考图继续修改；缩小生成中的占位卡，改进图片生成和任务中断时的提示。
- 探索页新增「管理用量」，显示订阅等级、5 小时与每周剩余额度及恢复时间。悬停探索按钮可预览 5 小时余量，额度不足时会在输入框上方提示。
- 登录用户可使用内置联网搜索；未登录或额度不足时，回到原有搜索方式。
- 改进金融工作台生成，支持多种图表、完整的对账明细及来源追溯；修正金额单位、收益率中位数和番茄钟倒计时。
- 改进研究看板的自动整理、宽表阅读、组件连线和协作页签恢复，修复协作更新冲突后的重试。
- 新对话首页新增浏览器、插件、定时任务、研究看板和笔记快捷入口；简化注册密码要求。

## Release notes

- Signed-in users can choose built-in chat models by brand. Models that accept images carry a Vision badge. Add a custom model from the bottom of the model picker.
- Generate images in chat or upload a reference image to guide edits. The generation placeholder is smaller, and messages about interrupted tasks are easier to understand.
- Manage Usage in Explore shows your subscription, remaining five-hour and weekly allowances, and reset times. Hover over Explore to preview the five-hour balance; low allowance is explained above the composer.
- Built-in web search is available when signed in. The previous search method is used when signed out or when the built-in allowance is unavailable.
- Financial workbenches support multiple chart types, complete reconciliation details and traceable sources. Fix currency units, median returns and the Pomodoro countdown.
- Improve research-board auto-layout, wide tables, component connections and shared tab recovery. Retry synchronization after a collaboration conflict.
- Open Browser, Plugins, Scheduled Tasks, Research Boards or Notes from the new chat home screen. Registration has a simpler password requirement.

## 发布范围

以线上 1.5.1 为基线，包含已验收的客户端变更。独立管理后台分支 `codex/feat/accounts-admin-20261110`（`7a3cbddfca0c9b798d56906deeab9a6bb3584bd4`）新增了管理端排序和额度分配界面及相关服务变更，保留原分支，未纳入本次客户端发布。

独立工作台分支 `codex/feat/board-folder-icons-20261109`（`be23c48938f41a8e69ef617ca63770bbd09f2e91`）保留未验收的生成策略。发布继续沿用已验收的生成策略，净值和来源持久化修复已单独适配（`0927544e6`，集成批次 `20261113-03`）。

开源组件试验分支 `codex/feat/ework-oss-component-pilot-20261111`（`85a325a93ff67d00eca0ebe5f660bb7ee34b6984`）仍有独立的行情接入和原型工作台后续实验，保留该分支，以本地 `main` 中已验收的实现发布。


## 发布验证

- 正式构建提交：`6df05bccaa48f71c9466bad2984c84772c223eac`。186 项聚焦测试（含修正后的两组复测）、类型检查和正式构建通过。
- 标准 App、DMG 和旧版迁移包保留各自签名。验证了包标识、签名、DMG、ZIP 和内置运行时；按用户要求跳过 Apple 公证。
- 签名完成后重新启动验证实例：真实账号登录成功；临时测试账号会话经系统钥匙串加密，重启后恢复。
- 两个公开更新源与固定下载入口均已验证，包含缓存、公开 blockmap、单段 HTTP 206 和中英文更新说明共 26 项检查。
- 从 1.5.1 用公开 blockmap 和单段 Range 重建 1.5.5 的两个 ZIP，SHA-512 均与发布包一致。未执行全量升级测试。

| 差分通道 | 新包（字节） | 实际传输（字节） | 复用（字节） | 请求数 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 862,159,477 | 152,322,322 | 709,837,155 | 861 |
| 旧签名兼容 | 932,499,298 | 271,926,521 | 660,572,777 | 978 |

各旧版直接升级至 1.5.5 的差分大小（其余版本按公开 blockmap 计算）：

| 当前版本 | 标准通道 | 旧版兼容通道 |
| --- | ---: | ---: |
| 1.4.2 | 425.7 MB | 541.6 MB |
| 1.4.3 | 425.7 MB | 541.2 MB |
| 1.5.0 | 152.8 MB | 272.1 MB |
| 1.5.1 | 152.3 MB | 271.9 MB |

- Homebrew Cask 同步至 1.5.5，提交 `8b6b90b21a5cd164a2838946922e00461ba95f0e`，DMG SHA-256：`f3870dee926cddc715c69aefcff22027fbe154ea478f2dbb52912d63e23296b7`。
- 按版本保留策略移除 1.4.1 的 5 个旧文件，保留 1.4.2、1.4.3、1.5.0、1.5.1、1.5.5。
- 发布源码同步到 GitHub `hyf` 与 `main`；未推送版本标签。

下载：[EWork Odyssey 1.5.5（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.5.5/sherlock-mac-arm64.dmg)。

证据目录：`release-cloudflare/1.5.5/`。
