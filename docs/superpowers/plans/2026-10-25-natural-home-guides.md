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

- 实际首页入口先恢复输入区；Electron主世界与preload隔离世界之间只交换目标token，不传DOM对象，确认或取消按请求清理。

- 暂停在移动/AI等待中途，恢复后不会瞬间跳过或重复提交。
- 目标移出视口/被替换/所有权变化时中止，不能指错控件或改错工作区。
- 旧副本只回访，重播新建；保存或取消机制不回归。
- 真实 Host 自动压缩与流式节点生命周期修复保持，最终回复和尾部卡片继续刷新。
- 窄屏控制不覆盖正文/输入区；减少动画偏好可完成同一动作顺序。

## Task 1 — Shared pointer and playback chrome (Root)

- [x] 在 `src/preload/home-guide-pointer.ts` 和直接测试中先验证 move/click/drag 的先后、暂停、取消、目标失效和缩减动画。
- [x] `home-guides.ts` 接入带请求确认的 cue 协议；`home-guides.css` 改成小型悬浮控制，去除底部保留槽/可见步骤旁白，保留可见故障及无障碍状态。
- [x] 调整统一阅读停留，去除空白 overview；更新 shell/guide/browser 聚焦测试并中文提交。

## Task 2 — Board actor (renderer agent)

- [x] 在 `scripts/lib/home-guide-native.mjs` 和相关原生看板测试中验证确认前无 mutation、逐条连线、逐字搜索及中途取消无迟到 apply。
- [x] 真实组件库添加、真实端口轨迹后逐条提交、观察选中标的联动；整理后保存，保留三组件三标的两连接。
- [x] 仅提交本任务文件；复核其他演员和共享协议。

## Task 3 — Notes actor (notes agent)

- [x] 在 `home-guide-notes.tsx` / `home-guide-notes-data.ts` 与 note guide 测试中验证聚焦、指针确认、检查/优化忙态及暂停时钟。
- [x] 标题/正文分批输入，严格滑块操作可见；结果真正出现后再读标记、生成建议和替换，不添加旁白；保留原文/修订与持久化。
- [x] 聚焦测试及中文提交，不修改生产笔记挑战默认延迟。

## Task 4 — PPT actor and replies (host agent)

- [x] 直接测试锁定简洁自然需求，移除回复中的重复演示说明，保留来源和历史预测口径。
- [x] 原生附件/技能/发送/交付卡 cue 均指向对应实际目标；只有演员执行一次操作，最终必须点击交付文件卡，不用整条消息兜底。
- [x] 正常思考等待与阶段流式回复使用暂停/取消门禁；保留真正落盘与模型路由恢复、自动压缩和最终尾卡回归。
- [x] 聚焦检查及中文提交，PPT/PDF资产不得改动。

## Task 5 — Integration and real client (Root + independent reviewer)

- [x] 实际补丁安装两次、类型检查和直接相关测试；独立审查目标与先后、暂停/取消、文案和数据真实性。
- [ ] 按 Plan A 新批次合入 main，干净 main `./script/build_and_run.sh --verify`；实际包与 preload 校验。
- [ ] 原生播放三场，检查箭头、点击/连线、AI等待/回复、PPT卡点击右屏、窄屏与回访；保持正式客户端打开并记录真实证据。

## Task 6 — Live six-component board and expanded note actions (latest user steering)

- [x] Renderer agent: 看板切换正式数据桥，逐项创建六组件、五只自选及三条联动；按截图分行排版，保留原生来源/时点/错误与本机日历。自选数量按最新要求从九只改为五只。
- [x] Renderer agent: 研究和笔记演示开始即收起左栏并加载原生右屏；保持单一画布/编辑器，首个目标稳定可见后才发指针确认。
- [x] Host agent: 将看板编排更新为十步，保持未就绪不前进与阅读停留；PPT 简短需求和交付卡预览保持。
- [x] Notes and Host agents: 增加右屏任务优化当前笔记、虚拟拖选段落后 AI 修改两段；使用真实会话/输入框/选区/修订与保存，并验证暂停、取消、文档与草稿 CAS。十二步真实壳、窄栏、长暂停、保存重开及普通 Notes 路径聚焦检查通过，正式包仍待下一项验收。
- [ ] Root: 相关聚焦检查与独立审查后，经新 Plan A 批次合入干净 main，构建正式客户端；验证实数据六卡、早期右屏、两段笔记任务、PPT 自动点交付卡以及回访内容。

先前正式包 dd2233 的 PPT 已从真实首页完整播放并自动点交付卡打开右屏，Notes 已完整修订且重启后恢复。看板首帧工具栏 hidden 的原生证据已定位，稳定可见等待修复 d6d856a2 已经由批次 20261025-05 合入 main 6b3fc054。最新扩展需求继续在该基线上实施；最终验收以新构建为准。

## Task 7 — Five symbols, visible connection and smart-container extension

- [x] Host agent: 删除可见播放控制器，保持自动播放、可见性暂停/恢复、Escape/导航退出，以及独立错误提示。af0f7645。
- [x] Renderer agent: 精简为指定五只股票，保留三条真实连接，去掉对自动消失收尾提示的关闭动作。798e964d，84项聚焦通过。
- [x] Pointer agent: 仅金融端口拖动显示逐帧曲线；暂停固定，结束/失败/取消清理，普通选段无连线。059d747a、651b65cc，22项及真实SVG渲染通过。
- [x] Host agent: 固定五行研究观察清单，通过受限原生 prepared 任务交付；扩展两段智能容器编排。5c2a6c9a，46项聚焦通过。
- [x] Renderer agent: 真实智能容器创建、输入、提交、忙态与标准 prepared hydration；日历右侧布局及窄屏、保存、取消验证。66dcc393，相关原生浏览器/Host门禁检查通过。
- [ ] Root: 新 Plan A 批次合入干净 main，正式构建并实测新七组件、可视拖线、无控制器、笔记和PPT最终交付。

正式包5d7e675a（49796）签名/包校验/preload2项通过；真实Note十二步及切换对话后重开已通过，摘要、10%修订、选段改写与两条任务保留。Board六组件真实数据与三连接已创建，但收尾出现目标失效（两次实际重放），因此未宣布实际验收通过。最新修改继续修复并扩展此场景。

2026-10-25：Plan A批次07接受并promote，main1615ffa1构建运行56808，签名包和preload2/2通过。实际新Board副本56cd0878无控制器/无收尾报错，五只自选、七组件、三连接及日历右侧观察清单5行全部完成；实际离开到PPT页再重开保留。只读持久化审计14项通过。Notes新副本580f22df十二步已自然完成摘要补充、10%修订和选段改写，原生右屏两条已应用任务保留；PPT演员和资产未改，先前5d真实自动点文件卡/右屏预览已通过，最终包继续复核。实际客户端证据在canonical output/home-guide-natural-v2-local-test-20261025/，不把正在进行的最终复核误标完成。
