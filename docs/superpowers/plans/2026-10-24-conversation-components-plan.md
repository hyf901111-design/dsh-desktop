# EWork 对话内原生组件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主智能体直接提交成品 artifact/native spec，在当前对话回复尾呈现可刷新、引用、复制和保存库的原生组件，并可粘贴研究/笔记。

**Architecture:** 沿现有 `client_capabilities` / `client_action` 增加 `conversation.components.create`，Host 用当前可见会话身份验证和保存独立组件实例，成功 receipt 携带持久 manifest。UI 在真实 tool receipt 对应的 turn 尾挂卡，正文复用 `FinancialWidget` / `ResearchContainerBody`，不创建隐藏 canvas。主智能体负责实际 artifact 内容，不默认子智能体生成。

**Tech Stack:** 既有 Electron main/preload、TypeScript、ESM runtime packages、React 18、stringified UI patch modules、Vitest；无新增第三方依赖。

**Spec:** [docs/superpowers/plans/2026-10-24-conversation-components-spec.md](docs/superpowers/plans/2026-10-24-conversation-components-spec.md)。所有执行 owner 开始前读 spec 和本计划。

## Global Constraints

- 功能源码在隔离worktree开发，正式客户端由Root从干净main集成后构建；各owner不操作客户端。
- 后续实施仓库：`/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/.worktrees/home-card-replace-layout-20261023`，分支 `codex/feat/conversation-components-20261024`；开工先确认当前 HEAD/working tree 与交接。
- `conversation.components.create` 只收已完成 artifact/native spec，不收 prompt 代生成，不默认子智能体，不授予模型指定 owner/session/turn/mode 的入口。
- 只使用现有数据服务与模板；场外基金不能作为股票 quote；真实获取时间、数据时点、保存时间分开。
- header 为适用时刷新/标题/引用到对话/更多；无 close；footer 只 source/time，无 ports、无已连接组件数。
- 复制只写剪贴板，不 duplicate；研究/笔记粘贴生成独立新 ID；保存库在 Host 回读实例。
- 不开放 conversation 的 canvas capability，不写隐藏研究画布，不恢复 parked 实验。
- 仅相关 focused tests 与 typecheck；不运行 `npm test` 或全功能单元测试。
- 每项实现完成并通过聚焦验证后建立中文本地提交，显式列出本次文件，避免混入其他 session；推送/正式发布遵从既有授权与运行手册。
- 功能 worktree 不构建/替换共享客户端；后续真实验收从项目约定的集成 main 按 runbook执行。

## Review Focus

1. bare-component 请求同时退出旧 tools filter/guard/prompt/4096 token cap；否则主智能体完整 artifact被隐藏画布路由或截断。归 Task A。
2. Host写盘成功但响应丢失/重启：同requestId返回原实例，同ID不同payload明确冲突；不串owner/session/turn。归 Task B。
3. native数据在改周期/标的后晚到、quotes/history并行返回：旧revision不得覆盖，真实时间不被createdAt或模型asOf替代。归 Task B，C验证可见结果。
4. 正文文字选择、输入框/iframe/menu焦点、复制键盘和native copy重复事件：继续正常文字复制；卡复制不duplicate。归 Task C。
5. 持久tool receipt、同turn多组件、steering、重载历史、无最终文字：卡保持正确回复归属；引用解析传真实内容而不是仅symbols。归 Task B/C。

---

## 文件结构和所有权

以下路径相对实施仓库。新文件名称为冻结的交接接口；每个 owner 只修改自己范围。

### Task A：runtime policy / capability /共享合同 owner

创建：

- `packages/dsh-research-task-runtime/conversation-component-contract.js`
- `packages/dsh-research-task-runtime/conversation-component-contract.d.ts`
- `packages/dsh-research-task-runtime/conversation-components-policy.js`
- `test/conversation-component-contract.test.js`
- `test/conversation-components-policy.test.js`

修改：

- `packages/dsh-research-task-runtime/client-capabilities.js` / `.d.ts`
- `packages/dsh-research-task-runtime/client-capability-host.js` / `.d.ts`（仅必要的 injectable handler 类型）
- `packages/dsh-research-task-runtime/workbench-execution-policy.js`
- `packages/dsh-research-task-runtime/index.js`（包内 policy 注册，不是应用入口接线）
- `src/main/state/client-capability-service.ts`（注入 B 的 adapter 与真实身份闭包）
- `test/client-capabilities.test.js`
- `test/client-capability-service.test.ts`
- `test/workbench-execution-policy.test.js`

### Task B：Host store / IPC / clipboard / library owner

创建：

- `src/main/state/conversation-components.ts`：持久store。
- `src/main/conversation-components/service.ts`：create/native query/reference/copy/library adapter。
- `src/main/conversation-components/ipc.ts`：trusted handler installer。
- `src/preload/conversation-components.ts`：frozen bridge factory。
- `test/conversation-component-store.test.ts`
- `test/conversation-component-service.test.ts`
- `test/conversation-component-ipc.test.ts`

修改：

- `src/main/state/research-canvas-clipboard.ts`
- `src/main/state/component-library.ts`
- `test/research-canvas-clipboard.test.ts`
- `test/component-library-store.test.ts`
- `test/notes-component-library.test.ts`（native再添加支持的直接回归）

### Task C：UI renderer / reference owner

创建：

- `scripts/lib/conversation-components.mjs`
- `scripts/lib/conversation-components.css`
- `scripts/lib/conversation-component-reference.mjs`
- `test/conversation-component-renderer.test.js`
- `test/conversation-component-interaction.test.js`
- `test/conversation-component-reference.test.js`

修改：

- `scripts/lib/financial-widget-client.mjs`：可选 surface/dataProvider。
- `scripts/lib/research-grid-ui.mjs`：若抽复用header，限显式surface参数，不改研究菜单语义。
- `scripts/lib/custom-component-library.mjs`：与Host一致的 native financial保存库predicate。
- 现有 `financial-widget-client/refresh/menu` 直接相关测试（有必要时）。

### Root：唯一应用接线 owner

只由 Root 修改：

- `src/main/index.ts`
- `src/preload/index.ts`
- `scripts/patch-web-frontend-loading.mjs`

Root按三模块给出的API接线，统一处理初始化顺序、installer调用和UI patch顺序。其他owner不改这些文件，不各自插入相似全局store或第二条IPC通道。

## 固定跨模块接口

1. A 提供 spec §4 的 canonical `.js/.d.ts`合同，包括 `normalizeConversationComponentArtifact`、`canonicalConversationComponentInput`、`parseConversationComponentManifest`、`parseConversationComponentReference`、`detachConversationComponentNode`。
2. 以下共享 identity / adapter interface 由 A 声明在 canonical `.d.ts`；B 实现它们并提供后列 service/installer/factory，不能在自己的模块重复定义同名但不同形状的类型：

```ts
// 类型只在A的canonical合同定义，此处列出便于独立owner实施。
export interface ConversationComponentExecutionIdentity {
  ownerAccountId:string;
  sessionId:string;
  turnId:string;
  mode:'conversation';
  authorityId?:string;
  authoritySeq?:number;
  windowGeneration:string;
  current():boolean;
}

export interface ConversationComponentCapabilityAdapter {
  create(
    args:ConversationComponentCreateArguments,
    identity:ConversationComponentExecutionIdentity,
    signal:AbortSignal,
    requestId:string
  ):Promise<ConversationComponentCreateReceipt>;
}

export function createConversationComponentService(options:{
  store:ConversationComponentStore;
  owner():string;
  canReadSession(sessionId:string):boolean;
  currentVisibleContext():ConversationComponentVisibleContext|undefined;
  nativeQuery(query:JsonObject):Promise<JsonObject>;
  clipboard():ResearchCanvasClipboard|undefined;
  library():ComponentLibraryStore|undefined;
}): ConversationComponentCapabilityAdapter & ConversationComponentUiService;

export function installConversationComponentHandlers(options:{
  ipcMain: unknown;
  getWindow():TrustedWindow|undefined;
  service:ConversationComponentUiService;
}):()=>void;

export function createConversationComponentsBridge(
  invoke:(channel:string,...args:unknown[])=>Promise<unknown>
):ConversationComponentsBridge;
```

3. A 在 `ClientCapabilityService.Options` 增加可选 `conversationComponents` adapter；仅 conversation mode 创建handler，closure注入identity，不把caller提供的对象强制cast成可信identity。`windowGeneration` 是service内部实际 binding generation。A另提供 `ClientCapabilityService.currentVisibleContext()`，只读返回已核验owner/window/expiry的当前VisibleContext；B的UI service通过Root注入callback读取，不能依赖renderer自报当前会话。
4. B 负责 concrete `ConversationComponentUiService` 的 read/updateNativeSpec/queryNative/copy/saveLibrary/reference/resolveReference；DTO与 spec 共享合同一致。
5. C 提供 `patchConversationComponents(source:string):string`，内部依次安装同一模块的 helpers、CSS、reference codec和ChatView插入，marker为 `/* ework:conversation-components:v1 */`；patch缺唯一锚点时明确失败，不默默跳过。
6. C 的 `FinancialWidget` 可选 props为 `surface?:'research'|'notes'|'conversation'`、`dataProvider?:{request(query:JsonObject):Promise<JsonObject>}`，默认保持旧行为。`onSpecChange(expected,next)`继续现有形状；聊天wrapper在closure附当前View.revision并CAS。

---

## Task A：使主智能体在正确模式直接提交成品组件

**Deliverable:** 能查询到严格的 conversation create capability；主智能体已有完整artifact时直接提交；裸组件语义不再被研究planning工具和4096预算截断；研究工作台路径仍正确。

**Interfaces:** 消费 B 的 `ConversationComponentCapabilityAdapter` 注入点；产生共享合同和成功 receipt的精确schema。无需B实际模块完成即可用fake adapter验证授权。

- [ ] **A1：先写合同测试并确认失败。** 覆盖完整 table/chart artifact规范化、native quote配置、template retained model、精确normalizer返回字段与Host填ID分工、invalid/超限/未知键/identity/prompt/recipe拒绝、合法spec不允许模型价格数组、canonical key排序一致、manifest/reference严格解析、detach去跨卡link且不改symbols。测试fixture均标模拟数据。

  Run: `npx vitest run test/conversation-component-contract.test.js`
  Expected: 因新模块缺失而失败；不把import路径错误当最终实现验收。

- [ ] **A2：实现并冻结共享合同。** artifact走现有 `acceptArtifactOutput` / parser；native partial输入以既有 defaults补正常配置，再由financialWidgetSpec严格校验。标准化不得联网、启动任务、写盘或填造数值。title长度1–120；输入UTF-8上限1 MiB。按spec§4，规范化后仅接受 financial-widget/chart/table/kpi/markdown/html/mind-map/summary；明确拒绝 files/gallery/calendar-tool/web/iframe/audio/youtube。derived source去nodeId并只留冻结title/text；不能因parser接受路径便授予本地文件/日历权限。

  Run同A1，Expected: PASS。交给Root/A/B/C同一合同摘要和导出名，先建立中文小提交 `定义对话组件共享数据契约`。后续A与B/C可并行，合同字段不各自改名。

- [ ] **A3：写mode与policy失败测试。** 以真实工具事件结构造catalog回执：裸component+unknown只要求先catalog且不压4096；conversation允许full artifact和数据工具；research沿旧planning；explicit工作台沿旧路径；notes不调用conversation能力；旧轮次/伪造assistant text/错误callId/失败tool结果不能确立mode；steering后catalog失效。额外断言guard和wire tools一致，并拦截conversation bare请求误用research_workbench_create。

  Run: `npx vitest run test/conversation-components-policy.test.js test/workbench-execution-policy.test.js`
  Expected: 新期望在实现前失败，原有研究工作台测试仍提供回归基线。

- [ ] **A4：实现路由与主智能体指令。** 新helper仅从当前authority之后的成功catalog读取mode；同一轮dependent调用分步执行。按spec路由同时调整classifier/prompt/agent-request cap/guard/wire tools；正常股票问答不进入planning。新policy说明主智能体直接提交artifact、根据问题自主用卡、不默认子智能体、不将OTC基金变股票。包内注册放runtime `index.js`；dispose对应释放。

  Run同A3，Expected: PASS；增加fake `startSubagent` spy断言该能力路径调用数0。

- [ ] **A5：写并实现capability/Host lease测试。** only mode conversation + editable +实际handler available；模型identity/未知key拒绝；subagent沿现有client tools拒绝；Host closure传真实owner/session/turn/authority/generation；mode/window/owner切换取消旧lease；create本身不导航。fake B adapter接收完整artifact，回传saved effect+manifest，保持现有client_action幂等回执语义。

  Run: `npx vitest run test/client-capabilities.test.js test/client-capability-service.test.ts test/conversation-components-policy.test.js test/workbench-execution-policy.test.js test/conversation-component-contract.test.js`
  Expected: PASS。若需要改 `.d.ts` 同步，不添加ts-ignore。

- [ ] **A6：检查并交接。** `git diff --check`；复核无 main/preload/installer入口变更；提交实际A文件，中文提交 `支持主智能体在对话中提交原生组件`。交接清单含commit、导出名、tests、capability/schema和一个ready receipt fixture给B/C/Root，不声称真实客户端验收完成。

## Task B：保存独立实例，完成数据、复制和库的Host闭环

**Deliverable:** 重启不丢失的Host store、真实身份创建、native可验证查询/observation、读取/引用/复制/保存库的trusted IPC，以及研究/笔记可接受的严格clipboard格式。

**Interfaces:** 消费A canonical合同。产生上节 B adapter、service、installer、preload factory；不修改三个应用入口。测试使用真实临时目录和fake native数据服务，不访问真实账户数据。

- [ ] **B1：写store失败测试并确认失败。** create同键同payload返回同实例；同键不同payload冲突；不同owner/session/turn隔离；序列化mutation无重复ID；模拟写盘成功但无调用方ack，新store.load后重试仍原ID；重载保持artifact/manifest；无效文件不覆盖；1MiB/128每session/1024总数/64MiB各边界错误不截断或清旧历史。

  Run: `npx vitest run test/conversation-component-store.test.ts`
  Expected: 因store未实现而失败。

- [ ] **B2：实现store原子持久化。** 内部identity由create service传入，store保存dedupe ledger与item同一原子快照，SHA256输入来自A canonical function。private state保存owner，publicView不暴露credentials或请求配方。read按owner/session/id核验。native update CAS且同widget；配置revision仅随spec改变，observation不递增。改配置时失效旧observation和旧provenance成功状态；失败不修改旧node/provenance。

  Run同B1，Expected: PASS。

- [ ] **B3：写并实现capability service与native查询测试。** fake identity.current切换/取消阻止新写入；写盘已完成的receipt诚实返回saved。native query只接受当前实例spec允许的symbols/source/period/adjustment/action；金融取数复用options.nativeQuery；quote/history同specRevision并行merge；observation保存specRevision/query signature，改标的后resolveReference不得引用旧股票；旧revision/取消后的晚到结果不抹新配置；失败保留上次成功。native observation用真实source/receivedAt/asOf；static provided来源不升级为observed，createdAt不进入fetchedAt。

  Run: `npx vitest run test/conversation-component-service.test.ts test/conversation-component-store.test.ts`
  Expected: PASS，spy断言无canvas调用、无子任务。

- [ ] **B4：写并实现reference与IPC边界测试。** trusted主窗口可read有效owner/session；子窗口/错误origin/未知id/跨owner/session拒绝。reference返回ID/title/revision；resolveReference接收{sessionId:真实keyboard会话,reference}，将发送session、reference.session与Host currentVisibleContext三者及owner/window/lease核验一致，拒绝同owner跨会话chip；resolve回读最新有效实例，native使用真实observation或实际query，失败明确缺数据，不只传symbols宣称行情已引用；普通artifact优先用retained template readable model。解析文本是资料不是可执行指令；bounded payload超限要明确报错或使用明确标注范围的摘要，不静默伪称完整。

  Run: `npx vitest run test/conversation-component-ipc.test.ts test/conversation-component-service.test.ts`
  Expected: PASS。IPC channel固定为 `conversation-components:<method>`，只注册合同七个方法；factory不暴露任意channel调用给renderer。

- [ ] **B5：扩展clipboard金融strict parser并写真实copy/read测试。** 合法financial spec可copy/read，非法price/script/未知字段拒绝；脱离linkedWatchlistId/linkedSourceId/任务/原消息权限；原始symbols/period/indicators/来源保持；使用opaque envelope不是向系统剪贴板写凭据。调用Host copy后只有clipboard变化，无paste/canvas mutation。验证复用研究paste所需x/y/id/kind均正常，笔记library parser能读取native。

  Run: `npx vitest run test/research-canvas-clipboard.test.ts test/conversation-component-service.test.ts test/notes-component-library.test.ts`
  Expected: PASS。

- [ ] **B6：保存库native配置。** `ComponentLibraryStore` host predicate对valid financial-widget开放，`snapshot`使用detach和strict parser，清外部link、保留配置；conversation save service按target回读后调用library.add。旧research `save`入口保持旧参数行为，不能renderer自由上传node。custom recipe同owner规则不改变。测试保存→list/read→noteLibraryNode→新ID且配置独立；非法spec失败不污染库。

  Run: `npx vitest run test/component-library-store.test.ts test/notes-component-library.test.ts test/conversation-component-service.test.ts`
  Expected: PASS。

- [ ] **B7：实现preload factory并交接。** bridge用 `Object.freeze`，typed DTO同A合同，所有invoke方法固定；不在index.ts直接接线。给Root准确factory/installer imports和initialization options；library用callback避免初始化顺序循环，clipboard/nativeQuery沿现有对象引用。

- [ ] **B8：focused验证与中文提交。** 合并运行B上述新增/修改测试文件一次，`git diff --check`。显式提交本次B文件，中文提交可拆 `持久化对话组件并校验宿主身份`、`打通对话组件复制与组件库复用`。提交前检查未混A/C正在编辑文件；交接commit/tests以及一个store→bridge publicView fixture给C/Root。

## Task C：在回复尾呈现原生卡片并完成引用与快捷键

**Deliverable:** 正确归属的回复尾组件、同款正文、无close/ports的chrome、可用菜单、native配置保存及refresh、引用chip和跨模式copy操作。UI模块不依赖隐藏canvas、研究workspace selection或人工创建DOM替代产品状态。

**Interfaces:** 消费A合同与成功receipt fixture、B typed bridge/publicView fixture；初期用fake bridge独立实现，不修改三个应用入口。`patchConversationComponents`由Root最后调用。

- [ ] **C1：写receipt挂载失败测试。** 只从真实 `client_action` 的成功 `conversation.components.create` receipt中提取manifest，effect/manifest/componentId/turn一致；assistant文字中相同JSON不触发；失败/无saved/未知版本忽略。验证同turn两卡、重复receipt、history reload、steering/下一轮、没有final text的turn仍稳定锚点，不跨session。

  Run: `npx vitest run test/conversation-component-renderer.test.js`
  Expected: 新模块缺失时FAIL。

- [ ] **C2：实现独立metadata reader和ChatView patch。** 复用workbench receipt锚点算法的结构，独立marker与函数名；从store.read拿最新View而非把receipt当正文。按instanceId稳定key，取消过期read，owner/session切换清selection和临时menu。模块注入点在native helpers和notes/financial helpers之后；patch source缺唯一锚点要throw。不要改 AssistantBlock union。

  Run同C1，Expected: PASS；加 `patch(patch(source))===patch(source)` 的幂等断言及目标helpers只出现一次。

- [ ] **C3：写并实现native/body surface和chrome测试。** financial→FinancialWidget({surface:'conversation',dataProvider,onSpecChange})，其余→ResearchContainerBody；默认研究/笔记路径不变。title顺序refresh/title/reference/more；静态无refresh；DOM无close/port/连接数/画布拖拽handle，popover/menu只显示有handler项。native已有footer与wrapper不能重复。保留可读字号、表格横向滚动、主题及合理高度。

  Run: `npx vitest run test/conversation-component-renderer.test.js test/financial-widget-client.test.js test/financial-widget-refresh.test.js test/financial-widget-menu.test.js`
  Expected: PASS。只在相关fixture新增surface/provider上下文，不重写其他组件设计。

- [ ] **C4：实现native CAS与真实刷新。** 控件调用现有 `onSpecChange(expected,next)`，wrapper持当前View.revision调用updateNativeSpec，成功替换View、失败保留旧状态并给错误；不能走financialWidgetSinks。query dataProvider附componentId/session/revision，沿B bridge。刷新状态由现有FinancialWidget/provider的实际结果推进，snapshot无刷新假成功，native失败旧数据/time保留。

  Run同C3，增加provider spy：查询条件来自current spec，默认研究路径仍调用原bridge，旧数据加载不跨instance。

- [ ] **C5：写selection/menu/Cmd+C失败测试并实现。** 点击外框选中，图内控件保持交互；没有文本selection且当前卡拥有focus时拦Cmd+C/native copy，去重事件；input/textarea/contenteditable/iframe/menu/dialog与正文选区不拦。点击外部/切session清selection；菜单“复制”只调用bridge.copy，“保存到组件库”只调用bridge.saveLibrary；两者成功/失败可见反馈。host/client library predicate对native一致。

  Run: `npx vitest run test/conversation-component-interaction.test.js test/custom-component-library-client.test.js test/financial-widget-menu.test.js`
  Expected: PASS，spy明确断言 `pasteClipboardNodes` 和canvas mutation均0。

- [ ] **C6：写reference失败测试并实现独立codec。** source名 `conversation-component`，registration沿既有 `inputScope.inputTriggers.registerSource`；Button→bridge.reference→当前SessionInputShell.insertReference；保留草稿/图片/selection并focus、不发送。serialize阶段调用resolveReference({sessionId:keyboardSessionId,reference})并明确资料边界，不直接拼artifact代码；跨session/ref/version非法拒绝；不可用时保留用户draft并提示。reference不是research-artifact id，不依赖researchOnly选择列表。

  Run: `npx vitest run test/conversation-component-reference.test.js test/conversation-component-interaction.test.js`
  Expected: PASS。

- [ ] **C7：纯patch与回归检查、中文提交。** 一次运行C上述测试及 `test/research-workbench-feedback.test.js` / `test/research-canvas-clipboard-ui.test.ts` 的直接关联测试，`git diff --check`。不启动UI、不构建。显式提交本次C文件，中文提交 `在对话回复中展示可复用原生组件`、`支持对话组件引用复制与快捷键`；交给Rootpatch install顺序、fake bridge fixture与已验证限制。

---

## Root接线与组合验收（实施结束时执行，当前不执行）

只有Root负责以下共享入口，避免多owner争抢：

- [ ] **R1：合并三个owner的已验证模块合同。** 检查A/B同一identity interface、receipt envelope、method names、normalized spec；C不使用伪canvas身份。独立review三份diff，不混入PPT或其他session文件。
- [ ] **R2：在 `src/main/index.ts` 接线。** load conversation store → create service callbacks（owner/canRead/currentVisibleContext/native financial data/clipboard/library）→ install trusted IPC；在ClientCapabilityService options注入同service。使用现有financialWidgetData对象，必要时把capability service初始化推后或用callback，不实例化第二套金融backend。app退出dispose handlers。
- [ ] **R3：在 `src/preload/index.ts` 接线。** 创建frozen `window.dshDesktop.conversationComponents` bridge；保持已有notes和researchClipboard桥不改语义。
- [ ] **R4：在 `scripts/patch-web-frontend-loading.mjs` 最后适当位置调用 `patchConversationComponents`。** 必须在FinancialWidget/ResearchContainerBody/notes/native/input source/ChatView既有workbench patch都安装后。同一source连续patch两次一致；不直接手改node_modules来代替持久patch。
- [ ] **R5：聚焦组合验证。** `npm run typecheck`；一次运行本计划新增test文件与实际修改到的既有直接测试，不运行全套。执行 `git diff --check`，复核scope没有PPT并发候选、无版本递增/上传/发布修改。Root建立中文本地接线提交。
- [ ] **R6：按多session integration runbook交接、预检、集成到本地main。** 当前PPT正式修复必须先完成其既定集成构建；本计划本身不占用/替换共享客户端。具体集成base与clean gates由当时现场核验，不把本文勘察SHA当永远有效。
- [ ] **R7：在符合local-test-runbook的集成main执行本地构建与真实可见验收。** 使用项目规定的 `./script/build_and_run.sh --verify`，明确跳过公证，保持应用打开；不上传Cloudflare、不改公开更新源、不递增版本、不推源码或tag。功能worktree不执行共享client构建。
- [ ] **R8：真实产品路径验收并记录证据。** 股票自然问答主动native卡；明确table/chart成品；场外fund真实来源与NAV/report日期；header/footer/主题；刷新成功和失败旧值；引用保留草稿且模型得到真实数据；菜单copy与Cmd+C分别粘研究/笔记；保存库再添加两模式；修改周期不串实例；重开会话/客户端重启保持。失败修相关模块并聚焦重测，不用可见按钮或HTTP200代替结果。

## 执行顺序和交接规则

1. 本轮仅文档产出并保持feature干净。
2. Root确定正式PPT工作已释放集成/构建边界后，再启动实现。
3. A1–A2共享合同先做一次短交接；之后A3–A6、B1–B8、C1–C7可并行。
4. 各owner结束必须报告确切中文commit、修改文件、实际测试结果与未验证项，不能仅说“已完成”。
5. Root接线后做一次fresh reviewer检查：capability mode授权、持久幂等、manifest锚点、native source/time真实性、复制/库/引用完整产品路径。只有对应证据齐全再宣称交付。

## 文档复核

已完成一次独立只读 builder check，并修正 normalizer 返回类型、配置 revision 与 observation、引用发送会话身份、首版模板准入四处合同缺口；复核未发现新的阻断性矛盾。此结论仅针对设计/计划，不代表代码实现或真实客户端验收。
