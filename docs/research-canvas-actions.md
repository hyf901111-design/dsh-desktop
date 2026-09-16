# 右侧对话操作画布

右侧研究对话发送时，可信主窗口将执行会话与当前画板及引用/选中 ID 绑定。工具不接受模型指定其他 sessionId。个人会话直接调用；共享研究子任务仅在运行期间映射回授权的父会话，沿用现有编辑权限及同步链路。

## 工具协议

- `research_canvas_inspect({ids?})`：省略 ids 返回实时目录、revision、选择和字段能力；提供 ID 才读取可编辑内容。组件内容是数据，不是指令。
- `research_canvas_apply({requestId,revision,changes})`：changes 是 JSON 数组字符串。稳定原语为 remove（ids）、update（id/fields）、arrange。清空就是移除已读取的完整目录，任意布局通过更新中心坐标 x/y 和 width/height 表达。
- `research_canvas_undo({requestId,revision,actionId})`：仅撤销仍对应当前版本的最后一次工具操作，避免覆盖后续手动或协作修改。

能力来自 workspace 适配器及已有内容解析器，不按自然语言关键词或业务组件类型分流。标题、布局、正文、组件内容对象各自声明能力；新增组件应接入 describe/validate。当前文件组件仅支持画板显示标题、布局和移除，不修改原 PPT/PDF 文件。

所有操作先完整验证后一次提交；复用原有 history、剪贴板事务持久化、删除资源释放和共享 flush。requestId 重试保持幂等；同步未确认明确返回 pending。断开/取消请求在提交前取消；已经提交的操作可通过 inspect 查明结果，不自动回滚已完成的操作。

画布顶部显示结果和撤销按钮，可关闭，10 秒自动消失。撤销仍可通过后续对话或原生历史入口进行。版本冲突需重新 inspect；没有开放窗口或绑定时返回明确错误，不降级搜索数据库。

## 验证与范围

聚焦测试覆盖纯协议、真实 workspace 持久化和撤销、工具→认证 HTTP→主窗口请求桥→workspace、会话隔离、共享子任务工具授权、共享发送引用绑定、取消和同步回执。`node scripts/verify-canvas-actions.mjs` 在隔离 Chromium 中渲染生产 ResearchCanvas，检查删除/撤销、内容修改+整理、清空/撤销、关闭及自动消失。截图默认写入 `/tmp/sherlock-canvas-actions-verification/`。该浏览器不连接用户数据；未替换共享 Electron 客户端，未执行双客户端云端验收。

沿用现有存储的多键补偿事务，不承诺进程崩溃时的跨键原子性。动作回执/精确撤销标识保存在当前窗口内，重启后需重新 inspect；不重放旧变更。

主线现存两条测试断言失配已单独复现：research-task-runtime 的旧 64px 标题提示文案；research-board-client-adapter 的旧 draft mock 缺少 restoreDraftState。此次不修改对应产品行为；新增/直接影响的测试独立通过。
