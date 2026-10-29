# 研究看板预览模式

## 行为边界

- 研究顶栏首个操作切换编辑／预览；每个看板在本机记住选择，默认编辑，不同步为协作者全局锁。
- 预览隐藏组件移除按钮、结构编辑菜单和页签 More；组件库、绘制、链接、语音创建禁用。选择、页签切换、主题和原生整理保留。
- 保留放大阅读、剪贴板复制、添加至库、导出、数据源设置及适用的行情刷新；复制不再粘贴新增。阅读窗口仍有明确关闭按钮。
- 独立组件的搜索、公司切换、图表和参数可用。已连线接收端会隐式断线的标的／新闻输入在预览中禁用，并提示“跟随上游联动，请在上游切换标的”；上游选择继续驱动整条链。
- 保持原协作 ACL。结构写入、快捷键、粘贴、连接、页签写入及 AI 修改有独立守卫；原生整理与真实宿主数据刷新使用不同的 bundle 私有身份，公开参数无法伪造。
- 切换先取消拖动、缩放、连线与剪贴板草稿，晚到的 pointerup 不提交。已存在的生成占位仍能接收完成结果，不允许创建额外组件。笔记日历与笔记组件不受研究预览状态影响。

## 补丁与作用域

预览安装纳入既有 grid 的恢复事务。恢复记录使用独立 tooling codec 的 deflate-base64 JSON；兼容旧数组和 Unicode 记录，拒绝未知版本。Notes 助手操作的唯一另一恢复记录读写入口也使用该 codec，未改变 Notes 运行行为。集成时保留主任务较新的 Notes 逻辑，只合并 codec import、读取与写入。

fe414 基线的完整安装器第二遍增加 1082 bytes，Audio、Attachment 和 Calendar 分支均由 130 增至 131；基线证据位于 `/tmp/sherlock-research-preview-baseline-fe414-20261029/`。本候选对三个注册／分支作唯一化，并仅在金融分支清理时消费紧随换行，避免新守卫恢复记录持续累加。

最后两次隔离完整安装及完整 JS 解析、cmp 均成功，输出 15,561,952 bytes，SHA256 `b194ce8c5be976052fd48e88a03ec49ce19c8badce1d51338636cea04a39a676`。恢复数据原始 996,666 bytes，编码 223,103 bytes。原 worktree SDK 哈希不变；隔离证据为 `/tmp/sherlock-research-preview-install-20261029/verification.json`，SHA256 `550cfaf690c0b22a45f48cae00c1f0147e5171eae4b43dd94f9fc6f4aae53bc8`。

## 验证记录

- 新增真实 production ResearchCanvas 的 headless Chromium 用例，覆盖模式、菜单／库／复制、快捷键、原生整理、页签、金融使用、ACL、异步导入／复制、拖动取消、日历与 Notes 隔离、媒体编辑、阅读关闭和已存在任务完成。
- PPT 用例使用真实 central editor 验证切预览后退出编辑，并保留 Notes 与只读兼容检查。
- 真实 desktop storage 重建验证逐看板偏好；HTTP 正常 inspect/apply 请求与 main 内部刷新路径验证兼容，公开请求不能自带 source、scheduled 或 guardId。
- 保留所有真实 RED，包括初始 API 缺失、日历内容写入、隐式断线、PPT 编辑、读者关闭、内部 source 冒用和安装器非幂等，未把失败改写为通过。
- 最终 fresh 检查与日志哈希绑定冻结 tip，记录在 `/tmp/sherlock-research-preview-handoff-20261029/verification.json` 和官方交接卡。

仅运行直接相关检查，未运行全功能套件。功能 worktree 未构建、启动或替换共享客户端，未推送、发布或递增版本。最终签名包与原生主界面验收由集成 owner 执行。
