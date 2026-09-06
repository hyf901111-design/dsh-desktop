# Research Voice Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Follow task ownership below; integration and local commits belong to the primary agent.

**Goal:** 将研究语音指令转成自动执行的画布组件。
**Architecture:** Node-API 原生录音与 Fn → 可信主进程 IPC → preload → 研究工具栏 → 现有容器执行。
**Tech Stack:** Objective-C++, Node-API, Apple Speech, AVAudioEngine, Electron, TypeScript, React, Vitest.
**Spec:** docs/superpowers/specs/2026-09-05-research-voice-design.md

## Global Constraints

- 仅前台研究模式启用；开始时才申请权限；只设备端识别，不保存原始音频。
- final 每请求只执行一次；取消/卸载/会话切换使旧回调失效。
- 中文本地提交；聚焦检查；本地签名测试构建，跳过公证，不对外发布。

## Task 1: 原生捕获

Files: scripts/macos/research-voice.mm, scripts/build-research-voice.mjs, scripts/test-research-voice-native.mjs.
Interface: init(callback), setEnabled(bool), start(requestId,locale), stop(requestId), cancel(requestId), dispose(). Events: toggle; or requestId + state/partial/level/final/error/cancelled.

- [x] 先编写不请求权限的构建/导出/lifecycle验证。
- [x] 实现 AppKit Fn、Speech 权限、设备端识别、RMS、静音截止与过期任务清理。
- [x] 编译 Node-API bundle，验证加载和销毁。

## Task 2: 可信录音会话

Files: src/shared/research-voice.ts, src/main/state/research-voice.ts, src/preload/research-voice.ts, test/research-voice.test.ts.
Interface: renderer bridge setActive({sessionId,active}), start/stop/cancel({sessionId,requestId}), subscribe(callback). Responses {ok,error?}; all events carry sessionId.

- [x] 测试跨窗口/子框架拒绝、陈旧请求拒绝、final去重、会话退出取消。
- [x] 实现主进程所有权及原生事件校验，preload订阅清理。
- [x] 跑 focused bridge tests。

## Task 3: 工具栏与容器

Files: conversation client patch, test/sherlock-composer-workspace-ui.test.ts.

- [x] 测试开始/结束/取消、partial/level、final去重及卸载不执行。
- [x] 添加 ResearchVoiceControl，绝对定位波纹条并显示真实转写。
- [x] 非空final调用 createContainerDraft → startContainerGeneration；保留指令与现有任务权限。
- [x] 重建 patch-package 并跑直接相关 UI 测试。

## Task 4: 打包和验收

Files: package.json, main/preload入口, build/macos语音权限、原生资源规则。

- [x] 加入 build/native资源和 Info.plist 隐私说明、音频 entitlement。
- [x] 聚焦测试、typecheck、原生编译；独立审阅取消/权限/重入风险。
- [x] 创建中文本地提交，运行 ./script/build_and_run.sh --verify 和完整包检查。
- [ ] 验证真实工具栏、权限、Fn/录音与组件执行；明确未能获得真实音频的验证边界，保持应用打开。

## 验证记录

281 项相关 Vitest 通过；12 项原生无权限测试通过；TypeScript 检查通过。Electron 43.4.0 加载生产原生模块成功，arm64/x64 编译成功。审阅发现识别条原生画布手势冲突，已以失败用例复现并修复，验证文字滚动、框选与 Space 平移隔离。

真实 Electron 验收发现 WebFrameMain 标识来自原型 getter，展开对象会丢失标识，已改为显式读取并补回归测试。签名包已展示完整主界面、原有工作区和会话，以及新增语音入口。真实界面确认空轨迹可进入，创建容器后仍可切换对话、轨迹，再返回研究时容器保留。

真实麦克风请求已到达 macOS TCC 并进入 AUTHREQ_PROMPTING；麦克风 entitlement 和两项权限说明已检查。系统权限窗口被控制工具禁止操作，已请用户手动允许。真实音量/转写/最终指令生成组件仍待用户授权后验收，不能以模拟事件测试代替。工具不支持 Fn 键输入（keyNotFound），实体键盘双击 Fn 及系统听写冲突仍待人工验收。原生测试已覆盖 Fn 双击、组合键和失焦复位。

最终审阅补充：激活未完成时再次点击语音或收到 Fn toggle，直接取消请求，避免发送无效 start/stop；IPC 仅传 sessionId/requestId。权限等待文案明确提示用户允许麦克风与语音识别。授权流程因长时间失焦取消后，用户允许权限可重新点击语音开始。

## 界面收简验收

用户要求参考简洁的语音输入交互，已在 33e44b53 将大面板改为 44 像素高的“取消／波形／完成”胶囊，移除可见标题、说明、转写块和文字操作按钮。8 项语音 UI 聚焦测试与类型检查通过；重新运行本地构建启动和完整签名包检查，包内 conversation client 与工作区一致。

实际客户端确认新的胶囊外观、进入聆听、前台重试、取消收起和无语音错误恢复正常。此前等待的系统权限现已允许。后台辅助功能点击触发重试会被前台录音校验拒绝，聚焦窗口后可正常重试，未放宽录音所有权。

两次播放测试音均在约 10 秒后无语音超时；机器扬声器静音，播放没有提供有效的扬声器到麦克风输入。因此这次未完成真实讲话转写到组件的验收，实体 Fn 双击也仍待人工验证。未修改系统音量或隐私权限，客户端保持打开。

## 无人在场时的自动验收

用户要求自行测试，并补充 MacBook 处于合盖状态。通过系统设置确认输入仅有内置麦克风和 Splashtop 虚拟设备，没有外接麦克风。Apple 的硬件断麦说明确认 Apple silicon 笔记本合盖会关闭内置麦克风（https://support.apple.com/en-gb/guide/security/secbbd20b00b/web），因此不能把合盖时的无语音结果认定为识别器故障。

曾临时把内建扬声器从静音/0 调到非静音/30% 播放本地测试音；收到合盖信息后，通过系统设置恢复并复核输出音量为 0、静音为开启。输入设备和隐私权限均未更改。

本轮聚焦检查：`node scripts/test-research-voice-native.mjs` 12/12 通过；`npx vitest run test/research-voice.test.ts test/sherlock-composer-workspace-ui.test.ts -t 'ResearchVoice|research voice|Research voice toolbar'` 30/30 通过，218 项无关测试跳过。

后续执行链以手动文本输入隔离验证，不能冒充语音端到端通过：在真实客户端的容器输入“创建一个六十秒倒计时，包含开始、暂停和重置按钮。”，真实生成任务完成，沙盒组件显示“60 秒倒计时器”。开始后从 60 递减到 54，暂停显示“已暂停”，重置恢复 60/“准备就绪”。已有生成组件时，对话、空轨迹、研究切换正常，返回研究后组件保留。客户端和测试组件留在研究画布，录音未启用。

仍未覆盖的硬件边界：真实麦克风收音/语音转写，以及实体 Fn 事件进入 AppKit 监听器和与系统听写的交互。现有原生测试只证明 Fn 状态机和生命周期；未安装驱动或绕过硬件断麦。
