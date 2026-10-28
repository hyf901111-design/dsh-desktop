# 输入框语音输入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在共享输入框提供无重复、不误发、可安全中止的语音转写和紧邻发送按钮的真实音量反馈。

**Architecture:** ResearchVoiceController 维护持久 research 注册及独立临时 composer owner，只允许一个 capture。可逆 composer-voice patch 在原生 InputBar 内通过 keyboard.setDraft 写入，用精确请求、编辑器、draftRev 及焦点身份防护迟到结果。

**Tech Stack:** Electron trusted IPC、TypeScript、现有 macOS Speech、React、原生 SessionInputShell、Vitest/Playwright。

**Spec:** docs/superpowers/specs/2026-10-28-composer-voice-design.md

## Global Constraints

- 不启动真实麦克风、不构建/替换共享客户端、不新增依赖、不运行全量测试、不推送或合并。
- 用户要求独立 worktree 和中文本地提交；base 3542b6a2c3594ecef42f084cebfb920524c53fdc。

## Review Focus

- 取消期间原生同步 final 和 IPC 延迟开始：先撤销身份，随后只取消同一请求。
- 录音期间 research setActive 或视图导航：不得恢复陈旧研究注册。
- 按键和 IME：首个非 IME Enter 仅停止，普通编辑/组合输入继续。
- 笔记与普通输入共存：只写当前原生 shell，不污染另一路草稿。
- 隐藏/卸载、只附件及运行任务：没有遗留麦克风；原停止/发送语义保留。

### Task 1: 临时录音所有权

**Files:** src/shared/research-voice.ts, src/preload/research-voice.ts, src/main/state/research-voice.ts, test/research-voice.test.ts.
**Interfaces:** ResearchVoiceApi.startComposer(ResearchVoiceRequest): Promise<ResearchVoiceResult>；同一 subscribe 事件通道。

- [x] 写失败用例：composer 无 research 注册可开始；并发 capture 拒绝；Fn 暂停后恢复当前 research；旧注册清理不撤销 composer；navigation/主帧/后台/取消竞态隔离。
- [x] 运行 `npm test -- test/research-voice.test.ts`，确认新用例 RED。
- [x] 实现临时 owner、trusted IPC 和 terminal 后释放，保持 research start 行为。
- [x] 同命令 GREEN，中文提交。

### Task 2: 受控输入会话与原生渲染

**Files:** scripts/lib/composer-voice.mjs, scripts/lib/composer-voice.css, scripts/patch-web-frontend-loading.mjs, test/composer-voice.test.js, test/composer-voice-browser.test.js, test/fixtures/composer-voice-browser.tsx.
**Interfaces:** createComposerVoiceSession({bridge,keyboard,input,blocked,composing,onChange,onError,document})；start/stop/reconcile/dispose；InputBar 通过 useComposerVoice 和共享渲染函数接入。

- [x] 写失败用例：累计转写替换、real level、key/blur/stop 保留、迟到结果、外部 draftRev、延迟 start/retry、dispose。
- [x] 运行 `npm test -- test/composer-voice.test.js`，确认 RED。
- [x] 实现会话和可逆 patch；pipeline 在最外层应用、最先撤销，保持原生发送/任务停止逻辑。
- [x] 在隔离真实 InputBar/SessionInputShell 中覆盖首页/对话/研究/笔记，验证受控草稿、首次 Enter、IME、mouse stop、音量、附件、运行停止与布局。
- [x] 运行直接相关新测试、既有输入/语音检查、typecheck、diff check；保留外部截图和日志，中文提交。

### Task 3: 审查与交接

- [x] 独立阅读 diff、spec 和全部竞态路径（父任务禁止继续派生子代理）。
- [x] 按精确 tip 重跑聚焦命令并保存证据，保持 worktree 干净。
- [x] 生成 Plan A handoff；明确浏览器假桥验证和原生验收限制。

执行记录：main 新入口、输入会话、浏览器交互及生产 patch 双次重入均完成 RED→GREEN。浏览器发现 caret 留在开头，已加精确 draftRev/焦点保护的选区恢复并验证。DOM 观察仅在录音期启用。作者完成独立审查，按父任务指令未派生其他代理。提交后的精确 tip 日志与交接结果保存在外部 composer-voice 证据目录。

基线说明：既有 notes-composer.test.js 的“installs the native portal and adapter idempotently…”在本功能与干净 canonical main3542 均报“笔记原生组件签名缺失：ConversationRoot”；该无关重入测试未修改，真实 Notes 输入框语音场景通过。隔离浏览器沿用的既有 DshChipCell 内联字体有 ERR_INVALID_URL 资源警告，单独记录，语音代码无控制台错误。

父任务审查追加：真实 InputBar 中 `page.keyboard.press('Meta+Enter')` 与 `Control+Enter` 均复现修饰键先停止、随后 Enter 误提交转写（RED）。增加仅属于被中断录音手势的编辑器状态；keyup、首个非修饰键、失焦、鼠标、新录音和卸载清除，保留 Shift 换行与 IME。新增浏览器验证同一组合键首次不发送、释放后下次按原行为发送，单元验证 Alt 和清理路径；针对性 9 项 GREEN。新提交后的完整聚焦结果及更新交接卡仍保存于外部证据目录。

集成后复核追加：窗口 blur 可能吞掉 Meta/Control keyup 而保留 textarea 焦点，导致返回窗口后的 Enter 被残留手势状态拦截。新增窗口监听仅清理此状态和待执行 caret，不取消录音；卸载移除监听。两个修饰键的真实 InputBar 回归主动截断 keyup 到 document 的传播，单元同时验证授权不中断、迟到 caret 不执行及卸载无监听泄漏；5 项先 RED，修复后验证，按已集成的 8d17d49 生成独立增量交接卡。

集成检查追加：旧安装的 v1 序列化函数与新函数不同，原 strip 精确比较整块定义导致升级失败。历史 8d17 原模块→新模块以及官方入口旧版→新版两项先 RED；改为校验唯一有界标记、导出位置、运行时声明与语法，保留严格 UI hook 校验。当前版和历史旧版均经官方入口两次内存重放，依赖零写入。发送策略单独提取 onPrimary 的测试补齐实际 voice 闭包上下文，并增加完整 voice wrapper 下原发送策略回归。

已授权动效追加：仅在既有 useComposerVoice 生命周期管理展示保留和退出 timer；CSS 240ms ease-out 向左展开/收起，发送按钮固定，音频事件不重播动画；关闭立即移除可访问状态与交互，reduced-motion 即时。三个真实浏览器回归覆盖 90ms 实际 CSS 中间帧、音量与动画对象稳定性、退出语义、reduced-motion、快速重开/卸载 timer；两项先 RED，修复后针对性检查 GREEN。按原五文件及 typecheck 验证并生成 e918 后继增量卡；不改 Main/Power 或实机焦点策略，不构建共享客户端。
