# PPTX 画面直接编辑 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox tracking; user explicitly requests autonomous implementation, with no routine confirmation.

**Goal:** 两个 PPT 入口直接点击画面编辑文字、图形和图表，立即预览并可靠保存。
**Architecture:** 在固定 Office 包上标识渲染元素，控制器执行原位编辑和变换，主进程按原 OOXML 身份写回。保留当前文件服务的版本、授权和原子写入。
**Tech Stack:** TypeScript、React、DOM/SVG、现有 PPTX 渲染器、xmldom、受限 ZIP 读写。
**Spec:** docs/superpowers/specs/2026-10-13-pptx-direct-edit-design.md

## Global Constraints

- 默认直接编辑，两个入口操作一致，不要求先点编辑模式。
- 保留未修改的版式、母版和媒体；同步内嵌图表工作簿。
- 不改变外部工作簿，不扩大文件访问授权。
- 只跑直接相关检查；不在功能 worktree 构建共享客户端。

## Review Focus

- 缩放及分组坐标不能导致拖动保存后位置跳变。
- 文字原位输入和粘贴不能破坏其他段落及富文本格式。
- 图表缓存与内嵌工作簿必须保持一致。
- 保存期间的输入、授权撤销及版本冲突必须保留修改。
- 渲染节点回收、页面切换和组件缩放后选择与草稿仍需恢复。

### Task 1: 元素与图表模型和写回

Files: src/main/pptx/content.ts, archive.ts, scene.ts, charts.ts, service.ts; test/pptx-scene.test.ts.
Interfaces: readPptxScene(bytes) returns nodes by slide and object identity; editPptxScene(bytes, changes) writes validated geometry/styles/chart values and preserves all other parts.

- [x] 写失败测试：文字属性、图形位置及旋转、图表类别数值和内嵌工作簿（分组交互在 Task 2 验证）。
- [x] 运行并确认失败对应未实现行为。
- [x] 实现读取和写回，将有类型对象修改接入文件服务及只读草稿渲染。
- [x] 运行聚焦测试、类型检查并中文提交。

### Task 2: 原位交互控制器

Files: scripts/lib/pptx-direct-editor.mjs, pptx-editor-ui.mjs; test/pptx-direct-editor.test.ts.
Interfaces: attachPptxDirectEditor(host, controller) marks click targets, edits text and geometry, emits object changes; updates undo/redo and selection state.

- [x] 写失败测试：默认文字点击、分组缩放下拖动、撤销重做、原位表格输入、图表数据入口（手柄缩放另做真实交互验证）。
- [x] 运行并确认失败。
- [x] 标识原渲染节点，实施选择及原位输入、变换与格式控件，替换字段面板。
- [x] 运行控制器与包补丁组合测试并中文提交。

### Task 3: 实际预览验证与交接

Files: scripts/preview-pptx-editor.mjs, docs/pptx-content-editing.md, isolated output evidence.

- [x] 用真实样本验证两个入口直接编辑、图形和图表数据、保存再读、深浅色与缩放。
- [x] 使用 requesting-code-review 独立审查并验证必要修复。
- [x] 更新中文验证记录、提交；重新生成交接卡并运行集成预检，验收前不推进 main。
