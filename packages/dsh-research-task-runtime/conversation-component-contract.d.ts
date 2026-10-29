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
  readOnly?:boolean;                    // 仅当前宿主权限，不写入组件存储
  menuCapabilities?:ConversationComponentMenuCapabilities;
  id: string;
  sessionId: string;
  revision: number;                     // 配置/内容revision；observation更新不递增
  node: JsonObject;                      // research-compatible，id 同 instance id，x/y=0
  provenance: ConversationComponentProvenance;
  createdAt: number;                     // Host 保存时间，不能作为刷新成功时间
  updatedAt: number;
};

export type ConversationComponentCreateReceipt = {
  /** Tool-owned final content when the host save committed before caller cancellation. */
  cancelledAfterSave?:true;
  status: 'succeeded';
  effect: {kind:'conversation-component'; state:'saved'; componentId:string};
  data: {renderManifest: ConversationComponentManifest};
  message: string;
};

// IPC DTO：这些字段只定位当前用户有权访问的实例，不能赋予新身份。
export type ConversationComponentTarget = {sessionId:string; componentId:string};
export type ConversationComponentTheme = 'light'|'dark'|'enterprise'|'openterminal';
export type ConversationComponentMenuCapabilities = {copy:boolean; saveLibrary:boolean; exportContent:boolean; rename:boolean; theme?:boolean};
export type ConversationComponentRename = ConversationComponentTarget & {expectedRevision:number; title:string};
export type ConversationComponentThemeUpdate = ConversationComponentTarget & {expectedRevision:number; theme:ConversationComponentTheme};
export type ConversationComponentExport = ConversationComponentTarget & {expectedRevision:number} & (
  {kind:'text'; format:'svg'; content:string} |
  {kind:'binary'; format:'png'|'jpg'; base64:string}
);
export type ConversationComponentExportResult = {status:'saved'} | {status:'cancelled'} | {status:'error';message:string};
export type ConversationNativeSpecUpdate = ConversationComponentTarget & {
  expectedRevision:number; spec:JsonObject;
};
export type ConversationHtmlInteractionUpdate = ConversationComponentTarget & {
  expectedRevision:number; htmlVersion:string;
} & ({kind:'journal'; event:JsonObject} | {kind:'shared'; revision:number; state:JsonValue});
/** A previously persisted native observation, never evidence that a new refresh succeeded. */
export type ConversationNativeSnapshot = {
  specRevision:number; receivedAt:number; querySignature:string; result:JsonObject;
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
  /** Host-only readback of an already committed request; never creates or refreshes. */
  recover?(args:ConversationComponentCreateArguments,
    identity:ConversationComponentExecutionIdentity, requestId:string):Promise<ConversationComponentCreateReceipt|undefined>;
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
  readOnly?:boolean;
};

export interface ConversationComponentsBridge {
  read(target:ConversationComponentTarget): Promise<ConversationComponentView>;
  rename?(input:ConversationComponentRename): Promise<ConversationComponentView>;
  setTheme?(input:ConversationComponentThemeUpdate): Promise<ConversationComponentView>;
  exportContent?(input:ConversationComponentExport): Promise<ConversationComponentExportResult>;
  /** Acknowledges only a persisted HTML interaction in the current host lease. */
  commitHtmlInteraction?(input:ConversationHtmlInteractionUpdate): Promise<ConversationComponentView>;
  updateNativeSpec(input:ConversationNativeSpecUpdate): Promise<ConversationComponentView>;
  queryNative(input:ConversationComponentTarget & {expectedRevision:number; query:JsonObject}): Promise<JsonObject>;
  readNativeSnapshot?(input:ConversationComponentTarget & {expectedRevision:number; query:JsonObject}): Promise<ConversationNativeSnapshot|null>;
  copy(target:ConversationComponentTarget): Promise<{ok:boolean; error?:string}>;
  saveLibrary(target:ConversationComponentTarget): Promise<{id:string; name:string}>;
  reference(target:ConversationComponentTarget): Promise<ConversationComponentReference>;
  resolveReference(input:ResolveConversationComponentReferenceInput): Promise<{title:string; text:string}>;
}

export function normalizeConversationComponentArtifact(args:unknown):NormalizedConversationArtifact;
export function parseConversationComponentManifest(value:unknown):ConversationComponentManifest|null;
export function parseConversationComponentReference(value:unknown):ConversationComponentReference|null;
export function canonicalConversationComponentInput(args:ConversationComponentCreateArguments):string;
export function detachConversationComponentNode(node:JsonObject):JsonObject;
