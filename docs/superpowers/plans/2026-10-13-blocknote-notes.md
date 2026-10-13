# BlockNote 笔记实施计划

Spec: docs/superpowers/specs/2026-10-13-blocknote-notes-design.md
Figma: https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd?node-id=2393-364680
执行：本会话连续实施。用户已授权按Figma实现及本地启动，不另设设计确认。仓库当前main干净；遵循用户指定主干，不恢复停放实验。仅聚焦检查。

## Task 1: 文档契约与持久化

创建 src/shared/workspace-notes.ts、src/main/notes/store.ts、test/workspace-notes.test.ts。定义版本化文档、恢复草稿、标题目录、AI请求与选区快照。先验证不存在的笔记为空、原子保存/重启、版本冲突不会覆盖、账号/会话隔离、草稿恢复与删除，再实现。主进程可信IPC注册 notes:request，客户端不读取任意路径。

## Task 2: 模型和组件

创建 packages/dsh-research-task-runtime/notes-ai.js 与对应聚焦测试，注册可信同源模型请求，复用会话选模、LLM和组件验证；支持超时与停止，拒绝不完整回复。主进程桥接请求并渲染既有组件模板，沿用原剪贴板服务。接口只传声明数据，无凭据。

## Task 3: BlockNote 页面

添加核心/React/样式依赖；新建 src/preload/notes 模块与样式。复用WorkspaceSurfaceHost及现有全局侧栏，在原顶部插入笔记入口，绑定真实当前会话。实现正文、目录、格式/段落菜单、评论、AI预览、组件块、底部输入、保存状态和恢复UI。隔离挂载编辑器，避免重建编辑器导致焦点和撤销丢失。编辑依赖在沙箱preload中完整打包。

## Task 4: 验收与本地启动

运行新笔记聚焦测试、受影响的workspace-surface-host测试、类型检查与构建。实际UI检查深浅色、中文输入、目录、菜单、复制粘贴、AI生成采纳撤销和恢复。修复有证据的问题，完成独立代码审查。创建中文本地提交。执行本地测试构建手册并保持客户端打开。

## Review Focus

- 生成期间修改正文、切换会话或取消后，迟到结果不得写错文档。
- 版本冲突和保存失败不得丢弃恢复草稿或显示虚假的已保存状态。
- 研究组件和评论须在保存、重启与撤销后保留。
- Electron沙箱不能外部require浏览器库；不能引入远程运行时资源。
- 原对话草稿和模型/权限控件不能被笔记截获或改写。
