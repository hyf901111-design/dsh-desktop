# 对话原生生图实施计划

**Goal:** 对话自然语言自动调用生图模型并原位显示图片及流动渐变 Loading。
**Architecture:** 现有内置 runtime 注册 image_generate 工具；独立 ImageProvider 对接 Images API；原生附件存储作为交付；会话 ToolImageOutputs 邻接渲染受真实工具状态驱动的图片卡片。
**Tech stack:** JavaScript、Electron / Harness、fetch、React 既有组件、Vitest。
**Spec:** docs/superpowers/specs/2026-11-05-image-studio.md
**Constraints:** 用户澄清不要独立界面；不修改侧栏或增加设置页；不使用技能；仅聚焦测试；不从功能 worktree 构建共享客户端；中文提交，不对外发布。

## Tasks

- [ ] 1. packages/dsh-research-task-runtime/image-generation-provider.js 和 image-generation-tool.js：模型路由、凭据、当前会话附件、生成及编辑、取消和去重。先写 test/image-generation-tool.test.js，再实现。npx vitest run test/image-generation-tool.test.js，预期通过。
- [ ] 2. scripts/lib/image-generation-client.mjs：会话图片占位、流动渐变、真实结果/错误/取消状态，沿用原生 ImageGallery。接入 runtime/index.js 和 patch-web-frontend-loading.mjs；test/image-generation-client.test.js 验证状态投影、去重和补丁幂等。运行聚焦测试及 npm run typecheck，预期通过。中文提交。
- [ ] 3. 按 executing-plans 技能独立审查全分支并修复；交接后追加既有活动集成批次，经预检合并；在集成 worktree build_and_run.sh --verify，检查真实窗口、普通中文请求的占位加载和最终图片。

## Review Focus

付费请求重复、取消竞态、较新用户消息和会话身份变化、凭据泄漏、超大或损坏响应、跨会话引用、工具处于折叠/嵌套时可见性、历史重载的无限 loading、原生图片重复渲染、provider 扩展边界。
