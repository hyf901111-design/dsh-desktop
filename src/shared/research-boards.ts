import type { Canvas, Snapshot } from 'dsh-research-collaboration/document'
import type {
  Board as WireBoard,
  BoardRole
} from 'dsh-research-collaboration/protocol'
export type { Canvas, Snapshot }
export type Board = WireBoard & { refreshPaused?: boolean }
export type PublicUser = { userId: string; publicId: string; username: string }
export type ResearchIdentity = {
  sessionId: string
  title: string
  cwd?: string
  workspaceId?: string
  workspaceTitle?: string
}
export type Favorite = ResearchIdentity & {
  favoriteId: string
  directoryPath?: string
  pinned?: boolean
  dedicated?: boolean
  updatedAt?: number
  createdAt: number
}
export type Member = {
  userId: string
  username: string
  role: BoardRole
  joinedAt?: number
  version?: number
}
export type GeometryPreview = {
  collection: 'files' | 'artifacts'
  nodeId: string
  x: number
  y: number
  width: number
  height: number
}
export type PendingInvitation = {
  invitationId: string
  invitee: PublicUser
  role: 'editor' | 'viewer'
  version: number
  expiresAt: number
  status: 'pending'
}
export type Presence = Member & {
  previews?: GeometryPreview[]
  previewExpiresAt?: number
  previewSeq?: number
  cursor?: { x: number; y: number } | null
  selectedIds?: string[]
}
export type SharedMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  authorId?: string
  authorName?: string
  seq?: number
  createdAt?: number
  requestMessageId?: string
  [key: string]: unknown
}
export type SharedTask = {
  createdAt?: number
  taskId: string
  status: string
  [key: string]: unknown
}
export type Notification = {
  notificationId: string
  eventVersion: number
  type: string
  boardId: string
  boardTitle: string
  createdAt: number
  readAt: number | null
  invitation?: {
    invitationId?: string
    id?: string
    version: number
    status: string
    [key: string]: unknown
  }
  [key: string]: unknown
}
export type NotificationView = {
  notifications: Notification[]
  cursor: number
  unreadCount: number
  pendingCount: number
}
export type BoardSnapshot = {
  board: Board
  snapshot: Snapshot
  documentUpdate: string
  seq: number
  tombstones: string[]
  members: Member[]
  pendingInvitations?: PendingInvitation[]
  messages: SharedMessage[]
  tasks: SharedTask[]
}
export type OwnChange = {
  kind: 'insert' | 'field' | 'create' | 'delete' | 'message'
  collection?: 'files' | 'artifacts'
  nodeId?: string
  path?: string[]
  text?: string
  value?: unknown
  removed?: number
}
export type Recovery = {
  recoveryId: string
  boardId: string
  operationId?: string
  createdAt: number
  reason: string
  status: 'unsent' | 'unknown' | 'deletion'
  changes: OwnChange[]
}
export type RecoverySummary = Omit<Recovery, 'changes'>
export type PendingOperation = {
  operationId: string
  boardId: string
  epoch: number
  action: string
  body: Record<string, unknown>
  clientMutationId?: string
  recovery: OwnChange[]
  createdAt: number
}
export type BoardSummary = Board & {
  pinned: boolean
  localSessionId?: string
  sourceFavoriteId?: string
}
export type AccountView = {
  status: 'signedOut' | 'loading' | 'ready' | 'unavailable'
  generation: number
  user: PublicUser | null
}
export type BoardView = {
  activities?: Array<Record<string, any>>
  boardId: string
  localSessionId: string | null
  board: Board
  connection: 'loading' | 'online' | 'offline' | 'revalidating' | 'revoked'
  permissions: {
    read: boolean
    edit: boolean
    manage: boolean
    execute: boolean
  }
  canvas: Canvas
  canvasRevision: string
  seq: number
  epoch: number
  history: Snapshot['history']
  messages: SharedMessage[]
  tasks: SharedTask[]
  members: Member[]
  pendingInvitations?: PendingInvitation[]
  presence: Presence[]
  pendingCount: number
  canUndo: boolean
  canRedo: boolean
  recoveries: RecoverySummary[]
}
export type CanvasReply = {
  canvas: Canvas
  canvasRevision: string
  localBranchRevision: string
  seq: number
  pendingCount: number
  canUndo: boolean
  canRedo: boolean
  clientMutationId?: string
}
export type ResearchBoardsState = {
  version: 1
  eventSeq: number
  account: AccountView
  favorites: Favorite[]
  boards: BoardSummary[]
  current: BoardView | null
  notifications: NotificationView
  recoveries: RecoverySummary[]
}
export type ResearchBoardsEvent = (
  | { type: 'state'; state: ResearchBoardsState }
  | {
      type: 'board'
      boardId: string
      localSessionId: string | null
      view: BoardView
      cause: string
    }
  | { type: 'component'; boardId: string; localSessionId: string | null; message: Record<string, unknown> }
  | {
      type: 'presence'
      boardId: string
      localSessionId: string | null
      presence: Presence[]
    }
  | {
      type: 'access'
      boardId: string
      localSessionId: string | null
      reason: string
      epoch: number
      recoveries: RecoverySummary[]
    }
) & { eventSeq: number; accountGeneration: number }
export type BoardsError = {
  code: string
  message: string
  retryable: boolean
  details?: unknown
}
export type BoardsResult<T = unknown> =
  { ok: true; value: T } | { ok: false; error: BoardsError }
export type ResearchBoardsBridge = {
  isSharedSession(sessionId: string): boolean
  getSnapshot(): Promise<ResearchBoardsState>
  invoke(action: string, input?: unknown): Promise<BoardsResult>
  subscribe(listener: (event: ResearchBoardsEvent) => void): () => void
}
export class ResearchBoardsError extends Error {
  constructor(
    public code: string,
    message = code,
    public retryable = false,
    public details?: unknown,
    public status?: number
  ) {
    super(message)
    this.name = 'ResearchBoardsError'
  }
}
export function boardsError(error: unknown): BoardsError {
  if (error instanceof Error && 'code' in error) {
    const e = error as ResearchBoardsError
    return {
      code: String(e.code),
      message: e.message,
      retryable: e.retryable === true,
      ...(e.details === undefined ? {} : { details: e.details })
    }
  }
  return {
    code: 'COLLABORATION_UNAVAILABLE',
    message: '研究看板暂时不可用。',
    retryable: true
  }
}

export const managerWorkbenchInstallKey = 'ework.research.manager-workbench.v1'
