# 笔记演示改写预填一致性

- 现场 e9c 签名客户端在 `note-rewrite` 记录 `step-fail/native-input-changed`，随后保存退出；无失焦、Escape 或 CAS guard 拒绝。
- 真实按钮预填通用改写需求，而演示 Portal 只接受共享的研究改写需求，两条文本不同导致 exact draft 保护在发送前正确拒绝。
- 仅 `guide.native` 上下文的按钮改为复用 `HOME_NOTES_REWRITE_PROMPT`，与 Portal/演示运行时使用同一来源。普通笔记的通用改写预填及本地化保持不变。
- 不放宽 exact draft、record identity、draftRev、图片、occurrence、选区或请求归属保护。
- 组合回归使用实际 NotesApp 浮动改写按钮、原 Native Portal、实际 SDK SessionInputShell 和原生 draft 事件适配器；Host、行情响应及 InputBar 表现层为明确测试边界。
- 验收：演示真实按钮预填提交一次并保留原段选区、生成替换预览；退出演示后普通笔记真实按钮仍预填原通用需求；不匹配的用户草稿拒绝且不发送、不改写草稿。
- 保留原25步、三份依据、两处优化、选段改写、主区总结预览→插入、保存导出重开聚焦回归。功能树不构建或操作共享 Native 客户端，签名包验收由集成任务执行。
