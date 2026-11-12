import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  statSync,
  existsSync,
  rmSync
} from 'node:fs'
import { join } from 'node:path'
import {
  ResearchBoardsError,
  type Favorite,
  type ResearchIdentity,
  type Board,
  type BoardSnapshot,
  type NotificationView,
  type PendingOperation,
  type Recovery
} from '../../shared/research-boards'
export type AuxiliaryRequest = (
  | {
      kind: 'invitation.respond'
      invitationId: string
      version: number
      decision: 'accept' | 'decline'
    }
  | { kind: 'notifications.read'; notificationIds?: string[] }
) & { operationId: string }
export type Binding = {
  accountId: string
  boardId: string
  localSessionId: string
}
export type AccountStore = {
  auxiliary: AuxiliaryRequest[]
  boards: Board[]
  hidden: string[]
  bindings: Record<string, string>
  sources: Record<string, { favoriteId: string; sessionId: string }>
  mutations: Record<string, { operationId: string; epoch: number }>
  checkpoints: Record<string, BoardSnapshot>
  pending: PendingOperation[]
  recoveries: Recovery[]
  notifications: NotificationView
  creates: Record<
    string,
    {
      operationId: string
      body?: Record<string, unknown>
      uploadId?: string
    }
  >
}
export type BoardsStoreState = {
  version: 1
  favorites: Favorite[]
  accounts: Record<string, AccountStore>
  sharedSessions: Record<string, Binding>
}
const emptyAccount = (): AccountStore => ({
  auxiliary: [],
  boards: [],
  hidden: [],
  bindings: {},
  sources: {},
  mutations: {},
  checkpoints: {},
  pending: [],
  recoveries: [],
  notifications: {
    notifications: [],
    cursor: 0,
    unreadCount: 0,
    pendingCount: 0
  },
  creates: {}
})
const empty = (): BoardsStoreState => ({
  version: 1,
  favorites: [],
  accounts: {},
  sharedSessions: {}
})
const MAX_BYTES = 96 * 1024 * 1024
const clone = <T>(value: T): T => structuredClone(value)
function key(value: string) {
  if (
    !/^[\w:.-]{1,256}$/.test(value) ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw new ResearchBoardsError('INVALID_REQUEST')
  return value
}
export class ResearchBoardsStore {
  private state: BoardsStoreState
  readonly file: string
  constructor(userData: string) {
    this.file = join(userData, 'research-boards', 'state.json')
    this.state = empty()
    if (existsSync(this.file)) {
      try {
        if (statSync(this.file).size > MAX_BYTES) throw Error()
        const value = JSON.parse(readFileSync(this.file, 'utf8'))
        if (
          value.version !== 1 ||
          !Array.isArray(value.favorites) ||
          !value.accounts ||
          !value.sharedSessions
        )
          throw Error()
        this.state = value
      } catch {
        throw new ResearchBoardsError(
          'STORAGE_UNAVAILABLE',
          '研究看板记录无法读取；原文件已保留。'
        )
      }
    }
  }
  snapshot() {
    return clone(this.state)
  }
  account(accountId: string): AccountStore {
    return clone(this.state.accounts[key(accountId)] ?? emptyAccount())
  }
  sharedSession(sessionId: string): Binding | undefined {
    return clone(this.state.sharedSessions[sessionId])
  }
  transaction(change: (draft: BoardsStoreState) => void) {
    const draft = clone(this.state)
    change(draft)
    const bytes = JSON.stringify(draft)
    if (Buffer.byteLength(bytes) > MAX_BYTES)
      throw new ResearchBoardsError(
        'STORAGE_UNAVAILABLE',
        '研究看板本地存储已满。'
      )
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 })
      writeFileSync(temporary, bytes, { mode: 0o600 })
      renameSync(temporary, this.file)
      this.state = draft
    } catch {
      try {
        rmSync(temporary, { force: true })
      } catch {}
      throw new ResearchBoardsError('STORAGE_UNAVAILABLE', '无法保存研究看板。')
    }
  }
  updateAccount(accountId: string, change: (account: AccountStore) => void) {
    this.transaction((s) => {
      const id = key(accountId)
      s.accounts[id] ??= emptyAccount()
      change(s.accounts[id])
    })
  }
  addFavorite(identity: ResearchIdentity, pinned = true, dedicated = false): Favorite {
    key(identity.sessionId)
    if (this.sharedSession(identity.sessionId))
      throw new ResearchBoardsError('BINDING_CONFLICT')
    const old = this.state.favorites.find(
      (f) => f.sessionId === identity.sessionId
    )
    if (old) {
      if (pinned && old.pinned === false) {
        this.transaction(s => { s.favorites.find(f => f.favoriteId === old.favoriteId)!.pinned = true })
        return { ...clone(old), pinned: true }
      }
      return clone(old)
    }
    const value = {
      ...identity,
      pinned,
      dedicated,
      favoriteId: randomUUID(),
      createdAt: Date.now()
    }
    this.transaction((s) => {
      s.favorites.push(value)
    })
    return clone(value)
  }
  associateFavorite(sessionId: string, next: { sessionId: string; cwd: string; directoryPath: string; workspaceId?: string; workspaceTitle?: string }) {
    this.transaction(s => {
      const f = s.favorites.find(f => f.sessionId === sessionId && f.dedicated)
      if (!f) throw new ResearchBoardsError('BINDING_CONFLICT')
      Object.assign(f, next)
    })
  }
  touchFavorite(sessionId: string) {
    if (!this.state.favorites.some((f) => f.sessionId === sessionId))
      return false
    this.transaction((s) => {
      s.favorites.find((f) => f.sessionId === sessionId)!.updatedAt = Date.now()
    })
    return true
  }
  renameFavorite(id: string, title: string) {
    this.transaction((s) => {
      const f = s.favorites.find((f) => f.favoriteId === id)
      if (!f) throw new ResearchBoardsError('NOT_FAVORITED')
      f.title = title
    })
  }
  removeFavorite(id: string) {
    this.transaction((s) => {
      s.favorites = s.favorites.filter((f) => f.favoriteId !== id)
    })
  }
  reorderFavorites(ids: string[]) {
    this.transaction((s) => {
      if (
        ids.length !== s.favorites.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !s.favorites.some((f) => f.favoriteId === id))
      )
        throw new ResearchBoardsError('INVALID_REQUEST')
      s.favorites = ids.map(
        (id) => s.favorites.find((f) => f.favoriteId === id)!
      )
    })
  }
  setBoards(accountId: string, boards: Board[]) {
    this.updateAccount(accountId, (a) => {
      a.boards = clone(boards)
    })
  }
  setPinned(accountId: string, boardId: string, pinned: boolean) {
    key(boardId)
    this.updateAccount(accountId, (a) => {
      a.hidden = a.hidden.filter((id) => id !== boardId)
      if (!pinned) a.hidden.push(boardId)
    })
  }
  rebind(accountId: string, boardId: string, previousId: string, sessionId: string) {
    key(sessionId)
    this.transaction(s => {
      const account = s.accounts[accountId]
      const existing = s.sharedSessions[sessionId]
      if (account?.bindings[boardId] === sessionId && existing?.accountId === accountId && existing?.boardId === boardId) return
      if (!account || account.bindings[boardId] !== previousId || existing ||
          s.favorites.some(f => f.sessionId === sessionId) ||
          Object.values(s.accounts).some(a => Object.values(a.sources).some(source => source.sessionId === sessionId)))
        throw new ResearchBoardsError('BINDING_CONFLICT')
      account.bindings[boardId] = sessionId
      s.sharedSessions[sessionId] = { accountId, boardId, localSessionId: sessionId }
    })
  }
  bind(accountId: string, boardId: string, sessionId: string) {
    key(accountId)
    key(boardId)
    key(sessionId)
    this.transaction((s) => {
      const existing = s.sharedSessions[sessionId]
      if (
        s.favorites.some((f) => f.sessionId === sessionId) ||
        Object.values(s.accounts).some((account) =>
          Object.values(account.sources).some(
            (source) => source.sessionId === sessionId
          )
        ) ||
        (existing &&
          (existing.accountId !== accountId || existing.boardId !== boardId))
      )
        throw new ResearchBoardsError('BINDING_CONFLICT')
      s.accounts[accountId] ??= emptyAccount()
      const account = s.accounts[accountId]
      if (account.bindings[boardId] && account.bindings[boardId] !== sessionId)
        throw new ResearchBoardsError('BINDING_CONFLICT')
      account.bindings[boardId] = sessionId
      s.sharedSessions[sessionId] = {
        accountId,
        boardId,
        localSessionId: sessionId
      }
    })
  }
}
