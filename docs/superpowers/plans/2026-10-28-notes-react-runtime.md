# 笔记空白修复计划

用户已要求直接修复；例行实现取舍由开发自行判断，不增加确认步骤。基线为 canonical main `3542b6a2c3594ecef42f084cebfb920524c53fdc`。

- [x] 追踪 `useNoteUiLocale` 与生产 preload，确认两个物理 React 模块导致空 dispatcher。
- [x] 先新增生产构建浏览器回归，复现三类笔记均报相同 `useReducer` 错误。
- [x] 仅扩展 preload 的 React/ReactDOM 去重边界，保留笔记内容及已有交互实现。
- [x] 完成生产 bundle 的真实挂载、编辑、语言、保存重开、已有注册表回归与类型检查。
- [x] 使用与集成相同的独立 APFS 依赖克隆复现 Yjs 身份冲突，追加 `yjs` 去重；保留全部原断言，增加独立 peer、警告与真实 XML fragment 检查。
- [x] 整理中文本地提交与精确基线/tip 的 Plan A 交接资料；外部证据目录保留红绿运行日志，由父任务集成并验证共享客户端。
