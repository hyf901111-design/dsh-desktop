# EWork 对话内原生组件设计

日期：2026-10-24。状态：按用户已给定需求进入实施。
实施基线：`/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/.worktrees/home-card-replace-layout-20261023`，`codex/feat/conversation-components-20261024`。勘察基线 `8f58ce7b9e02b81a649ab6b4f3649b24304db907`。
证据：[只读勘察报告](/tmp/conversation-component-recon-20261024.md)。PPT修复已于main caaf0eac完成本地正式构建；本计划从该基线继续独立功能开发。

## 1. 目标与冻结决策

主智能体在用户查询股票、ETF、基金行情等内容时，可按问题判断组件是否能更清楚地表达答案；用户明确要求组件时，应直接在 AI 回复中交付相应组件。使用研究和笔记已有组件的正文、模板、交互和数据服务。用户无需进入研究模式，也无需额外创建画布。

本设计采用以下已确定要求：

- 主智能体直接提交**已经完成的结构化 artifact 或原生 financial-widget spec**；`conversation.components.create` 只负责宿主校验、持久化、返回 manifest，不默认启动子智能体，不接受 prompt 代生成。
- 首版组件附在对应回复尾部，不引入正文交错 block 协议。
- title bar 从左到右：适用时刷新、标题、引用到对话、更多；不创建关闭/移除控件。
- footer 只显示数据源和刷新/获取时间；不创建连接输入/输出节点，不显示“已连接 N 个组件”等画布关系。
- 更多操作至少有“复制”“保存到组件库”；复制按钮和选中后的 `Cmd+C` 都只复制，绝不立即 duplicate。
- 复制内容可以直接粘贴到研究和笔记，获得独立实例；保存组件库后，研究和笔记沿现有库入口再次添加。
- owner、session、turn、mode、权威人类消息及 window lease 由真实 Host 上下文写入，模型不能指定。
- 不建立隐藏 canvas，不放开 conversation 模式的 canvas capability，不伪装场外基金为股票 quote。
- 实施后仅运行直接相关聚焦验证；当前规划阶段不 UI、不构建、不修改 tracked 文件。

## 2. 采用的方案与取舍

采用“完成的 artifact → 现有 client_action 能力 → 对话实例 store → 持久 tool receipt manifest → 回复尾原生卡片”的方案。

现有 `client_capabilities` / `client_action` 已具备主会话身份、当前可见模式、authoritySeq、取消、请求幂等和真实回执。沿此扩展可避免第二套授予机制。组件正文继续使用 `FinancialWidget` / `ResearchContainerBody`；只增加对话 surface 的外框、操作和持久化 adapter。

没有采用把模型输出中的任意 JSON/Markdown fence 当成组件的方案：文本无法证明宿主已接受、保存及授予其文件/数据权限。也没有采用 `research_workbench_create` 创建隐藏画布后再搬出卡片的方案：这会保留错误的画布身份、连接、刷新和引用假设。首版不修改 AssistantBlock 核心 union，可减少主对话、共享对话和笔记投影的连带风险。

## 3. 用户流程

### 3.1 股票、ETF、基金查询

1. 主智能体理解问题，在需要时读取 `client_capabilities` 确认当前 mode 和可用能力。
2. 股票/ETF 标的代码与市场必须由用户或实际解析工具确认。单标的行情和 K 线优先提交原生 `financial-widget.quote` 配置，价格/OHLC 不由模型写进 native spec。
3. 场外基金净值、规模、持仓等使用 `financial_query` 的 fund 能力及原有 fund/table/chart 模板。日期是净值日或报告期，不能写成证券交易所报价时点。
4. 已获得真实记录的表格、图表、指标等由主智能体直接提交完整结构化 artifact，保留来源、单位、原始时点和缺失项。普通解释问答继续文字回答，不强制建卡。
5. 调用 `client_action({requestId,capability:'conversation.components.create',arguments:{artifact,...}})`。Host 完成规范化和写盘后才返回 succeeded + ready manifest。
6. UI 从本轮真实成功 tool receipt 找到 manifest，并在本轮回复尾显示组件。未保存、非法数据或权限失败不生成成功空卡。

### 3.2 后续操作

- native quote 的周期、复权、指标和标的等交互，通过 `onSpecChange` CAS 保存回该对话实例；绝不落到 canvas sink。
- 适用时刷新调用已有真实数据服务；失败保留旧内容与上次成功时间。不可刷新的静态 artifact 不显示刷新按钮。
- 引用只往当前输入框加入一个组件 chip，保留已有草稿、不自动发送。发送前由 Host 解析组件当前内容和可信数据 observation。
- 点击卡片外框/标题区域选中；输入框、按钮、图表/表格内部编辑与正文文字选择维持原行为。选中状态下 `Cmd+C` 复制当前组件；正文已有选区时继续复制正文。
- 粘贴到研究/笔记生成新 node ID，清除原对话身份和跨卡连接；普通 artifact 是独立快照，native 配置沿原数据服务独立取数。
- 保存库通过 Host 按实例 ID 回读，不让 renderer 上传任意 node 或 recipe。保存成功后发布现有组件库变更事件。

## 4. 共享合同：先冻结，再并行实现

唯一合同模块：

- `packages/dsh-research-task-runtime/conversation-component-contract.js`：跨 Host/runtime/renderer 复用的纯函数与 schema 校验。
- `packages/dsh-research-task-runtime/conversation-component-contract.d.ts`：唯一 TypeScript API 声明。Host TS 直接从相邻 `.js` 导入类型；不让打包后的 runtime 反向依赖 `src/shared/*.ts`。

Owner A 首先落下全部共享 DTO 和 Host-only adapter 类型合同；B、C 只消费，不自行创建第二套字段命名或改合同。需要变更时由单一接线 owner 协调修改这一处。

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

// 主智能体唯一写入模型；不允许 identity、prompt、recipe 或任意 IPC 字段。
export type ConversationComponentCreateArguments = {
  artifact: JsonObject;                  // 已完成、version:1 的已有 artifact
  title?: string;                        // 可选显示标题，1–120 字符
};

export type ConversationComponentManifest = {
  version: 1;
  kind: 'conversation-component';
  componentId: string;
  sessionId: string;
  turnId: string;
  requestId: string;
  status: 'ready';                       // 首版没有 prompt / generating 状态
};

export type ConversationComponentProvenance = {
  sourceNames: string[];                 // 无来源时 []，不得补猜
  sourceState: 'native-observed' | 'provided' | 'unspecified';
  fetchedAt?: number;                    // 真实 Host 取数的 epoch ms
  dataAsOf?: string;                     // 行情/净值/报告期原值，不是 fetchedAt
  refreshKind: 'native' | 'snapshot';     // 首版 snapshot 无通用刷新配方
};

export type NormalizedConversationArtifact = {
  containerSpec: JsonObject;              // 已有parser接受的spec，保留registered template model
  title: string;
  preferredSize: {width:number; height:number};
  readableText: string;                  // 可引用的正文/结构化模型，不含可执行脚本
  provenance: ConversationComponentProvenance;
};

export type ConversationComponentView = {
  id: string;
  sessionId: string;
  revision: number;                     // 配置/内容revision；observation更新不递增
  node: JsonObject;                      // research-compatible，id 同 instance id，x/y=0
  provenance: ConversationComponentProvenance;
  createdAt: number;                     // Host 保存时间，不能作为刷新成功时间
  updatedAt: number;
};

export type ConversationComponentCreateReceipt = {
  status: 'succeeded';
  effect: {kind:'conversation-component'; state:'saved'; componentId:string};
  data: {renderManifest: ConversationComponentManifest};
  message: string;
};

// IPC DTO：这些字段只定位当前用户有权访问的实例，不能赋予新身份。
export type ConversationComponentTarget = {sessionId:string; componentId:string};
export type ConversationNativeSpecUpdate = ConversationComponentTarget & {
  expectedRevision:number; spec:JsonObject;
};
export type ConversationComponentReference = {
  version:1; kind:'conversation-component'; sessionId:string;
  componentId:string; revision:number; title:string;
};

// Host 内部调用类型；只用于模块注入，绝不作为 IPC/模型参数序列化。
export interface ConversationComponentExecutionIdentity {
  ownerAccountId:string; sessionId:string; turnId:string; mode:'conversation';
  authorityId?:string; authoritySeq?:number; windowGeneration:string;
  current():boolean;
}
export interface ConversationComponentCapabilityAdapter {
  create(args:ConversationComponentCreateArguments,
    identity:ConversationComponentExecutionIdentity, signal:AbortSignal,
    requestId:string):Promise<ConversationComponentCreateReceipt>;
}

export type ResolveConversationComponentReferenceInput = {
  sessionId:string;                     // 当前真实输入框的发送会话，不从reference复制
  reference:ConversationComponentReference;
};
export type ConversationComponentVisibleContext = {
  ownerAccountId:string; sessionId:string;
  mode:'conversation'|'research'|'notes'; generation:string;
};

export interface ConversationComponentsBridge {
  read(target:ConversationComponentTarget): Promise<ConversationComponentView>;
  updateNativeSpec(input:ConversationNativeSpecUpdate): Promise<ConversationComponentView>;
  queryNative(input:ConversationComponentTarget & {expectedRevision:number; query:JsonObject}): Promise<JsonObject>;
  copy(target:ConversationComponentTarget): Promise<{ok:boolean; error?:string}>;
  saveLibrary(target:ConversationComponentTarget): Promise<{id:string; name:string}>;
  reference(target:ConversationComponentTarget): Promise<ConversationComponentReference>;
  resolveReference(input:ResolveConversationComponentReferenceInput): Promise<{title:string; text:string}>;
}
```

纯函数导出与责任：

- `normalizeConversationComponentArtifact(args:unknown): NormalizedConversationArtifact`：严格 top-level keys、大小、标题和 artifact；调用现有 artifact output/parser；不联网、不创建任务、不写盘。
- `parseConversationComponentManifest(value:unknown): ConversationComponentManifest|null`：只识别冻结字段，不能从普通 assistant 文本触发写操作。
- `parseConversationComponentReference(value:unknown): ConversationComponentReference|null`。
- `canonicalConversationComponentInput(args:ConversationComponentCreateArguments): string`：稳定 JSON serialization，Host 对该字符串计算 SHA256；浏览器纯合同不依赖 Node crypto。
- `detachConversationComponentNode(node:JsonObject):JsonObject`：为 clipboard/library 去除 cross-surface 关系；financial spec 仍经 `financialWidgetSpec` 校验。

normalizer不生成ID。Host填入 `node={id:componentId,kind:'generated-container',x:0,y:0,width:preferredSize.width,height:preferredSize.height,title,containerSpec,generationStatus:'completed',refreshMinutes:0}`。尺寸优先复用注册模板/native dimensions，其他使用620×420；UI仍受消息正文可用宽度限制，不能以缩字适配。Host独立保存readableText及provenance。

首版准入按**规范化后的containerSpec.type**精确限定为 `financial-widget | chart | table | kpi | markdown | html | mind-map | summary`。既有market/fund/news/reports/timeline/gantt/calendar/operations等结构化模板可经原renderer规范化为受sandbox约束的html。原生financial限 `watchlist | quote | indices | news | announcements`。明确拒绝 `files | gallery | calendar-tool | web | iframe | audio | youtube`，直到有对应对话授权/resource adapter；不是因为JSON parser接受就能读取本地资源或开原生工具。derived source只保留已提供的 `{title,text}`，去除nodeId，不解析画布来源ID；路径/authorization/session等额外字段沿原strict parser拒绝。上述限制必须同时出现在capability description和normalizer测试，不能运行时静默降级。

稳定序列化行为必须在合同测试中固定。不要让 renderer 获得 Host 内部 identity 实际值或 source tool 原始 credentials。

## 5. 主智能体能力与 policy 路由

### 5.1 capability

在 `client-capabilities.js` 新增 `conversation.components.create`，handler 名 `createConversationComponent`；仅 `context.mode === 'conversation'` 且 editable、主会话当前可见 lease 有效时 available。参数只使用上节 create arguments。调用已完成 artifact，因此沿现有 120s client tool 超时即可，不加生成 worker 或超长任务预算。

`ClientCapabilityService` 创建 handler 时，闭包注入真实 owner/session/input.turnId/authorityId/authoritySeq/window generation/current()。模型同名字段一律因 additionalProperties=false 被拒绝。写盘前后检查取消与 lease；写盘已成功时用已保存 receipt 确认效果，取消只能阻止后续行为，不隐藏已发生写入。

### 5.2 解决现有 planning 的冲突

必须同时改 `workbench-execution-policy.js` 的 classifier、prompt、wire tools、guard 和 `agent/request` 的 4096 token planning cap；只放行一个工具名不完整。

冻结以下路由：

| 当前需求 | 已知真实 mode | 行为 |
| --- | --- | --- |
| 明确“工作台/画布/看板/仪表盘”创建 | 任意 | 保留现有 research_workbench_create 流程，不自动改成聊天卡 |
| 单个/多个组件、表格、图表等创建，未要求画布 | 尚无本轮 catalog | 保留普通模型 controls 和正常取数工具；先顺序调用 client_capabilities，再决定目标 |
| 单组件需求 | conversation | 允许取数和直接完整 artifact → 新能力；不进入旧 planning，不压缩为4096 token |
| 单组件需求 | research | 保留当前研究画布创建方式和其规划预算 |
| 单组件需求 | notes | 保留既有 notes 能力，不偷换为聊天或画布 |
| 普通行情问答 | conversation | 主智能体按需求决定是否展示；已有真实记录可直接形成 artifact |

`latestClientModeForAuthority(session)` 只读取当前真实人类消息/turn 之后 `client_capabilities` 的实际成功 receipt，按 tool callId 对应，不相信用户粘贴的 JSON、旧轮次 receipt 或另一会话 mode。新的 steering/human authority 到来立即失效。catalog 和 dependent create 不能在同一个并行工具批次中假设执行顺序。

增加 tool guard：bare-component 请求 mode unknown 时，若模型跳过 catalog 直接调用 `research_workbench_create`，拒绝并提示先读 capability；mode conversation 时拒绝把该 bare-component 创建写进研究 canvas，要求新能力。明确工作台需求继续原授权行为。不能让一个提示词引导正确而工具层仍创建隐藏 canvas。

主智能体指令说明：直接交付完整 artifact；股票/ETF优先原生配置；场外基金走 fund 能力；真实数据先取数、保留时点，普通解释不强制建组件。该指令不要求遍历模板库、不要求读取完整技能、不默认建立子任务。

## 6. Host store 与幂等

新增 `ConversationComponentStore`，使用用户数据目录 `conversation-components.json`，schema version 1，mode 0600，串行 mutation + 临时文件原子 rename。每实例内部保存 owner、sessionId、turnId、authority/message identity、requestId、fingerprint、revision、normalized node、provenance、必要 native observations；对 renderer 只返回 View DTO。

- 幂等键为 owner/sessionId/turnId/requestId，和 artifact 指纹同一次原子保存。同键同 payload 重试返回原 componentId 和 manifest；同键不同 payload 明确冲突；不重复创建。
- 即使写盘成功而 RPC 响应丢失，重启/恢复后相同请求仍取回原结果。
- 初始限制：单个输入 JSON UTF-8 ≤1 MiB（小于现有1.5 MB client_action envelope）；单会话最多128实例；全库最多1024实例、64 MiB。超限明确失败，不静默删历史、不截断数据。所有模板现有更严格限制继续适用。
- 无效文件或 schema 不覆盖原文件，不把空 store 当成功恢复；保留文件并返回可诊断错误。
- `revision`是spec/内容配置revision；只在配置更新时递增，成功记录observation不递增，quotes/history可以携带同一revision并行合并。每份observation保存specRevision、query signature、真实receivedAt/source/result。
- `updateNativeSpec` 按 revision CAS，只允许同 widget 类型的有效 spec，保留实例 ID、消息归属和创建时点；更新 revision时使全部旧observation失效，清除旧配置的provenance获取成功状态。晚到结果不更新新配置；resolveReference只读取与当前specRevision匹配的数据，不能新标的配旧股票价格。
- 所有 IPC 用 `registerTrustedMainWindowHandler`，根据当前 owner 与可读 session 回读 store；跨 owner、未知 session、未知 instance 全部拒绝。UI操作还核验Host当前可见binding的session。A提供 `ClientCapabilityService.currentVisibleContext()` 只读投影，验证owner/window/expiry后返回上节VisibleContext；B通过callback读取，Root接线，renderer传参不能伪造它。renderer 不能传 node 替代 store 内容。
- 本功能没有隐藏 canvas 存储，没有研究 selection side effect，没有原研究 artifacts 列表写入。

## 7. 渲染、来源、刷新与引用

### 7.1 挂载与正文

新增 `scripts/lib/conversation-components.mjs` / `.css`，通过单独 `patchConversationComponents` 注入。从 `client_action` 成功结果中验证 capability / saved effect / manifest 三者一致，再在当前 session 的 `ChatView` 找到真实对应 turn 尾锚点。借用 `researchWorkbenchReceiptAnchors` 的算法形状，使用独立 metadata reader 和 marker。重复 receipt 或重渲染不重复卡；新用户消息/steering 不能把旧卡移动到新回复；没有 final text 的成功 turn 仍有稳定卡位置。

加载 store 的稳定 ID 之后：native → `FinancialWidget`，普通 artifact → `ResearchContainerBody`。卡宽随消息可读宽度，正文不缩小字体，表格/图表保留现有内部横向滚动与响应式逻辑；自然高度有合理上限，不能使长表内容裁掉且无滚动。卡片使用独立 `data-conversation-component-id`，只有兼容原生正文/选中定位需要时使用 `data-research-node-id`，不得冒充 `data-research-canvas`。

Header 复用 Workbench icon/材质/字体，可给 `WorkbenchChrome` 增加明确 surface props，或抽轻量共用标题控件。对话 surface 不创建拖拽画布句柄、不创建 close、不创建缺少 adapter 的 canvas menu 项。更多必有复制、保存库；已有类型支持且不依赖画布的设置/阅读/导出可复用，所有实际展示的菜单项必须有有效 handler。

### 7.2 原生金融 observation 与刷新

给 `FinancialWidget` 增加两个可选 prop，默认值保持研究/笔记现状：

```ts
surface?: 'research' | 'notes' | 'conversation';
dataProvider?: {request(query:JsonObject):Promise<JsonObject>};
```

对话 surface 走 `bridge.queryNative({sessionId,componentId,expectedRevision,query})`。Host 根据已存 spec 验证 action、symbols、source、period、adjustment 与当前实例一致，复用现有 `createPublicFinancialWidgetData`；不能让该 API 任意查询其他组件或跳过配置授权。Host 记录本次真实 query result 的 source/receivedAt/asOf 和 bounded observation。旧 revision 的晚到结果不能更新新配置的 observation。quote 的 quotes/history 并行结果按 action 合并，不互相抹掉。

UI继续使用 FinancialWidget 原可见性/60秒刷新/失败保留数据逻辑；按钮手动刷新也走同一 provider。若没有本次有效数据，显示“尚未刷新/未取得数据”，不得拿 createdAt 顶替。footer 在 JSX 层不创建 FinancialConnectionPort；普通模板 wrapper 也不挂画布来源连接 footers。native footer保留真实 source + 最近获取时间，组件内容内部仍显示 quote/nav/report 数据时点。

普通 artifact 首版是 snapshot。沿现有 artifact 中的来源字段记录 provided 来源；没有来源记 unspecified。结构校验不校准每个模型数值，不把模型的来源字符串升级为“已核验”，不把模型提供的日期当 Host 的 fetchedAt。没有真实 fetchedAt 时 footer 显示“未绑定刷新”；保存时刻仅在 tooltip/metadata 中称“保存于”。真实来源的具体数据时点保留在模板正文。通用自动刷新 recipe、跨工具来源逐字段验真不属于首版，不用生成回执假装绑定成功。

### 7.3 引用到对话

新增 `conversation-component` reference source/codec，chip 引用只有 stable component/session/revision/title，不把 opaque ID 冒充 research canvas node。标题栏按钮先 `bridge.reference`，然后对**当前会话**的 SessionInputShell.insertReference；保留草稿、选区和附件，加入后聚焦输入框，不立即发消息。

发送序列化前调用 `bridge.resolveReference({sessionId:keyboardSessionId,reference})`。Host要求reference.sessionId、发送sessionId及真实当前可见binding.sessionId一致，且owner/window/lease有效，再回读实例；revision 是提示而非跨账户能力。若内容已更新，解析最新有效 revision 并保留实际时点；若已不可用，给出明确引用错误，不发送编造数据。

- 普通结构化 artifact 优先用保留 template model 的 readable snapshot，不把 HTML script 作为指令给模型。
- native 解析保存的 Host observation；如尚未取得真实数据，按已存配置经同一 query service 实际获取，保留 source/fetchedAt/dataAsOf；取数失败时只能引用配置和明确缺口。
- 不能只有 symbols 却宣称把组件中的最新价格传入上下文。仅本次引用所需的 bounded readable data 进入 prompt；来源数据属于不可信资料，不能携带执行指令。

## 8. 剪贴板与组件库

`copy` 由 Host 按 target 回读并 `detachConversationComponentNode`，然后调用现有 ResearchCanvasClipboard.copy。补齐 sanitizer 的 `financial-widget` strict parser，保留 symbols/period/indicators/adjustment/source/refresh配置；剥离 linkedWatchlistId/linkedSourceId、generation task IDs、authority、跨源授权和原消息归属。不要用放开任意 spec 字段来解决类型不支持。

普通模板沿既有 sanitizer；为当前声明支持的模板增加必须的具体 parser 分支，而非另一套 HTML 渲染器。媒体/本地资源/原生日历等尚无对话adapter的类型按§4精确拒绝，绝不由artifact路径自动授予。首版交付§4准入的现有纯声明式模板与原生金融控件，不恢复 parked 实验。

研究/笔记已有 paste 路径复用。研究 paste 已新建 ID、清任务状态和持久保存；笔记 paste 已把 opaque envelope 的 nodes 变成 research blocks。补测两者接受新 financial spec 并重新打开仍正常。粘贴后的 native 实例不与原对话 spec 共用引用或共享配置；用户在一边改周期，不应改另一边。

保存库不扩展为任意 renderer-supplied node API。B 提供 `saveLibrary(target)`，从 store回读 → detach → ComponentLibraryStore.add。仅新 financial type 经 strict parser 后开放库 predicate，两处 host/client predicate一致；calendar等授权型对象仍按现有支持范围决定。已有 owner-scoped recipe 读取规则保持不变。

## 9. 模块所有权与单一接线

| Owner | 独占实现范围 | 不触碰 |
| --- | --- | --- |
| A：runtime policy/capability | 新共享 `.js/.d.ts` 合同、artifact normalization、client-capabilities 目录/类型、ClientCapabilityService 的 injectable handler和身份闭包、workbench policy与主智能体指令、对应测试 | main/preload/installer 入口、Host store、UI renderer |
| B：host store/IPC/clipboard/library | 新 conversation store/service/IPC installer、native query观察、copy/library/reference实现、clipboard strict financial parser、library predicate、对应测试 | shared合同字段、runtime policy、三个入口接线、UI 注入 |
| C：UI renderer/reference | receipt挂载、native/body surface、header/footer/menu/selection/Cmd+C、新reference codec/输入框集成、FinancialWidget可选provider与回归、对应测试 | Host store、capability授权、三个入口接线 |
| Root：唯一接线/集成 owner | `src/main/index.ts`、`src/preload/index.ts`、`scripts/patch-web-frontend-loading.mjs`；组装三模块、focused组合验证、中文提交审查与集成流程 | 不混入PPT修复之外无关改动，不在功能worktree构建共享客户端 |

A 合同先完成一次短交接，随后 A/B/C 可并行。所有实现交付自己的模块与测试，以及给 Root 的准确 install 参数/返回值；任何 owner 不直接改三个共享入口。Root 接线前核对 API，避免“UI字段叫nodeId、Host字段叫componentId”的隐性适配。

## 10. 完成标准

- 真实主智能体可在 conversation mode 提交已完成 artifact/native spec，没有默认子智能体事件，没有研究画布 artifacts 变化。
- 股票/ETF native quote、场外基金真实数据模板、普通表格/图表均能形成稳定回复尾卡片，返回历史、重开会话和客户端重启后不丢失或串卡。
- header、footer和操作满足冻结要求；DOM里无关闭按钮/连接ports，所有可见菜单可用。
- native控制项保存、真实刷新、失败保留旧数据与正确时间；snapshot 不出现假刷新成功。
- 引用保留草稿并传真实可读内容；copy/Cmd+C分别可粘研究与笔记，保存库后两模式均可再次添加，实例间独立。
- 聚焦测试、patch幂等、typecheck通过；无全功能单元测试。按项目手册在集成main进行后续本地构建/真实UI验收并保持客户端打开，当前阶段不执行这些动作。

## 文档复核

已完成一次独立只读 builder check，并修正 normalizer 返回类型、配置 revision 与 observation、引用发送会话身份、首版模板准入四处合同缺口；复核未发现新的阻断性矛盾。此结论仅针对设计/计划，不代表代码实现或真实客户端验收。
