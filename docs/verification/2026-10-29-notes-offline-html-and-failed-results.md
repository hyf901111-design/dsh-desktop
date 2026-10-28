# Notes 离线 HTML 与失败结果真实性回归

## 原生证据与原因

集成负责人在自己的验收笔记提出第二张离线 HTML 演示折线图（10/1=10、10/2=20、10/3=15，折叠明细与备注输入），实际第二个子会话执行两 turn 后失败；未增加第三个子会话。这里只读取该验收记录的公开 final，不读取 reasoning 或凭据。

首轮确实丢弃 register 返回值，随后调用无关函数的 dispatch，既有拒绝正确。第二轮已把真实 register 返回值赋给 API 存在性条件表达式，闭包通过该句柄 dispatch；旧 AST 只识别直接初始化，错误拒绝合法修复。新增识别限定字面宿主路径、无副作用 fallback 和实际词法绑定，仍拒绝空注册、伪对象、参数遮蔽、赋值替换与动态 computed 来源。公开两轮 demo 输出保存在 test/fixtures/notes-real-offline-line-html.json，第二轮用于真实 sandbox 交互 fixture。

另有两个真实宿主问题：Notes 失败 receipt 被 capability loop 提前封为 completed；占位 research block 又被反馈摘要计作完成。现失败/取消在 Notes opt-in 保留未完成语义，结果栏按真实有效 spec 与当前状态分类；旧错误 ready 记录恢复原需求和错误，不删除卡或记录。明确重试只在原需求、有效锚点、未改动且未被独立任务占用的 slot 上转移本次归属。

## 交互保存

Notes register/dispatch 使用本地保存 ACK，不借 Research Canvas sink。语义状态与原生 details/input journal 共用队列，保存确认前不 ACK；语义处理过的可信事件不重复录入 journal，原生明细仍可独立保存。更新不重建 iframe，重开恢复 memo、展开与选中点；Research 默认共享通道保持。

## 聚焦结果

- 后端：6 文件 137/137。包括实际两轮公开输出经真实 runtime/同 child 修复链、失败仍拒绝、条件/作用域负例、失败 receipt 与失败记录配额/身份。
- Notes shared-state：9 文件 80/80。真实 Notes sandbox 中备注、明细、选中点保存重开；保存挂起、失败、乱序 ACK、Undo、更新 state（含 null）、队列上限/version 隔离；原 journal 与 Research 回归。
- 结果浏览器：19/19。失败原需求、同 slot 重试、旧假 ready 保存重开后纠正并重试、混合只计真实成功、人工/等待中编辑、独立卡片重试归属、旧请求 Undo 不删新请求；原确认/撤销/sole paragraph/图片/代码/focus/保存失败保留。
- typecheck 和 diff-check 通过。只执行相关聚焦检查，没有全套测试、依赖重装或共享客户端构建。

日志分别位于 /tmp/sherlock-notes-offline-html-20261029、/tmp/sherlock-notes-shared-state-20261029、/tmp/sherlock-notes-failed-child-20261029。正式 handoff 绑定最终提交并列完整 argv。

隔离浏览器使用明确 demo fixture，不调用真实用户数据或模型。最终 packaged 客户端使用同原始需求的真实生成、确认、备注/明细交互、退出重开由集成负责人在本次正式合入与本地构建后验收；这里不冒称完成该原生验收。
