# 对话 HTML 交互持久化与生成回执

## 真实旧客户端反例

父任务在 `5d794b62c` 本地客户端请求计数器与备注。该轮运行约 4 分 53 秒、15 步，记录约 451K 输入 tokens / 13K 输出 tokens；模型在创建前公开承诺本机保存及重开恢复，随后因校验失败去查看 `normalizeConversationComponentArtifact` 源码，最后说明需要把 `title` 放进 `artifact`。父任务手动停止，状态为终止，没有创建卡片。此轮是失败基线，不能计为验收成功。

只读回放还确认：旧对话 normalizer 会接受真实公开首轮的空共享注册 HTML，以及 `<button>加一</button><script>const =</script>`；同一内容会被 Notes / Research 的共享与语法检查拒绝。普通对话 HTML 的本地状态原先还会落到 Canvas sink，没有独立的对话保存确认和恢复入口。

## 本次修复

- Conversation 独立有限 IPC `commitHtmlInteraction`，在既有 store 串行队列中合并 native journal 与 shared state；真实原子保存成功才回复。检查账户、当前可见 conversation、窗口代际、组件 ID、HTML 版本和组件 revision；只读或失效的迟到结果不确认，也不回退已保存数据。
- HTML renderer 使用明确的 `surface: 'conversation'` 本地 provider，复用已验证的纯 journal / shared ACK 桥；不连接 Canvas 房间或 Canvas sink。新卡读取持久化状态，重开恢复；缺少保存桥时只读。金融组件沿既有原生配置接口，结构化模板沿原 renderer。
- 仅新创建的原始 HTML 使用现有脚本语法、共享状态、样式和可识别图形校验；错误回执列出具体问题，要求当前轮修复完整 artifact、用新 requestId 重试，不重放成功写入、不新增子任务或隐藏画布。合法旧卡读取不重新生成、不迁移、不重新执行新 gate。
- 归一化后的最终 HTML 再经完整 `parseResearchContainerSpec` 校验，保留原 200KB 上限。原始合法 200000 字节在样式归一化后增至 200024 字节的反例先红后绿；拒绝写入不可重开的结果，不截断业务内容。
- 目录公开 `artifact.version/type/title` 结构和 HTML / 表格示例。只有 artifact 真正缺失 title，且顶层 title 已有效验证时，补齐该元数据；不覆盖显式空值或错误标题，不猜 version / type，不改变业务数据。缺少元数据时直接指出字段，避免模型查应用源码。
- 生成指引给出真实 `register / initialState / reduce / render / dispatch` 范式，说明宿主自动保存与 ACK；不要求模型使用 localStorage 或发明存储接口。dispatch 受理不等于保存，公开说明须以真实回执为准。

## 验证边界

先观察失败：验收 helper 两条负例失败；真实 Conversation renderer 两条状态保存 / 重开测试失败；后端新接口初始为 16 条失败 / 1 条通过。后续真实浏览器使用生产序列化 renderer、真实 preload bridge 和临时目录中的 main service / store，验证并发计数、备注、折叠合并、保存重开、保存挂起 / 失败、只读 / 缺桥及账户切换。Canvas sink 设置为错误路径探针，要求始终零调用；未操作共享客户端、真实模型或用户数据。

最终直接受影响范围为 14 个后端 / 协议文件 321 项、真实交互浏览器 5 项、原流式渲染浏览器 17 项、三模式菜单浏览器 5 项，共 17 个测试文件 348 项通过；`tsc --noEmit -p tsconfig.node.json` 和 `git diff --check` 通过。生产 resident 经原生 Node 重建后，Conversation serializer 再次应用逐字节一致，额外尾随注释保留。

旧流式测试原先直接重 patch 已安装 resident，当前安装资产会触发原有 strict anchor 失败；用 HEAD 原函数独立复现相同失败后，仅把夹具统一到现有原生生产 unwind helper，没有放松 strict strip。该夹具也补齐真实输入 port 与 current session，保留原键盘 / 菜单 / 复制 / 保存断言，并新增引用回执实际写入输入 port 的断言。

精确 argv、源码哈希及所有红绿日志见 `/tmp/sherlock-conversation-html-20261029/verification.json`。本轮未启动或重建共享客户端、未调用真实模型、未读取或修改用户卡片；正式客户端验收由父任务在源码集成后执行。
