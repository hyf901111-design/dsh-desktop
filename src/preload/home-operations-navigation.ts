type Observable<T> = { getSnapshot(): T; subscribe(listener: () => void): () => void }
type Dependencies = {
  document?: Document
  preferredWorkspace?: () => string | null | undefined
  standaloneDirectory?: () => Promise<string>
  sessions: {
    list: Observable<{ current?: string }>
    binding(id: string): { session: { getSnapshot(): { removed?: boolean; subagent?: unknown } } } | undefined
    subagentAddress(id: string): unknown
    open(id: string): void
    create(options: { workspaceId: string } | { cwd: string }): Promise<string>
  }
  workspaces: {
    list: { getSnapshot(): { items: readonly { workspaceId: string; sessionIds?: readonly string[] }[]; recentWorkspaceId?: string } }
    connectWorkspace(workspaceId: string): Promise<string>
  }
  chatStore?: { create(id: string): { actions: { setView(view: 'chat' | 'research' | 'notes'): void } } }
  inputHub: { shell(id: string): { disposed?: boolean; snapshot: { phase: string; draftRev: number; researchContextPreparing?: boolean } } }
  composerBlocks: { storeFor(id: string): { getSnapshot(): unknown } }
}
type Action = 'research' | 'notes' | 'composer'
type Ticket = { requestId: string; controller: AbortController; generation: number; revision: number; sessionId?: string }
const REQUEST = 'sherlock:home-action-request'
const REPLY = 'sherlock:home-action-reply'

/** Select native session views; this adapter never writes a draft or invokes a send action. */
export function installHomeOperationsNavigation(deps: Dependencies): () => void {
  const document = deps.document ?? globalThis.document
  const win = document.defaultView
  if (!win) return () => {}
  let stopped = false, generation = 0, revision = 0
  let selected = deps.sessions.list.getSnapshot().current
  let opening: Ticket | undefined
  let connection: { generation: number; revision: number; workspaceId: string; promise: Promise<string> } | undefined
  const pending = new Map<string, Ticket>(), completed = new Set<string>()
  const changed = '当前页面或对话已变化，请重新点击卡片。'
  const finish = (ticket: Ticket, ok: boolean, extra: { sessionId?: string; draftRev?: number; message?: string } = {}) => {
    if (pending.get(ticket.requestId) !== ticket) return
    pending.delete(ticket.requestId)
    completed.add(ticket.requestId)
    if (completed.size > 128) completed.delete(completed.values().next().value!)
    ticket.controller.abort()
    if (!stopped) win.dispatchEvent(new win.CustomEvent(REPLY, { detail: { requestId: ticket.requestId, ok, ...extra } }))
  }
  const cancel = (ticket: Ticket, message = changed) => finish(ticket, false, { message })
  const current = (ticket: Ticket) => {
    if (stopped || ticket.controller.signal.aborted || pending.get(ticket.requestId) !== ticket || ticket.generation !== generation || ticket.revision !== revision || deps.sessions.list.getSnapshot().current !== ticket.sessionId) throw Error(changed)
  }
  const offSelection = deps.sessions.list.subscribe(() => {
    if (stopped) return
    const next = deps.sessions.list.getSnapshot().current
    if (next === selected) return
    selected = next; revision++
    const ownedRequestId = opening && next === opening.sessionId ? opening.requestId : undefined
    for (const ticket of pending.values()) {
      if (ticket === opening && next === ticket.sessionId) ticket.revision = revision
      else cancel(ticket)
    }
    win.dispatchEvent(new win.CustomEvent('sherlock:home-action-context-changed', { detail: { sessionId: next, revision, ...(ownedRequestId ? { ownedRequestId } : {}) } }))
  })
  const reset = () => {
    generation++; revision++; connection = undefined
    for (const ticket of pending.values()) cancel(ticket)
    win.dispatchEvent(new win.CustomEvent('sherlock:home-action-context-changed', { detail: { sessionId: deps.sessions.list.getSnapshot().current, revision } }))
  }
  const sessionAvailable = (id: string) => {
    const binding = deps.sessions.binding(id)
    if (!binding) return false
    const snapshot = binding.session.getSnapshot()
    if (snapshot.removed) throw Error('对话已关闭，请重新选择对话。')
    if (snapshot.subagent || deps.sessions.subagentAddress(id)) throw Error('请返回主对话使用此卡片。')
    return true
  }
  const openCreated = (id: string, ticket: Ticket, action: Action) => {
    current(ticket)
    if (!id || id === ticket.sessionId || !sessionAvailable(id)) throw Error('新会话尚未就绪，请稍后重试。')
    deps.chatStore?.create(id).actions.setView(action === 'composer' ? 'chat' : action)
    ticket.sessionId = id
    opening = ticket
    try { deps.sessions.open(id) } finally { opening = undefined }
    current(ticket)
    return id
  }
  const resolveSession = async (ticket: Ticket, action: Action) => {
    current(ticket)
    // Only a visible blank chat is a reusable starting point. An existing
    // research/note or a board route needs a new session, not a hidden tab click.
    const header = [...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"] [data-srb-session-header]')].find(element => element.dataset.eworkNotesSession === ticket.sessionId)
    const activeView = header?.querySelector<HTMLElement>('[data-conversation-view-id][aria-selected="true"]')?.dataset.conversationViewId
    const workspace = deps.workspaces.list.getSnapshot()
    const manual = deps.preferredWorkspace?.()
    const sessionWorkspace = workspace.items.find(item => ticket.sessionId && item.sessionIds?.includes(ticket.sessionId))
    if (ticket.sessionId && header && !document.body.dataset.workspaceSurface &&
        ['chat', 'conversation'].includes(activeView || '') &&
        (manual === undefined || manual === sessionWorkspace?.workspaceId)) return ticket.sessionId
    const target = manual === undefined
      ? sessionWorkspace ?? workspace.items.find(item => item.workspaceId === workspace.recentWorkspaceId) ?? workspace.items[0]
      : workspace.items.find(item => item.workspaceId === manual)
    if (manual === null) {
      if (!deps.standaloneDirectory) throw Error('本地对话目录暂不可用。')
      const cwd = await deps.standaloneDirectory()
      current(ticket)
      return openCreated(await deps.sessions.create({ cwd }), ticket, action)
    }
    if (!target) throw Error('请先选择或添加工作区，再使用此卡片。')
    if (ticket.sessionId || manual !== undefined) {
      const id = await deps.sessions.create({ workspaceId: target.workspaceId })
      if (!deps.workspaces.list.getSnapshot().items.some(item => item.workspaceId === target.workspaceId)) throw Error('工作区已变化，请重新选择工作区。')
      return openCreated(id, ticket, action)
    }
    // Native connectWorkspace reuses a blank session when available and otherwise
    // creates one. Keep one in-flight connection across rapidly replaced intents.
    if (!connection || connection.generation !== generation || connection.revision !== revision || connection.workspaceId !== target.workspaceId) {
      const origin = { generation, revision }
      const attempt = { ...origin, workspaceId: target.workspaceId, promise: Promise.resolve().then(() => {
        if (stopped || generation !== origin.generation || revision !== origin.revision || ![...pending.values()].some(value => value.generation === origin.generation && value.revision === origin.revision && !value.sessionId)) throw Error(changed)
        return deps.workspaces.connectWorkspace(target.workspaceId)
      }) }
      connection = attempt
      void attempt.promise.finally(() => { if (connection === attempt) connection = undefined }).catch(() => {})
    }
    const id = await connection.promise
    current(ticket)
    if (!id || typeof id !== 'string' || !sessionAvailable(id)) throw Error('对话尚未就绪，请稍后重试。')
    if (!deps.workspaces.list.getSnapshot().items.some(item => item.workspaceId === target.workspaceId)) throw Error('工作区已变化，请重新选择工作区。')
    ticket.sessionId = id
    opening = ticket
    try { deps.sessions.open(id) } finally { opening = undefined }
    current(ticket)
    return id
  }
  const waitFor = <T>(ticket: Ticket, probe: () => T | undefined) => new Promise<T>((resolve, reject) => {
    const done = (error?: unknown, value?: T) => {
      observer.disconnect(); win.clearTimeout(timer); ticket.controller.signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(value!)
    }
    const abort = () => done(Error(changed))
    const check = () => {
      try { current(ticket); const value = probe(); if (value !== undefined) done(undefined, value) } catch (error) { done(error) }
    }
    const observer = new win.MutationObserver(check)
    const timer = win.setTimeout(() => done(Error('原生对话尚未就绪，请稍后重试。')), 4000)
    ticket.controller.signal.addEventListener('abort', abort, { once: true })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'data-ework-notes-session', 'disabled', 'readonly', 'inert', 'hidden'] })
    check()
  })
  const activate = async (ticket: Ticket, action: Action) => {
    const id = await resolveSession(ticket, action)
    current(ticket)
    let draftRev: number | undefined
    if (action === 'composer') {
      draftRev = await waitFor(ticket, () => {
        if (!sessionAvailable(id)) return
        const shell = deps.inputHub.shell(id), snapshot = shell.snapshot
        if (shell.disposed || snapshot.phase !== 'plain' || snapshot.researchContextPreparing || deps.composerBlocks.storeFor(id).getSnapshot() !== undefined) throw Error('对话输入暂不可编辑，请完成当前操作后重试。')
        const inputs = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[data-odyssey-file-reference-session]')].filter(input => input.dataset.odysseyFileReferenceSession === id && !input.closest('[data-odyssey-subagent-panel]'))
        if (!inputs.length) return
        if (!inputs.some(input => !input.disabled && !input.readOnly)) throw Error('对话输入框暂不可编辑，请先打开可编辑的对话。')
        if (!Number.isSafeInteger(snapshot.draftRev) || snapshot.draftRev < 0) throw Error('对话草稿尚未就绪，请稍后重试。')
        return snapshot.draftRev
      })
    } else {
      let clicked: HTMLButtonElement | undefined
      await waitFor(ticket, () => {
        if (!sessionAvailable(id)) return
        const header = [...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root [data-srb-session-header][data-ework-notes-session]')].find(element => element.dataset.eworkNotesSession === id && !element.closest('[data-odyssey-subagent-panel]'))
        const tab = header?.querySelector<HTMLButtonElement>(`[data-srb-tabs] button[data-conversation-view-id="${action}"]`)
        if (!tab) return
        if (tab.disabled) throw Error('此视图暂不可用，请稍后重试。')
        if (tab.getAttribute('aria-selected') === 'true') return true
        if (clicked !== tab) { clicked = tab; tab.click() }
        return tab.getAttribute('aria-selected') === 'true' ? true : undefined
      })
    }
    current(ticket)
    finish(ticket, true, { sessionId: id, ...(draftRev === undefined ? {} : { draftRev }) })
  }
  const onRequest = (event: Event) => {
    if (stopped) return
    const data = (event as CustomEvent<unknown>).detail
    if (!data || typeof data !== 'object') return
    const request = data as Record<string, unknown>, requestId = request.requestId
    if (typeof requestId !== 'string' || !requestId || requestId.length > 200) return
    if (request.action === 'cancel') { const ticket = pending.get(requestId); if (ticket) cancel(ticket, '本次卡片操作已取消。'); return }
    if (completed.has(requestId) || pending.has(requestId)) return
    for (const ticket of pending.values()) cancel(ticket)
    const ticket: Ticket = { requestId, controller: new AbortController(), generation, revision, sessionId: deps.sessions.list.getSnapshot().current }
    pending.set(requestId, ticket)
    if (typeof request.action !== 'string' || !['research', 'notes', 'composer'].includes(request.action) || Object.keys(request).length !== 2) { cancel(ticket, '卡片操作无效，请重试。'); return }
    void activate(ticket, request.action as Action).catch(error => finish(ticket, false, { message: error instanceof Error ? error.message : '暂时无法打开，请稍后重试。' }))
  }
  const dispose = () => {
    if (stopped) return
    stopped = true; reset(); offSelection()
    win.removeEventListener(REQUEST, onRequest); win.removeEventListener('sherlock:skill-menu-reset', reset); document.removeEventListener('sherlock:notes-reset', reset); win.removeEventListener('pagehide', dispose)
    completed.clear()
  }
  win.addEventListener(REQUEST, onRequest)
  win.addEventListener('sherlock:skill-menu-reset', reset); document.addEventListener('sherlock:notes-reset', reset); win.addEventListener('pagehide', dispose)
  return dispose
}
