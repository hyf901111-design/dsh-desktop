# 对话清单旧交互恢复修复

基线：`0d86bbc886cc479fc7a35078761c438d475620b7`。本功能独立于已冻结的笔记操作交付分支，不修改生成提示词、组件内容或共享客户端。

## 已复现问题

共享清单在 `change` 事件中保存状态时，同一次激活的 `click` 仍会进入原生交互日志。三次操作后共享状态为 `[false,false,true]`；冷重开重放旧 `click`，再次触发 `change` 和共享保存，将状态误改为全不选中。原独立证据位于 `/tmp/sherlock-conversation-checklist-native-20261031/checklist-browser-debug.log`。

新增真实 Conversation renderer → preload bridge → service → 磁盘 Store 浏览器用例，在修复前复现四组失败，覆盖 `onchange` 与 click/input/change 同时处理，以及混合共享/非共享控件的旧日志。

## 修复边界

- 只将同一个 checkbox/radio 的一次 click/input/change 激活链关联起来。共享处理任一阶段时同时消费原 click；相同 JSON 动作跨事件阶段只入队一次。键顺序无关，独立点击、不同控件、不同动作及同一处理函数内的多次调用保持原语义。仅记住真正已接纳的动作。
- 原生日志回放期间，共享状态运行时使用私有恢复标志拒绝新共享动作。回放仍执行普通原生控件的事件与闭包；批末按当前权威共享状态重新渲染，恢复共享控件的选中状态。
- 私有标志覆盖同步恢复栈、其排入的微任务和零延时回调，在一次零延时恢复检查点清理。新的可信用户激活立即取代该检查点，连续点击不被延时吞掉。
- 不改写全局 timer/Promise。不声称追踪任意延迟 timer、未决 Promise 或多层异步任务的因果来源；这些跨检查点的业务回调需要另行设计显式来源 API。本次范围解决实际已复现的同步 change 及紧随回放的异步队列问题。
- 已保存的共享状态和旧日志均不迁移、不删除，冷重开不能产生新的共享修订。未使用共享 API 的 checkbox、文本输入、details 等仍使用既有日志恢复路径。

## 聚焦验收

`test/conversation-html-state-browser.test.ts` 使用生产 Vite preload、实际 Conversation 桥及真实 `ConversationComponentStore` 的临时磁盘文件，不模拟保存成功。

- onchange、click/input/change：鼠标、label 转发、键盘 Space、重复独立勾选，每次仅一个共享修订；普通原生 checkbox 独立保存恢复。
- radio：鼠标与方向键切换，重复选择保留，各次激活只保存一次。
- 按旧格式保存三个共享 click 和一个普通原生 click；同步、微任务、零延时 change 回调均冷重开两次，保持 `[false,false,true]`、共享 revision 3、原生状态及闭包，不新增写请求。随后真实操作仍可保存。
- 既有 Conversation 计数、备注、details、主题、账号隔离与失败保存回归，以及 Notes HTML 普通/共享交互和其他共享组件回归。
- SDK 单测验证动作键序、独立激活、失败 admission 后再尝试及私有标志不依赖可删除 DOM 属性。

外部日志、命令、精确提交与结果以本 feature 的正式 handoff/evidence-index 为准。未运行全功能测试，未构建或替换客户端；签名客户端验收由集成负责人在合入后执行。
