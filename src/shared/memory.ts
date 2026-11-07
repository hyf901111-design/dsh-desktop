export type MemoryKind = 'preference' | 'background' | 'decision' | 'progress'
export type MemoryScope = 'global' | 'project'
export type MemoryStatus = 'active' | 'candidate' | 'disabled' | 'superseded'
export type MemorySource = { kind: 'conversation' | 'manual' | 'note' | 'legacy'; sessionId?: string; seq?: number; title: string; excerpt: string; createdAt: number; noteId?: string; noteRevision?: number; messageId?: string }
export type MemoryRecord = { id: string; title: string; content: string; kind: MemoryKind; scope: MemoryScope; projectId?: string; semanticKey: string; status: MemoryStatus; revision: number; manualLocked: boolean; pinned: boolean; createdAt: number; updatedAt: number; lastConfirmedAt: number; expiresAt?: number; lastUsedAt?: number; sources: MemorySource[] }
export type MemoryProject = { id: string; name: string; path?: string; aliases: string[]; createdAt: number }
export type MemorySettings = { use: boolean; auto: boolean; semantic?: boolean }
export type MemoryRetrievalStatus = { state: 'idle' | 'loading' | 'ready' | 'fallback' | 'keyword'; message: string; indexed?: number }
export type MemoryUsage = { id: string; sessionId: string; createdAt: number; entries: { id: string; revision: number; title: string; reason: string }[] }
export type MemorySnapshot = { revision: number; owner: string; settings: MemorySettings; retrieval?: MemoryRetrievalStatus; projects: MemoryProject[]; rows: MemoryRecord[]; usages: MemoryUsage[]; session?: { id: string; projectId?: string; disabled: boolean }; document?: {directory:string;file:string;error?:string;content?:string;hash?:string}; summary?: {state:'empty'|'waiting'|'pending'|'ready'|'failed';text:string;updatedAt?:number;model?:string;count:number}; extraction: { state: 'ready' | 'running' | 'failed'; message: string }; source?: MemorySource; legacy?: { id: string; title: string; content: string; createdAt: number }[] }
export type MemoryInput = { title: string; content: string; kind: MemoryKind; scope: MemoryScope; projectId?: string; pinned?: boolean; expiresAt?: number; source?: MemorySource }
export type MemoryCommand =
  | { type: 'snapshot'; sessionId?: string; query?: string }
  | { type: 'save'; id?: string; expectedRevision?: number; input: MemoryInput }
  | { type: 'action'; ids: string[]; action: 'delete' | 'disable' | 'enable' | 'accept' | 'ignore'; expectedRevisions?: Record<string, number> }
  | { type: 'settings'; use: boolean }
  | { type: 'document-read' }
  | { type: 'document-save'; content: string; expectedHash: string }
  | { type: 'rebuild-index' }
  | { type: 'project'; name: string; path?: string; sessionId?: string }
  | { type: 'bind'; sessionId: string; projectId?: string }
  | { type: 'source'; id: string }
  | { type: 'legacy-preview' }
  | { type: 'import-legacy'; ids: string[]; projectId?: string }
export type MemoryBridge = { request(command: MemoryCommand): Promise<MemorySnapshot>; openSource?(source: MemorySource): Promise<void>; openDirectory?():Promise<void>; subscribe?(listener: () => void): () => void }
export type MemoryRuntimeContext = { sessionId: string; query: string; projectPath?: string; turnId?: string }
export type MemoryRecall = { enabled: boolean; autoEnabled: boolean; ownerEpoch: string; revision: number; scopeEpoch: number; projectId?: string; entries: { id: string; revision: number; title: string; content: string; reason: string }[]; candidates: { id: string; revision: number; title: string; content: string; reason: string }[]; selectionRequired: true; block: string }
export type MemoryTurnEvent = { seq: number; role: 'user' | 'assistant'; text: string }
export type MemoryRuntimeTurn = { sessionId: string; turnId: string; events: MemoryTurnEvent[]; anchor?: { ownerEpoch:string;scopeEpoch:number;projectId?:string }; projectPath?: string; route?: { provider: string; model: string } }
export type MemoryCandidate = { title: string; content: string; kind: MemoryKind; scope: MemoryScope; semanticKey?: string; sourceSeq: number; evidence: string; explicit: boolean }
export type MemoryCapture = { captureId: string; enabled: boolean; ownerEpoch: string; revision: number; projectId?: string }
