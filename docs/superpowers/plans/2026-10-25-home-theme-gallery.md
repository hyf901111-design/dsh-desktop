# Home Theme Gallery Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with the current isolated feature worktree and explicit file ownership. User authorized autonomous implementation and local testing.

**Goal:** 按Figma提供完整主题壁纸选择区，沿用客户端原生壁纸和真正全局明暗设置。

**Architecture:** 单一home-themes owner提供选择、预览和订阅；运营UI只消费该controller。最小纯数据桥调用真实native ThemeRuntime。保留Quick Start实例和guide生命周期。

**Tech Stack:** TypeScript preload、native plugin transform、CSS、Vitest及真实Chromium/browser fixtures。

**Spec:** `docs/superpowers/specs/2026-10-25-home-theme-gallery.md`

## Global Constraints

- canonical clean main构建，1.3.5不变；不公证/上传/push，不跑全功能测试。
- 不换壁纸内容/规范key/渲染器，不恢复局部透出区，不修改三用例演员或PPT/PDF资产。
- Source小步中文提交，仅已验证范围；Plan A新批次集成。

## Review Focus

- 全局明暗真实native设置持久化，不是仅body attribute；locale和portal/右屏同步。
- 渲染器/订阅释放，15预览按需，不在启动或隐藏时全部创建GL。
- 页签/主题不因明暗或locale变化重置，不重建正在进行的guide编辑器。
- 紧凑宽高、长英文标签、键盘焦点，不截断/内滚动。
- 旧dock不残留、不占空间，普通研究/笔记用户主题不被改写。

## Task 1 — Native theme controller and appearance (B)

Files: `src/preload/home-themes.ts`、new `src/preload/home-theme-controls.ts`、`src/preload/index.ts`、最小native theme transform/patch pipeline文件及直接相关测试。不得编辑C的home-operations.ts/css/browser test。

Contract: `HomeThemeController { getSelected(): HomeTheme; select(id: HomeTheme): void; getThumbnail(id: HomeTheme): string | null; subscribe(listener: () => void): () => void }` exported from home-theme-controls.ts. `getHomeThemeController(doc: Document): HomeThemeController | undefined` exported from home-themes.ts. Operations Options receives optional `themeController` and `onToggleAppearance?: () => Promise<void>`; index wires both after mountHomeThemes. B/C可在编辑前协商必要最小调整并通知Root。

- [ ] 编写最小失败检查：真实设置路径、选择/订阅/恢复、隐藏预览不提前创建、dispose。
- [ ] 公开controller，移除dock UI并沿用真实持久化/动态背景。
- [ ] 接入真实native ThemeRuntime最小桥，不导入整个native插件到preload，不伪造body模式。
- [ ] 运行直接相关测试/类型检查，独审后中文提交。

## Task 2 — Figma tabs and gallery (C)

Files: `src/preload/home-operations.ts`、`home-operations.css`、如需独立`home-theme-gallery.ts/css`、`figma-home.css`旧dock空白清理、直接browser测试。不得编辑B的owner/index/native transform。

- [ ] 锁定15预览/标准网格、页签/模式保留、无dock、窄高/键盘的行为和渲染回归。
- [ ] 消费Task1接口，Figma中英显示名，不改变规范key，不另建壁纸或store。
- [ ] 保持Quick Start原实例、carousel/hero.inert/区域切换和guide；页签隐藏停止相应无用绘制。
- [ ] 聚焦真实browser/raster检查、类型检查、独审和中文提交。

## Task 3 — Integration and visible client (Root + D review)

- [ ] 独立复核数据/事件/生命周期和四卡增强最终范围；聚焦检查通过。
- [ ] Plan A batch08或更新批次合入干净main，仅从main build_and_run --verify。
- [ ] 实际签名包/preload检查，正式UI验证主题/明暗/恢复/窄尺寸/四卡；PPT最终交付自动点击路径复核，保持客户端打开。
- [ ] 更新持久证据和实施勾选，本地中文提交；不发外部消息、不push。
