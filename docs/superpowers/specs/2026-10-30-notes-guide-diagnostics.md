# 笔记演示内部诊断

- 不改变演示步骤、指针、输入、滚动、等待或用户界面。
- Main 仅接收可信主窗口的 console.info、`[notes-guide-step] ` 前缀和闭合 schema，保存为应用 logs 目录的 `notes-guide.jsonl` 与 `notes-guide.previous.jsonl`。
- 复用有界异步 metadata writer，队列最多64项、两文件各512KiB；输出失败不阻断演示。
- 字段仅限 version、at、runId、sessionId、25步白名单 step、phase、固定 reason、可选标准 errorName 与0–1000的附件/occurrence数量；拒绝任何额外字段和自由文本。
- 原生输入 CAS 拒绝额外记录闭合 reason，区分 record、draft、revision、图片、occurrence；仍抛出原错误，不放宽保护，不记录引用内容或 ID。
- 记录真实步骤 start/end/fail、暂停与恢复原因、取消原因及保存交接阶段；不记录笔记正文、提示词、草稿、URL 或 error.message。
- 旧演示 raw warning 不再输出错误正文；步骤失败由同一个外层 timeline 记录元信息。
- 当前运行环境的失焦暂停已经通过前台激活验证；本修改用于确定下一版实际停止位置，不推断尚未捕获的失败原因。
- Native 签名客户端的实际日志与完整演示接受由 Root 在集成后验证；功能 worktree 不构建或操作共享 App。
