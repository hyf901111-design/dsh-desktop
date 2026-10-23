# Home Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原生对话首页加入 Figma 运营区域及其局部交互。

**Architecture:** preload 独立 controller 挂载运营区，保留原生 composer 与主题模块。使用独立 CSS 与16张本地 Figma SVG；事件及观察器在首页边界内生效。

**Tech Stack:** TypeScript、DOM、CSS、Vite raw/inline assets、Vitest + Chromium。

**Spec:** docs/superpowers/specs/2026-10-23-home-operations-design.md

## Global Constraints

- 卡片点击后的业务本次不实现；不复制原型 shell 或替换主题背景。
- 展开 620ms、收回 480ms、cubic-bezier(.45,0,.18,1)；遵守减少动态效果。
- 保留原生输入节点与值，排除设置/研究/子代理及菜单。
- 不运行全功能测试；不从功能 worktree 构建或替换共享客户端。
- 每项完成并聚焦验证后创建中文本地 Git 提交，不混入其他 session 改动。

## Review Focus

- 正在编辑输入、多行滚动、组合输入与弹层不被上下吸附截获。
- 路由、设置、子代理切换及重复挂载不会残留/重复 UI。
- 窄窗与右栏展开时，输入及运营控件仍可达，不盖住主题 dock。
- 全部配图深浅/hover 对应正确，无临时外链或缺图。
- 观察器与指针反馈不形成 style mutation 回路，卸载可恢复原页面。

### Task 1: 运营区与局部交互

**Files:** src/preload/home-operations.ts、home-operations.css、home-operations-assets.ts、home-operations-assets/*、index.ts；test/home-operations-browser.test.js。

**Interfaces:** export mountHomeOperations(doc: Document = document): () => void；素材导出 OPERATIONS_ILLUSTRATIONS[mode][state][kind]；host data-odyssey-home-operations-state=input|operations。

- [x] 先运行缺失运营区域的浏览器检查，确认失败。
- [x] 实现卡片结构、原图素材、深浅色样式与几何测量。
- [x] 接入生命周期、状态吸附、分页与 hover，保留原生输入。
- [x] 验证输入节点/值、事件边界、显隐、宽窄窗、减少动态效果及图片加载；截图放 /tmp。
- [x] 运行 npm run typecheck 和直接受影响首页回归，修复新问题。
- [x] 独立代码审查，修正重要问题后中文提交。

### Task 2: 功能交接

- [ ] 检查干净源码与精确 feature tip，生成本地 handoff 元数据/检查证据。
- [x] 只读核对其他集成批次状态；不接管、不手改租约、不擅自 accept/promote。
- [x] 记录真实完成范围及原生客户端未验收限制。

## 验证记录

独立审查发现短窗主题 dock 遮住返回箭头，已按展开 dock 完整几何预留（常规156px）修复。新增4个真实短窗点击命中红绿测试，与原20项同轮24/24通过。原首页3文件43项通过；最后统一运行并记录输出。所有截图位于 /tmp/ework-home-operations-20261023，仅证明浏览器环境中实际DOM增强与主题模块的布局/交互，不能代替真实客户端验收。

最终统一验证：4个直接相关测试文件67/67通过（2026-10-23 14:36 Asia/Shanghai，18.61s），类型检查通过。canonical main prepare只读预检通过；本功能保留在独立分支交接，未执行共享客户端构建、主线晋升、公开发布或远端推送。
