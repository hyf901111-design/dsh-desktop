# 组件模式菜单与生命周期实施计划

> **For agentic workers:** 按 executing-plans 顺序实施；独立审查员只读核对生命周期与最终差异。

**Goal:** Chat/Notes 的当前组件 More 可切换既有四模式，菜单在离开所属组件/板块时可靠关闭。

**Architecture:** 共享 SurfaceUi.Menu 保持主菜单与 submenu 为同一域，监听真实 owner 身份、可见性及 iframe/window 焦点。Notes 复用 notePresentation；Chat 以 owner/revision 事务保存组件主题，迁移 observation revision，不修改内容或全局看板主题。Chat 样式事务与既有 HTML journal 同队列，禁止越过未保存或失败的交互。主题仅更新 palette 与既有 iframe 消息，不重建组件内容。

**Tech Stack:** React、TypeScript、既有 SDK 源码 patch/serializer、Vitest 与隔离 Chromium。

**Spec:** 本轮用户要求：模式切换二级菜单；浅色/深色/易方达/彭博只作用当前组件；outside/iframe/导航/模式/session/owner 变化均关闭；不损失交互或保存状态。

## Global Constraints

- 基线 df2e8a79b951b4e9e3de6232b19934dd91d87d09，独立 worktree 与 APFS COW dependencies。
- 不写共享集成、SDK、manifest、客户端，不 build/live UI，不改版本或发布。
- 保持 ACL、owner/generation/revision、HTML journal/shared state、dirty 与 request 守卫。
- 只运行本轮直接影响的聚焦测试；中文本地提交后在同 clean tip fresh 验证。

## Review Focus

- submenu pointer/keyboard 仍可操作，不能被主菜单的 outside listener 提前关闭。
- 保留挂载但隐藏的 Notes owner、程序切模式和同 ID 跨 session/ABA 都关闭旧菜单。
- iframe 不冒泡 pointer；进入 iframe 或其他窗口也能关闭菜单。
- 切换主题保留既有 iframe、计数器/memo/筛选、HTML 状态及原生行情快照。
- 主题写入失败或 readonly/owner/revision 变化必须拒绝，不误更新其他实例或全局主题。

## Task 1: 关闭菜单生命周期

- [x] 在 test/component-surface-menu-browser.test.ts 补 retained owner、程序切板块、iframe/outside/Escape/submenu 的实际 UI RED。
- [x] 在 scripts/lib/component-surface-ui.mjs 最小修复同一菜单域和 owner 生命周期；保持现序列化唯一 factory/strip 规则。
- [x] 跑直接 menu/browser 与 serializer 聚焦，创建中文本地提交。

## Task 2: 当前组件四模式与持久化

- [x] 在 conversation store/service/IPC 直接 tests 补组件隔离、reopen、快照保留及 stale/readonly/owner 拒绝 RED。
- [x] 在 packages/dsh-research-task-runtime/conversation-component-contract.d.ts、src/preload/conversation-components.ts、src/main/conversation-components/{ipc,service}.ts、src/main/state/conversation-components.ts 增加有限的 theme 写入，复用 rename 的 revision/observation 迁移。
- [x] 在共享 factory/serializer、scripts/lib/conversation-components.mjs、src/preload/notes/native-component-block.tsx 接四主题 submenu；Notes 复用原 presentation，保持 iframe identity 与 dirty 语义。
- [x] 在实际 Chat/Notes production browser fixture 验证四模式、两个组件隔离、保存重开、iframe 状态不丢及菜单关闭规则。
- [ ] 跑直接 tests、TC/diff 后中文提交；冻结 tip 再 fresh 同范围，保留 RED/GREEN 与 source/protected-asset hashes，生成以 df2 为 base 的官方 handoff 候选。

冻结后的最终验证与交接结果记录在外部官方卡，不再回写源计划，以保持 verifiedCommit 固定。
