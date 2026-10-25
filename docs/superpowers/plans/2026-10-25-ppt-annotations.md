# PPT 标注修改实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Figma 标注、原生输入备注与真实模型修改新PPT文件连成可用流程。

**Architecture:** 只读标注覆盖现有连续预览；实际会话的原生输入协调器管理引用与显式备注范围；可信Main服务保存标注、验证文件版本、准备不可变输入/manifest与独立输出。正常当前模型经现有PPT技能执行，真实交付链验证并打开结果。

**Tech Stack:** TypeScript、React、Electron trusted IPC、既有PPT scene/parser、SessionInputShell、当前managed skill provider；不加依赖。

**Spec:** `docs/superpowers/specs/2026-10-25-ppt-annotations-design.md`（批准依据为用户明确执行请求与最终Figma状态；/tmp同名草稿已独审，正式文档在batch10构建门禁通过后进入feature）。

## Global Constraints

- 默认快速预览，不在默认渲染或标注读取时申请editToken/触发自动保存。
- 保留当前输入框控件、模型选择、技能/附件机制和全局提示词。
- 标注不写PPT；当前owner/实际sending会话/真实文件版本经Main复核。
- 拒绝陈旧回调、越权或版本失配；失败留稿，重试不覆盖后写草稿/已交付文件。
- 只从干净本地main构建正式身份客户端，跳过公证/上传/版本变更/push；只运行直接相关检查。

## Review Focus

- 真实Main/isolated世界之间只传JSON，不传DOM或用Office伪会话名替代中央身份。
- 空备注、中文IME、多行、跨范围删除/撤销后保持整体提示词与其他附件不丢。
- viewer懒页卸载、缩放、窄栏及同一标记重复点击仍可准确重定位。
- 保存后文件被用户另改或授权撤销时不得沿用旧坐标，候选结果保留且说明状态。
- prepare重传与实际AI重试分开，真实提交/assistant交付必须绑定同一个prepared，不能以文本声称完成。

---

### Task 1: 可信标注状态与版本准备（D）

**Files:** create `src/shared/pptx-annotations.ts`、`src/main/pptx/annotations.ts`（必要独立store）；modify `src/main/pptx/service.ts`只读文件授权复用、`src/main/index.ts`/`src/preload/index.ts`注册段；test `test/pptx-annotations*.test.ts`。

**Interfaces:** spec的open/mutate/prepare/complete/cancel及判别source/locator/mark；公开bridge `window.sherlockPptAnnotations`。真实提交绑定扩展必须在实际native回执seam确认后和B锁同一签名。多doc输出映射、typed冲突结果，少量内部文件访问helper不暴露给renderer。

- [x] 写真实PPT fixture RED：跨owner/session/撤权/symlink/越界region/CAS拒绝；不产生editToken、不改原件。
- [x] 实现只读scene/页尺寸、持久标注、稳定编号/删除恢复、原版本陈旧判断。
- [x] 写prepare RED：两文件/跨页、同send重传幂等、不同fingerprint拒绝、snapshot hash精确、输出排他、cancel晚回执无效。
- [x] 实现batch快照/manifest/attempt，以及complete内容part差异、有效ZIP/scene、源hash、partial结果与版本记录。
- [x] 跑直接新测试与必要旧service smoke、类型检查，独审后仅本scope中文提交。

### Task 2: 原生输入协调器和发送事务（B）

**Files:** create `scripts/lib/pptx-annotation-input.mjs`及直接browser/unit tests；必要纯数据helper单独文件。原生InputShell的补丁通过新patch函数，禁止直接修改node_modules作为交付。

**Interfaces:** 安装main-world coordinator到明确Symbol；`open(source,{signal,viewerKey})`返回getSnapshot/subscribe/add/select/updateComment/remove/readd/undo/dispose，snapshot含scene/basis/marks/selectedId/revealSeq/revision/stale/busy/error。消费D bridge；注册source `pptx-annotation`与真实sending shell特殊serializer。

- [x] 写real原生shell RED：原整体要求+其他skill/file refs、2页mark，两侧备注同步，IME/多行、tag选中键删与原子undo。
- [x] 实现UTF16 owned-range模型与nativeCAS，明确区间/分隔亲和；ambiguous跨范围编辑留普通文字，不做语义猜测。
- [x] 对照实际native提交源码锁prepared→提交回执→assistant交付关联，写RED证明不同turn/迟到reply不能complete；send前批量prepare一次，await后重核身份与draftRev。
- [x] 接入真正managed PPT skill（无replace），真实上下文为文件快照/manifest/独立输出映射；普通selected模型路径保持。
- [x] 实现失败重试/恢复与session切换/关闭重开；直接tests+类型检查，独审后中文提交。

### Task 3: Figma预览标注与紧凑标签视觉（C）

**Files:** modify `scripts/lib/pptx-editor-ui.mjs`、`scripts/lib/sidebar-pptx-toolbar.mjs`、`scripts/lib/figma-inline-references-client.mjs`/`src/preload/figma-inline-references.css`；create viewer annotation helper、本地Figma静态assets、直接renderer tests。不改Task2协调器/Task1service。

**Interfaces:** 消费Task2handle，不从Office.scope构造sending身份；通过原onToolbarState/Controls增加标注切换，安全setMode预览，source owner拒迟到。

- [x] 以已保存HF上下文/截图和现有组件建立静态asset slot清单；仅新图标按Figma指示curl本地下载，原生完全相同图标复用。
- [x] 写真实连续viewer RED：点/框、normalized定位、跨页/缩放/重挂/窄栏；默认与标注都零editToken。
- [x] 实现顶栏标注icon、下排工具栏、pin+简洁bubble；同mark重选revealSeq定位，close/Esc只关闭。
- [x] 给原生reference投影加数字pin/HUG及selected/键盘委托；不另造编辑框或空格撑宽。验证浅/深标签文字/圆角/气泡可见与HF一致。
- [x] 跑直接新tests/相关原模式回归与类型检查，资产文件/slot/callsite/实际geometry逐项验证，独审中文提交。

### Task 4: 安装链与真实交付核验（Root）

**Files:** `scripts/patch-web-frontend-loading.mjs`及所需Office installer薄接线、native delivery gate helper与direct tests；更新本spec/plan进度。

- [x] 安装新coordinator和viewer helpers，使用现有严格anchor/idempotence规则，不能宽松跳过失配。
- [x] 对精确prepared/真实提交关联的交付文件做complete gate，等待/失败/partial提示与原卡结构一致；成功仍用正常file open而非新预览器。
- [ ] 运行两遍pipeline及集成范围direct tests/tsc/diff，review source权限、取消、跨世界与资产。
- [ ] PlanA新批次handoff/preflight/create/merge/check/accept/promote，仅当前授权scope进入main。

### Task 5: 正式客户端闭环（Root）

- [ ] 读当前模型任务guard及用户最新theme偏好，按runbook clean main `./script/build_and_run.sh --verify`，完整包检查；真实主界面/旧数据在且应用保持打开。
- [ ] 专用真实PPT副本做跨页点框、两侧备注、标签删除恢复、滚动缩放/关闭重开，检查全局要求保留。
- [ ] 原生发送当前真实模型使用真实PPT技能；等真实文件生成，核原件hash不变、两页实际内容改变、Office有效且真实交付卡点击打开新预览；新版本旧定位stale且可重标。
- [ ] 实际再验PPT教程上滑→技能→附件→prompt→生成→虚拟点击交付卡；Notes完成→对话→新对话新id，旧笔记/任务留存；Board保留既有真实数据布局与智能容器演绎。
- [ ] 记录证据及未复现的系统鼠标问题，全部要求做到后才结束goal。

## 源码阶段证据

2026-10-25：Task1–3 与安装/交付薄接线已分 scope 中文提交并独立审查（e4f7c1e8、41c74ce3、adc43df1、073b6a80、bd3349c4、f42c9271、ea8ecfc2、e55626a2、be8b4400）。聚焦服务/真实 renderer 检查覆盖可信权限、原生提交关联、不可变首次接受 SHA、UTF16 备注、冷恢复和显式重定位。所有模拟器/浏览器夹具证据仅是源码阶段验证；本计划 Task5 的正式客户端、真实模型修改与原生 PowerPoint 结果验收仍未完成，不据此关闭目标。
