# Notes 自由输出与原位结果审阅

本轮从已登记 `31635642e5ddbb395d1ce4aea5ad7da5eab32a3c` 后继继续；不构建共享客户端、不推送、不修改用户已有笔记。用户追加的确认/撤销授权覆盖早期计划中“不新增 Accept/Undo”的限制。当前行为规则见 `docs/notes-ai-generation-rules.md`。

## 已复现与修复

- 旧 QA“写一段文字”只留下失败事件，没有公开 final，不能声称还原其具体模型输出。隔离模型 fixture 复现正常文字/Markdown被旧协议拒绝；程序现支持真实 adapter 插入，不扫描正文内 JSON。
- 公开业务 JSON、代码示例与私有协议同型时不能拆壳丢字段或当指令。所有公开 component/capabilities 操作统一校验本轮宿主 wireToken；示例不自动加标识，恢复轮不新增/重放调用。真实混合需求保持原权限和剩余正文，不用中文词法禁止操作。
- 实际 service → capability loop → session 回执合并及重开保留真实 effects、剩余内容和必要状态。只读查询成功不等于正文已写入；空 final 仍需整理实际数据。
- 结果条显示真实改动摘要、撤销/确认，正文以既有蓝色 decoration 审阅。事务仅捕获本请求受控 editor 的真实根块改动；人工/其它任务更新、同 ID 重建均保护。
- 真实 BlockNote 的唯一块删除会产生临时 id:null，旧撤销抛错。整篇仅有本轮安全新建结果且原删除链完整时，原子替换回原 before 链；其它删除恢复只接受原邻居身份或本次 Undo 明确插回且快照一致的 PM 邻居，不能文末兜底。
- 确认/撤销保存失败恢复修正后的草稿与错误；迟到绑定在 Stop/Esc、新请求或换文档后不能重开旧反馈、改写新草稿。零改动且无真实外部 effect 的失败仅保留原需求和错误。

## 聚焦证据

- `/tmp/sherlock-notes-output-compat-20261028/red.log`：先有正常正文/混合结果反例；fixture setup 失败单独保留，不充作 RED。
- `wire-all-operations-green.log`：generator/原 NotesAI/真实 loop/history/service 四文件119/119。
- `/tmp/sherlock-notes-inline-result-20261028/green-final.log`：最初8个真实结果浏览器用例；后续 `result-browser-final13.log` 在 output-compat 目录，13/13（含保存失败、新空白、迟到绑定和零改动）。
- `test/notes-inline-proposals-pm.test.ts`：真实 BlockNote+Yjs+happy-dom 四项，sole、尾部连续删除、全删、物理外来同 ID 邻居；没有同步分配默认 ID 的 stub。
- `original-inline30-final.log` 的两处旧“完成即关闭/强制焦点”合同失败保留；新用户要求下改断言为真实待确认、显式确认后关闭，`original-contract-green.log` 两项通过。

最终冻结提交的完整命令、结果、SDK 不变哈希及原 Voice current/8d17 门禁记录在官方 handoff 与 `/tmp/sherlock-notes-inline-final-20261029/`。只执行直接受影响的聚焦组；真实 packaged 模型调用、保存/重开和验收由集成负责人最终构建后完成。合成 fixture 不代替真实模型成功声明。
