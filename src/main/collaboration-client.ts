import { ResearchBoardsError } from '../shared/research-boards'
export const COLLABORATION_ORIGIN = 'https://updates.evanarts.com'
export type CollaborationEndpoint =
  | { kind: 'me' | 'boards.list' }
  | { kind: 'knowledge.list'; after?: string; at?: number }
  | { kind: 'knowledge.file' | 'knowledge.revoke'; id: string }
  | { kind: 'knowledge.publish'; id: string; name: string; category: string; source: 'generated' | 'upload'; size: number; data: BodyInit }
  | { kind: 'users.lookup'; publicId: string }
  | { kind: 'board.get'; boardId: string }
  | { kind: 'board.create'; body: Record<string, unknown> }
  | { kind: 'board.command'; boardId: string; body: Record<string, unknown> }
  | { kind: 'receipt'; boardId: string; operationId: string }
  | { kind: 'notifications.list'; after: number; limit?: number }
  | { kind: 'notifications.read'; notificationIds?: string[] }
  | {
      kind: 'invitation.respond'
      invitationId: string
      body: Record<string, unknown>
    }
  | { kind: 'ticket'; scope: 'board' | 'notifications'; boardId?: string }
  | { kind: 'upload.create'; operationId: string }
  | {
      kind: 'asset.stage'
      uploadId: string
      assetId: string
      name: string
      size: number
      contentType: string
      data: BodyInit
    }
  | { kind: 'asset.get'; boardId: string; assetId: string }
  | {
      kind: 'asset.add'
      boardId: string
      operationId: string
      epoch: number
      name: string
      size: number
      contentType: string
      data: BodyInit
    }
export type RequestSpec = {
  path: string
  method: string
  body?: BodyInit
  headers?: Record<string, string>
  raw?: boolean
}
function safeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[-\w:.]{1,128}$/.test(value))
    throw new ResearchBoardsError('INVALID_REQUEST')
  return encodeURIComponent(value)
}
function exact(value: object, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw new ResearchBoardsError('INVALID_REQUEST')
}
export function collaborationRequestSpec(
  e: CollaborationEndpoint
): RequestSpec {
  if (!e || typeof e !== 'object')
    throw new ResearchBoardsError('INVALID_REQUEST')
  const json = (path: string, body: unknown): RequestSpec => ({
    path,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  let spec: RequestSpec
  switch (e.kind) {
    case 'knowledge.list': {
      exact(e, ['kind', 'after', 'at'])
      if (e.after !== undefined && !/^[a-f0-9]{32}$/u.test(e.after) ||
          e.at !== undefined && (!Number.isSafeInteger(e.at) || e.at < 0)) throw new ResearchBoardsError('INVALID_REQUEST')
      const cursor = e.after && e.at !== undefined ? `?after=${e.after}&at=${e.at}` : ''
      spec = { path: '/knowledge' + cursor, method: 'GET' }
      break
    }
    case 'knowledge.file':
    case 'knowledge.revoke':
      exact(e, ['kind', 'id'])
      if (!/^[a-f0-9]{32}$/u.test(e.id)) throw new ResearchBoardsError('INVALID_REQUEST')
      spec = { path: `/knowledge/${e.id}`, method: e.kind === 'knowledge.file' ? 'GET' : 'DELETE', raw: e.kind === 'knowledge.file' }
      break
    case 'knowledge.publish':
      exact(e, ['kind', 'id', 'name', 'category', 'source', 'size', 'data'])
      if (!/^[a-f0-9-]{36}$/u.test(e.id) || typeof e.name !== 'string' || !e.name || e.name.length > 255 ||
          typeof e.category !== 'string' || !e.category.trim() || e.category.length > 80 ||
          !['upload', 'generated'].includes(e.source) || !Number.isSafeInteger(e.size) || e.size < 0 || e.size > 25 * 1024 * 1024)
        throw new ResearchBoardsError('INVALID_REQUEST')
      spec = {
        path: `/knowledge/${e.id}`, method: 'PUT', body: e.data,
        headers: { 'content-type': 'application/octet-stream', 'x-asset-name': encodeURIComponent(e.name), 'x-asset-size': String(e.size),
          'x-knowledge-category': encodeURIComponent(e.category), 'x-knowledge-source': e.source }
      }
      break
    case 'me':
    case 'boards.list':
      exact(e, ['kind'])
      spec = { path: e.kind === 'me' ? '/me' : '/boards', method: 'GET' }
      break
    case 'users.lookup':
      exact(e, ['kind', 'publicId'])
      if (!/^\d{10}$/.test(e.publicId))
        throw new ResearchBoardsError('INVALID_REQUEST')
      spec = json('/users/lookup', { publicId: e.publicId })
      break
    case 'board.get':
      exact(e, ['kind', 'boardId'])
      spec = { path: `/boards/${safeId(e.boardId)}`, method: 'GET' }
      break
    case 'board.create':
      exact(e, ['kind', 'body'])
      spec = json('/boards', e.body)
      break
    case 'board.command':
      exact(e, ['kind', 'boardId', 'body'])
      spec = json(`/boards/${safeId(e.boardId)}/commands`, e.body)
      break
    case 'receipt':
      exact(e, ['kind', 'boardId', 'operationId'])
      spec = {
        path: `/boards/${safeId(e.boardId)}/receipts/${safeId(e.operationId)}`,
        method: 'GET'
      }
      break
    case 'notifications.list':
      exact(e, ['kind', 'after', 'limit'])
      if (
        !Number.isSafeInteger(e.after) ||
        e.after < 0 ||
        (e.limit !== undefined &&
          (!Number.isInteger(e.limit) || e.limit < 1 || e.limit > 50))
      )
        throw new ResearchBoardsError('INVALID_REQUEST')
      spec = {
        path: `/notifications?after=${e.after}&limit=${e.limit ?? 50}`,
        method: 'GET'
      }
      break
    case 'notifications.read':
      exact(e, ['kind', 'notificationIds'])
      spec = json(
        '/notifications/read',
        e.notificationIds ? { notificationIds: e.notificationIds } : {}
      )
      break
    case 'invitation.respond':
      exact(e, ['kind', 'invitationId', 'body'])
      spec = json(`/invitations/${safeId(e.invitationId)}/respond`, e.body)
      break
    case 'ticket':
      exact(e, ['kind', 'scope', 'boardId'])
      if (e.scope !== 'board' && e.scope !== 'notifications')
        throw new ResearchBoardsError('INVALID_REQUEST')
      if (e.scope === 'board') safeId(e.boardId)
      else if (e.boardId !== undefined)
        throw new ResearchBoardsError('INVALID_REQUEST')
      spec = json('/tickets', {
        scope: e.scope,
        ...(e.boardId ? { boardId: e.boardId } : {})
      })
      break
    case 'upload.create':
      exact(e, ['kind', 'operationId'])
      safeId(e.operationId)
      spec = json('/uploads', { operationId: e.operationId })
      break
    case 'asset.get':
      exact(e, ['kind', 'boardId', 'assetId'])
      spec = {
        path: `/boards/${safeId(e.boardId)}/assets/${safeId(e.assetId)}`,
        method: 'GET',
        raw: true
      }
      break
    case 'asset.stage':
    case 'asset.add': {
      exact(
        e,
        e.kind === 'asset.stage'
          ? [
              'kind',
              'uploadId',
              'assetId',
              'name',
              'size',
              'contentType',
              'data'
            ]
          : [
              'kind',
              'boardId',
              'operationId',
              'epoch',
              'name',
              'size',
              'contentType',
              'data'
            ]
      )
      if (
        !Number.isSafeInteger(e.size) ||
        e.size < 0 ||
        e.size > 50 * 1024 * 1024 ||
        typeof e.name !== 'string' ||
        e.name.length > 512 ||
        !e.name ||
        typeof e.contentType !== 'string' ||
        !/^[\w.+-]+\/[\w.+-]+$/.test(e.contentType)
      )
        throw new ResearchBoardsError('INVALID_REQUEST')
      spec = {
        path:
          e.kind === 'asset.stage'
            ? `/uploads/${safeId(e.uploadId)}/assets/${safeId(e.assetId)}`
            : `/boards/${safeId(e.boardId)}/assets`,
        method: e.kind === 'asset.stage' ? 'PUT' : 'POST',
        body: e.data,
        headers: {
          'content-type': e.contentType,
          'x-asset-name': encodeURIComponent(e.name),
          'x-asset-size': String(e.size)
        }
      }
      if (e.kind === 'asset.add') {
        safeId(e.operationId)
        if (!Number.isSafeInteger(e.epoch) || e.epoch < 1)
          throw new ResearchBoardsError('INVALID_REQUEST')
        Object.assign(spec.headers!, {
          'x-operation-id': e.operationId,
          'x-sharing-epoch': String(e.epoch)
        })
      }
      break
    }
    default:
      throw new ResearchBoardsError('INVALID_REQUEST')
  }
  return { ...spec, path: '/v1/collaboration' + spec.path }
}
export function collaborationOrigin(origin = COLLABORATION_ORIGIN): string {
  if (origin === COLLABORATION_ORIGIN) return origin
  const url = new URL(origin)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new ResearchBoardsError('INVALID_DESTINATION')
  return url.origin
}
export function collaborationSocketUrl(
  path: string,
  origin = COLLABORATION_ORIGIN
): string {
  const base = collaborationOrigin(origin)
  if (
    typeof path !== 'string' ||
    !path.startsWith('/v1/collaboration/connect?') ||
    path.startsWith('//')
  )
    throw new ResearchBoardsError('INVALID_DESTINATION')
  const url = new URL(path, base)
  if (
    url.origin !== base ||
    url.pathname !== '/v1/collaboration/connect' ||
    url.hash ||
    [...url.searchParams.keys()].some((k) => k !== 'ticket') ||
    url.searchParams.getAll('ticket').length !== 1 ||
    !/^[-\w.]{1,256}$/.test(url.searchParams.get('ticket') ?? '')
  )
    throw new ResearchBoardsError('INVALID_DESTINATION')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
export type CollaborationAccount = {
  readonly generation: number
  readonly authenticated: boolean
  subscribeSessionChanged(listener: () => void): () => void
  collaborationRequest(
    endpoint: CollaborationEndpoint,
    signal?: AbortSignal
  ): Promise<unknown>
}
export type SocketLike = {
  readyState: number
  send(data: string): void
  close(code?: number): void
  addEventListener(type: string, listener: (event: any) => void): void
}
export type CollaborationEvent = { type: string; [key: string]: unknown }
export class CollaborationClient {
  private closed = false
  private watchers = new Set<() => void>()
  private sockets = new Map<string, SocketLike>()
  private disposeAccount: () => void
  constructor(
    private readonly account: CollaborationAccount,
    private readonly options: {
      origin?: string
      socketFactory?: (url: string) => SocketLike
      reconnectMs?: number
    } = {}
  ) {
    collaborationOrigin(options.origin)
    this.disposeAccount = account.subscribeSessionChanged(() =>
      this.closeWatchers()
    )
  }
  generation() {
    return this.account.generation
  }
  async request<T = unknown>(
    endpoint: CollaborationEndpoint,
    signal?: AbortSignal
  ): Promise<T> {
    if (this.closed) throw new ResearchBoardsError('SESSION_CHANGED')
    collaborationRequestSpec(endpoint)
    const generation = this.account.generation
    if (!this.account.authenticated)
      throw new ResearchBoardsError('LOGIN_REQUIRED')
    try {
      const result = await this.account.collaborationRequest(endpoint, signal)
      if (generation !== this.account.generation || this.closed)
        throw new ResearchBoardsError('SESSION_CHANGED')
      return result as T
    } catch (error) {
      if (generation !== this.account.generation || this.closed)
        throw new ResearchBoardsError('SESSION_CHANGED')
      throw error
    }
  }
  watch(
    scope: { scope: 'board' | 'notifications'; boardId?: string },
    listener: (event: CollaborationEvent) => void
  ): () => void {
    const generation = this.account.generation
    let disposed = false
    let socket: SocketLike | undefined
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let ping: ReturnType<typeof setInterval> | undefined
    let welcome: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let welcomed = false
    const key = scope.scope === 'board' ? scope.boardId! : 'notifications'
    const valid = () =>
      !disposed && !this.closed && generation === this.account.generation
    const cleanupSocket = () => {
      clearInterval(ping)
      clearTimeout(welcome)
      if (this.sockets.get(key) === socket) this.sockets.delete(key)
    }
    const schedule = () => {
      if (!valid() || reconnect) return
      listener({ type: 'offline' })
      reconnect = setTimeout(
        () => {
          reconnect = undefined
          void connect()
        },
        Math.min(
          30_000,
          (this.options.reconnectMs ?? 500) * 2 ** Math.min(attempt++, 6)
        ) *
          (0.8 + Math.random() * 0.4)
      )
      reconnect.unref?.()
    }
    const connect = async () => {
      if (!valid()) return
      try {
        const ticket = await this.request<{ url: string }>({
          kind: 'ticket',
          ...scope
        })
        if (!valid()) return
        socket = (this.options.socketFactory ?? ((url) => new WebSocket(url)))(
          collaborationSocketUrl(ticket.url, this.options.origin)
        )
        welcomed = false
        this.sockets.set(key, socket)
        const active = socket
        const live = () => valid() && socket === active
        welcome = setTimeout(() => {
          if (live() && !welcomed) active.close()
        }, 15_000)
        welcome.unref?.()
        active.addEventListener('message', (event) => {
          if (
            !live() ||
            typeof event.data !== 'string' ||
            event.data.length > 5 * 1024 * 1024
          )
            return
          try {
            const value = JSON.parse(event.data) as CollaborationEvent
            if (value.type === 'accessRevoked') {
              listener(value)
              dispose()
              return
            }
            if (value.type === 'welcome') {
              if (value.scope !== scope.scope) throw Error()
              welcomed = true
              attempt = 0
              clearTimeout(welcome)
              ping = setInterval(() => {
                if (live() && active.readyState === 1)
                  active.send('{"type":"ping"}')
              }, 10_000)
              ping.unref?.()
              listener(value)
              return
            }
            if (welcomed) listener(value)
          } catch {
            active.close()
          }
        })
        active.addEventListener('close', (event) => {
          if (!live()) return
          cleanupSocket()
          if (event.code === 4003) {
            listener({ type: 'accessRevoked', reason: 'ACCESS_DENIED' })
            dispose()
          } else schedule()
        })
        active.addEventListener('error', () => {
          if (live()) active.close()
        })
      } catch (error) {
        if (valid()) {
          if (
            error instanceof ResearchBoardsError &&
            [401, 403].includes(error.status ?? 0)
          ) {
            listener({ type: 'accessRevoked', reason: error.code })
            dispose()
          } else schedule()
        }
      }
    }
    const dispose = () => {
      if (disposed) return
      disposed = true
      clearTimeout(reconnect)
      cleanupSocket()
      socket?.close()
      this.watchers.delete(dispose)
    }
    this.watchers.add(dispose)
    void connect()
    return dispose
  }
  sendActivity(boardId: string, activity: unknown) {
    const socket = this.sockets.get(boardId)
    if (socket?.readyState !== 1) throw new ResearchBoardsError('COMPONENT_OFFLINE')
    socket.send(JSON.stringify({type:'activity',activity}))
  }
  sendComponent(boardId: string, message: unknown) {
    const socket = this.sockets.get(boardId)
    if (socket?.readyState !== 1) throw new ResearchBoardsError('COMPONENT_OFFLINE')
    socket.send(JSON.stringify({ type: 'component', message }))
  }
  sendPresence(
    boardId: string,
    value: import('dsh-research-collaboration/protocol').PresenceHints
  ) {
    const socket = this.sockets.get(boardId)
    if (socket?.readyState === 1)
      socket.send(JSON.stringify({ type: 'presence', ...value }))
  }
  private closeWatchers() {
    for (const close of [...this.watchers]) close()
  }
  stop() {
    this.closed = true
    this.closeWatchers()
    this.disposeAccount()
  }
}
