# 首页三个教程自然节奏与成果保留实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. 各任务直接聚焦验证，按所有权独立中文提交。

**Goal:** 让用户看清真实操作的目标、过程与结果，退出或切页后仍能回访示例成果。

**Architecture:** 三个教程各用独立真实会话和目录。控制层只负责教学节奏、控件定位、暂停与下一步，原生看板、笔记、输入、任务、文件和 Office 负责实际内容；结果经现有存储持久化。重播创建新练习副本，原成果不覆盖。

**Tech Stack:** Electron / TypeScript / React、原生 DSH session / AgentLoop、NotesStore / Yjs、ResearchCanvasStorage。

**Spec:** 用户本轮验收反馈及追加“投资研报 PDF 附件生成公司规范 PPT”的要求。

## Global Constraints

- 鼠标卡死已从当前目标移除，不在本轮追加鼠标自动化或诊断。
- 不调用真实模型；PPT使用严格会话作用域的离线执行器，笔记挑战使用预置结果，金融数据明确为示例。
- 使用当前本地 main 为基线，不混入其他会话改动；仅从干净 main 构建正式身份本地客户端。
- 不公证、不发布、不递增版本、不上传、不推送。
- 仅运行直接相关验证，不运行全功能测试。

## Review Focus

- 创建/保存过程中切页或换账号，晚到结果不得拉回页面或接管别人的会话。
- 暂停覆盖动作延迟、服务端执行与阅读停留；下一步不得跳过仍未完成的操作。
- 已保存示例重新打开、重启、重播均不清掉原成果。
- 同一真实会话不能同时挂两份编辑器或两份画布测量器。
- 取消 PPT prepare、发送失败、源文件不完整时不得落入真实模型或覆盖既有文件。

### Task 1: 教学控制层

Files: `src/preload/home-guides.ts`, `home-guides.css`, `home-guide-timeline.ts`, `index.ts`。

- [x] 先以缺失 next/wait、独立会话创建、保存前卸载、真实 PPT resident 可用写失败测试。
- [x] 实现 prepare → owned open → 原生 tab → adapter 的顺序，外部导航及时取消。
- [x] 增加目标引入、每镜说明/结果停留、控件定位、暂停与下一步。
- [x] 保存完成后才称已保存；切页先 flush，再释放示例 surface。
- [ ] 实际客户端核验三条全过程的可读节奏和窗口布局。

### Task 2: 真实可回访的看板

Files: `research-boards-ui.ts`, `scripts/lib/home-guide-native.mjs`, `src/main/state/research-canvas-storage.ts`。

- [x] 用正式 session/目录/favorite 创建真实个人示例看板，不登记为可自动删除的空临时板。
- [x] 稳定 owner scope 的严格 registry 保留会话索引，普通回访仍选预置金融数据。
- [x] 真实组件库、联动、搜索加股、整理与每步确认 persist。
- [x] 避免 resident/guide 双画布测量，保留原输入和正常退出选择语义。
- [ ] 原生退出切页与重新打开验收。

### Task 3: 真实笔记保存与可读挑战

Files: `home-guide-notes.tsx`, `home-guide-notes-data.ts`, `notes/editor.tsx`, `notes/mount.tsx`, `notes/challenge-controller.ts`。

- [x] 六幕分别为写入、选择严格、出现检查结果、看标记、读优化、替换。
- [x] 用同一个 owner-aware NotesBridge 保存完整正文/Yjs/标记/覆盖信息。
- [ ] 接管前确认旧原生笔记保存并卸载同会话实例，返回重新读取最新内容。
- [ ] 组合窄 pane / 暂停 / 切页 / 延迟 flush 测试与原生回访。

### Task 4: 投资研报生成公司 PPT

Files: `home-presentation-runtime.js`, `home-guide-presentation-native.mjs`, `home-guide-presentation.ts`, runtime `index.js` 与 `assets/home-presentation/`。

- [x] 用真实 InputBar 发送，独立离线 adapter 驱动正常 AgentLoop、任务和消息事件。
- [ ] 修复 prepare 的异步取消竞态，不遗留作用于普通消息的执行器。
- [x] 使用 efund-ppt-maker 制作含规范目录、专业研读观点与原生数据图表的可编辑中文公司规范成稿，并检查封面/母版/页脚/字体和逐页渲染。
- [ ] 真实添加 Vanguard 原 PDF 附件和公司技能，规划与最终页面纲要一致。
- [ ] 固定 hash 校验后复制 PDF/PPTX 到示例目录，使用普通文件交付和 Office 预览，退出不撤销或删除。
- [ ] 原生文件/会话重访验收。

## Verification and delivery

Direct checks: 相关 home-guide unit/browser、NotesStore/challenge、session registry/storage、真实 SDK presentation runtime、patch roundtrip/idempotence、TypeScript、diff check。

完成后重新交接/预检/集成至 main，执行 `./script/build_and_run.sh --verify` 和 `npm run verify:package:mac -- --app "dist-notarized/mac-arm64/EWork Odyssey.app"`，真实客户端核验三教程与保存/回访，保持应用打开。仅记录实际看见的结果，浏览器 stub 不作为原生 Office 验收。
