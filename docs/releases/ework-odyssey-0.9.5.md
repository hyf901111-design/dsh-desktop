# EWork Odyssey 0.9.5

日期：2026-09-09。平台：macOS Apple Silicon。独立修复版。

## 发布范围

包含 main 已提交的顶部交互与子代理布局修复、斜杠菜单本地化、空白会话模式状态同步。

用户在获知协作分支未合并门禁后明确要求“独立修复并发版”。本次仅排除 codex/feat/research-board-collaboration-20260909、codex/feat/research-board-design-20260909 及其独立工作目录 .worktrees/research-board-design-20260909；其正在开发的源码不合并、不修改、不发布。允许该排除目录继续开发。此例外仅适用于 0.9.5，不修改默认正式发布门禁。其他分支、工作目录、活动集成租约与干净 main 检查保留。

按此前用户要求跳过公证；保留 Developer ID 和旧证书兼容桥双通道签名，只做差分升级验证，不进行全量安装重启升级测试。不部署协作服务或数据库迁移。源码同步至既有私有仓库 hyf 和 main，不推送标签。

## 验证

构建提交：`0104c681d069de7651af3e1771f0d146c9cba331`。

- 73 项聚焦测试、类型检查、构建与包完整性检查通过，未运行全功能测试。
- 独立目录启动后进入真实主界面，关于页显示 0.9.5 与三条更新说明；恢复正常工作区与账户，实测研究顶部下拉切换及输入区同步，恢复构建模式并保持应用打开。
- Developer ID App/DMG 签名、ZIP/DMG 完整性与运行依赖通过；旧证书兼容包外层 io.dsh.desktop、内嵌 com.evanarts.sherlock，ShipIt、Mantle、ReactiveObjC 依赖完整。
- 直接检查成品包，未包含 dsh-research-collaboration 模块。
- 按要求跳过 Apple 公证与 stapling；标准通道沿用 notarized 路径不代表本次已公证。
- 首次上传在创建分片时收到 Cloudflare 500/1104，未提升公开入口；确认所有目标不可变对象均不存在后重试成功。两次临时上传 Worker 均已删除。
- 八项公开资源校验通过：两条更新源均为 0.9.5，更新说明、大小、SHA-512、完整内容 ETag、blockmap、首尾 Range/206 和缓存策略正确。
- 两条通道均使用真实 electron-updater 单段 Range 合成，SHA-512 完全一致，无全量回退；未执行旧客户端安装重启升级测试。既有 MaxListenersExceededWarning 未影响校验结果。
- 精确删除最早 0.9.0 的五个对象，无缓存请求全部返回 404；保留 0.9.1 至 0.9.5，清理后两条更新源仍为 0.9.5。

| 0.9.4 → 0.9.5 通道 | 新包字节 | 下载字节 | 复用字节 | 请求数 | SHA-512 |
| --- | ---: | ---: | ---: | ---: | --- |
| standard | 408290826 | 104540889 | 303749937 | 735 | 一致 |
| legacy | 458594492 | 153500654 | 305093838 | 726 | 一致 |

发布证据：`/Users/heyafeng/Documents/ChatGPT/sherlock-release-evidence/0.9.5`。GitHub 目标为 `awake-ai-lab/sherlock-desktop` 的 `hyf` 与 `main`，采用原子快进推送，远端 SHA 校验保存在发布证据中。
