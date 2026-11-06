# EWork Computer Use 候选执行层

三个插件共用当前会话模型、图片能力检查、账户授权与桌面任务租约。Cua 与 Peekaboo 使用固定发行版的本地 MCP；UI-TARS 使用原版 NutJS Operator，在独立 Node 进程运行，不包含 UI-TARS 模型权重。

用户在插件管理中三选一；启用另一方案将停用并终止旧方案。关闭插件、取消任务、锁屏、休眠及 Cmd+Shift+Esc 均终止输入。前台操作可能移动物理鼠标和切换焦点，插件说明明确提示。

版本：Cua Driver 0.38.0（MIT）、Peekaboo 4.9.8（MIT）、UI-TARS Operator/SDK 1.2.3（Apache-2.0），MCP TypeScript SDK 1.28.0（MIT）。发行文件 SHA-256 见 `scripts/prepare-computer-candidates.mjs`。本轮候选仅支持 macOS arm64。

没有调用云端 Cua 服务，也没有加载 AGPL 的 OmniParser 扩展。各模型请求继续通过用户已配置的提供商，不向执行层传递模型密钥。

评测入口：`node scripts/computer-use-benchmark/run.mjs`。需要用户已配置的火山 Agent Plan 及图片模型。结果写入本地忽略目录 `output/computer-use-bakeoff/`；判定来自测试页面保存结果/原生应用文件，模型自报不计分。屏幕图片只在当前模型请求内使用，默认不写入评测报告。
