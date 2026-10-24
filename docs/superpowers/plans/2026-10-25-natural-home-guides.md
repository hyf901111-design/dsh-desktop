# Natural Home Guides Implementation Plan

> **For agentic workers:** Use the existing isolated feature workspace and explicit file ownership. User requested autonomous implementation; no additional approval gate.

**Goal:** 三用例具有真实操作顺序、虚拟鼠标、自然 AI 等待与回复，并移除多余演示面板。

**Architecture:** 保留真实原生组件、会话与持久化。Root 管统一指针、暂停和轻量控制；看板、笔记、PPT 演员只在指针确认后执行本场景操作。

**Tech Stack:** TypeScript/React preload、resident renderer transforms、现有 Host/provider、Vitest 与真实 renderer 浏览器夹具。

**Spec:** `docs/superpowers/specs/2026-10-25-natural-home-guides-design.md`

## Global Constraints

- 正式构建仅干净 canonical main；版本1.3.5不变，不公证、不上传、不推送、不运行全功能测试。
- 20页PPT及原报告字节、数据来源/历史时点、已有用户草稿与正常模型路由保持有效。
- 系统鼠标不受虚拟指针控制；退出/重播/换会话不得产生迟到操作。

## Review Focus

- 暂停在移动/AI等待中途，恢复后不会瞬间跳过或重复提交。
- 目标移出视口/被替换/所有权变化时中止，不能指错控件或改错工作区。
- 旧副本只回访，重播新建；保存或取消机制不回归。
- 真实 Host 自动压缩与流式节点生命周期修复保持，最终回复和尾部卡片继续刷新。
- 窄屏控制不覆盖正文/输入区；减少动画偏好可完成同一动作顺序。

## Task 1 — Shared pointer and playback chrome (Root)

- [ ] 在 `src/preload/home-guide-pointer.ts` 和直接测试中先验证 move/click/drag 的先后、暂停、取消、目标失效和缩减动画。
- [ ] `home-guides.ts` 接入带请求确认的 cue 协议；`home-guides.css` 改成小型悬浮控制，去除底部保留槽/可见步骤旁白，保留可见故障及无障碍状态。
- [ ] 调整统一阅读停留，去除空白 overview；更新 shell/guide/browser 聚焦测试并中文提交。

## Task 2 — Board actor (renderer agent)

- [ ] 在 `scripts/lib/home-guide-native.mjs` 和相关原生看板测试中验证确认前无 mutation、逐条连线、逐字搜索及中途取消无迟到 apply。
- [ ] 真实组件库添加、真实端口轨迹后逐条提交、观察选中标的联动；整理后保存，保留三组件三标的两连接。
- [ ] 仅提交本任务文件；复核其他演员和共享协议。

## Task 3 — Notes actor (notes agent)

- [ ] 在 `home-guide-notes.tsx` / `home-guide-notes-data.ts` 与 note guide 测试中验证聚焦、指针确认、检查/优化忙态及暂停时钟。
- [ ] 标题/正文分批输入，严格滑块操作可见；结果真正出现后再读标记、生成建议和替换，不添加旁白；保留原文/修订与持久化。
- [ ] 聚焦测试及中文提交，不修改生产笔记挑战默认延迟。

## Task 4 — PPT actor and replies (host agent)

- [ ] 直接测试锁定简洁自然需求，移除回复中的重复演示说明，保留来源和历史预测口径。
- [ ] 原生附件/技能/发送/交付卡 cue 均指向对应实际目标；只有演员执行一次操作，最终必须点击交付文件卡，不用整条消息兜底。
- [ ] 正常思考等待与阶段流式回复使用暂停/取消门禁；保留真正落盘与模型路由恢复、自动压缩和最终尾卡回归。
- [ ] 聚焦检查及中文提交，PPT/PDF资产不得改动。

## Task 5 — Integration and real client (Root + independent reviewer)

- [ ] 实际补丁安装两次、类型检查和直接相关测试；独立审查目标与先后、暂停/取消、文案和数据真实性。
- [ ] 按 Plan A 新批次合入 main，干净 main `./script/build_and_run.sh --verify`；实际包与 preload 校验。
- [ ] 原生播放三场，检查箭头、点击/连线、AI等待/回复、PPT卡点击右屏、窄屏与回访；保持正式客户端打开并记录真实证据。
