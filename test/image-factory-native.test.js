import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { installImageFactoryContext } from '../scripts/lib/image-factory-native.mjs'
import { readImageFactoryContext } from '../packages/dsh-research-task-runtime/image-factory-context.js'

function fixture(taskStorage) {
  const win = new Window(), doc = win.document
  if (vi.isFakeTimers()) {
    win.setTimeout = (fn, ms) => setTimeout(fn, ms)
    win.clearTimeout = timer => clearTimeout(timer)
  }
  const snapshot = { draft: '保留未发送的文字', imageIds: [] }
  const shell = { snapshot, notify: vi.fn(), setDraft: vi.fn(draft => { snapshot.draft = draft }) }
  const listeners = new Set()
  const state = { running: false, chat: { order: [], nodes: new Map() } }
  const session = {
    sessionId: 'native-session', getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    prompt: vi.fn(async () => ({ ok: true })), readAttachment: vi.fn(),
  }
  const shells = new Map([[session.sessionId, shell]])
  const sessionsState = { current: session.sessionId, byId: { [session.sessionId]: { blank: false } } }
  const listListeners = new Set()
  const updateBlank = blank => {
    sessionsState.byId[session.sessionId].blank = blank
    for (const fn of listListeners) fn()
  }
  const notifyList = () => { for (const fn of listListeners) fn() }
  const setView = vi.fn()
  const sessionCatalog = {
    list: { getSnapshot: () => sessionsState, subscribe: fn => { listListeners.add(fn); return () => listListeners.delete(fn) } },
    binding: id => sessionsState.byId[id] ? { session } : undefined,
    create: vi.fn(async ({ sessionId }) => {
      sessionsState.byId[sessionId] = { blank: true }
      notifyList()
      return sessionId
    }),
    open: vi.fn(id => { sessionsState.current = id; notifyList() }),
    clear: vi.fn(() => { sessionsState.current = undefined; notifyList() }),
  }
  const events = (name, detail, cancelable = false) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail, cancelable }))
  const binding = installImageFactoryContext({
    sessions: sessionCatalog,
    getInput: id => shells.get(id),
    getPending: () => ({ shell, submitExternal: async submit => { sessionsState.current = session.sessionId; await submit(session.sessionId) } }),
    send: (...args) => binding.prompt(...args), doc, win, taskStorage,
    getTaskWorkspace: () => 'test-workspace', setTaskView: setView,
  })
  const respond = (error) => doc.addEventListener('sherlock:image-factory-prepare', ({ detail }) => {
    events('prepared', { id: detail.id, ...(error ? { error } : {
      operation: detail.cutout ? 'cutout' : detail.region ? 'region' : 'generate', size: '1024x1536', width: 200, height: 280, title: '海报',
      reference: detail.region || detail.cutout ? { data: 'AAAA', mediaType: 'image/png' } : undefined,
      editBounds: detail.region ? { left: .2, top: .2, right: .8, bottom: .8 } : undefined,
    }) })
  })
  return { win, doc, shell, shells, binding, session, events, respond, state, listeners, sessionsState, updateBlank, sessionCatalog, setView }
}

it('creates a fresh gallery scope per task, switches the native conversation and persists the open tabs', async () => {
  const storage = { read: vi.fn(async () => ({ epoch: 4, tabs: [] })), write: vi.fn(async () => {}) }
  const f = fixture(storage)
  let tasks, scope
  try {
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    f.doc.addEventListener('sherlock:image-factory-task-state', event => { tasks = event.detail })
    f.doc.addEventListener('sherlock:image-factory-session', event => { scope = event.detail.sessionId })
    f.events('request-session')
    await vi.waitFor(() => expect(tasks).toMatchObject({ active: 'native-session', busy: false }))
    f.events('task-title', { scope: 'native-session', title: '原始海报' })
    f.events('task-action', { kind: 'new' })
    await vi.waitFor(() => { expect(tasks.tabs).toHaveLength(2); expect(tasks.busy).toBe(false) })
    const newId = tasks.tabs[1].scope
    expect(newId).toMatch(/^image-task-/)
    expect(tasks.active).toBe(newId)
    expect(scope).toBe(newId)
    expect(f.sessionCatalog.create).toHaveBeenCalledWith({ workspaceId: 'test-workspace', sessionId: newId })
    expect(f.setView).toHaveBeenCalledWith(newId)
    expect(f.session.prompt).not.toHaveBeenCalled()
    f.events('task-action', { kind: 'select', scope: 'native-session' })
    expect(f.sessionsState.current).toBe('native-session')
    expect(scope).toBe('native-session')
    expect(tasks.tabs[0].title).toBe('原始海报')
    f.events('task-action', { kind: 'select', scope: newId })
    expect(scope).toBe(newId)
    f.events('task-action', { kind: 'close', scope: newId })
    expect(scope).toBe('native-session')
    expect(f.sessionsState.byId[newId]).toBeDefined()
    expect(storage.write).toHaveBeenLastCalledWith({
      epoch: 4, tabs: [{ scope: 'native-session', title: '原始海报' }], closed: [{ scope: newId }]
    })
    expect(tasks.canRestore).toBe(true)
    f.events('task-action', { kind: 'restore' })
    expect(tasks.tabs.map(tab => tab.scope)).toEqual(['native-session', newId])
    expect(scope).toBe(newId)
    f.events('task-action', { kind: 'reorder', scope: newId, before: 'native-session' })
    expect(tasks.tabs.map(tab => tab.scope)).toEqual([newId, 'native-session'])
    expect(scope).toBe(newId)
    expect(storage.write).toHaveBeenLastCalledWith({ epoch: 4, tabs: [{ scope: newId }, { scope: 'native-session', title: '原始海报' }] })
    f.events('task-action', { kind: 'pin', scope: 'native-session' })
    expect(tasks.tabs.map(tab => [tab.scope, !!tab.pinned])).toEqual([['native-session', true], [newId, false]])
    f.events('task-action', { kind: 'close-others', scope: 'native-session' })
    expect(tasks.tabs).toEqual([{ scope: 'native-session', title: '原始海报', pinned: true }])
    expect(tasks.canRestore).toBe(true)
    expect(scope).toBe('native-session')
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('shows a new tab while the Host is creating its session and rolls back on failure', async () => {
  const storage = { read: async () => ({ epoch: 4, tabs: [] }), write: vi.fn(async () => {}) }
  const f = fixture(storage)
  try {
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    let tasks, fail
    f.doc.addEventListener('sherlock:image-factory-task-state', event => { tasks = event.detail })
    const error = vi.fn()
    f.doc.addEventListener('sherlock:image-factory-task-error', error)
    f.events('request-session', { entry: true })
    await vi.waitFor(() => expect(tasks).toMatchObject({ active: 'native-session', busy: false }))
    storage.write.mockClear()

    f.sessionCatalog.create.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    f.events('task-action', { kind: 'new' })
    const provisional = tasks.tabs.at(-1).scope
    expect(provisional).toMatch(/^image-task-/)
    expect(tasks).toMatchObject({ active: provisional, creating: provisional, busy: true })
    expect(f.sessionsState.current).toBe('native-session')
    expect(storage.write).not.toHaveBeenCalled()
    expect(f.binding.fill('旧会话不能收到这条提示词')).toBe(false)
    await expect(f.binding.prompt(f.session, [{ type: 'text', text: '生成一张海报' }], 'queue')).rejects.toThrow('正在创建')
    expect(f.session.prompt).not.toHaveBeenCalled()

    fail(Error('Host 暂不可用'))
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
    expect(tasks).toMatchObject({ active: 'native-session', busy: false, tabs: [{ scope: 'native-session' }] })
    expect(tasks.tabs).toHaveLength(1)
    expect(storage.write).not.toHaveBeenCalled()
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('keeps a closed canvas tab closed when Home leaves an older native scope to be restored', async () => {
  const saved = { epoch: 4, tabs: [] }
  const storage = {
    read: async () => structuredClone(saved),
    write: async value => { Object.assign(saved, { ...value, closed: value.closed ?? [] }) },
  }
  const f = fixture(storage)
  try {
    const states = []
    f.doc.addEventListener('sherlock:image-factory-task-state', event => states.push(event.detail))
    const latest = () => states.at(-1)
    const show = () => { f.doc.body.dataset.workspaceSurface = 'image-factory'; f.events('request-session') }
    show()
    await vi.waitFor(() => expect(latest()).toMatchObject({ active: 'native-session', busy: false }))
    f.events('task-action', { kind: 'new' })
    await vi.waitFor(() => { expect(latest().tabs).toHaveLength(2); expect(latest().busy).toBe(false) })
    const closed = latest().active
    f.events('task-action', { kind: 'close', scope: closed })
    expect(latest().tabs.map(tab => tab.scope)).toEqual(['native-session'])
    expect(saved.closed).toEqual([{ scope: closed }])

    f.sessionCatalog.clear()
    delete f.doc.body.dataset.workspaceSurface
    show()
    f.events('request-session', { entry: true })
    // A stored standalone draft has a different scope, even when it has
    // exactly the same title and pixels as the task the user closed.
    expect(latest().tabs.map(tab => tab.scope)).toEqual(['native-session'])
    expect(f.sessionsState.current).toBe('native-session')
    delete f.doc.body.dataset.workspaceSurface
    // The native session can be reselected by the surrounding workspace.
    f.sessionCatalog.open(closed)
    show()
    expect(latest().tabs.some(tab => tab.scope === closed)).toBe(false)
    expect(f.sessionsState.current).toBe('native-session')

    // A renderer/account reload starts by reading the durable closed record.
    delete f.doc.body.dataset.workspaceSurface
    f.events('reset')
    saved.tabs.push({ scope: closed })
    f.sessionCatalog.open(closed)
    show()
    await vi.waitFor(() => expect(latest()).toMatchObject({ active: 'native-session', busy: false }))
    expect(latest().tabs.map(tab => tab.scope)).toEqual(['native-session'])

    // Following an explicit canvas source can reopen the same stored work.
    delete f.doc.body.dataset.workspaceSurface
    f.sessionCatalog.open(closed)
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    f.events('request-session', { reopen: closed })
    expect(latest().active).toBe(closed)
    expect(latest().tabs.map(tab => tab.scope)).toEqual(['native-session', closed])
    expect(saved.closed).toEqual([])

    // The close animation may deliver its action after Home has hidden Images.
    f.sessionCatalog.clear()
    delete f.doc.body.dataset.workspaceSurface
    f.events('task-action', { kind: 'close', scope: closed })
    expect(f.sessionsState.current).toBeUndefined()
    f.sessionCatalog.open(closed)
    show()
    expect(latest().active).toBe('native-session')

    f.events('canvas-intent', closed)
    f.sessionCatalog.open(closed)
    f.events('canvas-intent-ended', closed)
    expect(latest().active).toBe(closed)
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('opens a blank board workspace session in its own canvas scope', async () => {
  const f = fixture()
  try {
    const sessionId = 'board-app-board-file-session'
    f.sessionsState.byId[sessionId] = { blank: true }
    f.sessionCatalog.open(sessionId)
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const select = vi.fn()
    f.doc.addEventListener('sherlock:image-factory-session', select)
    f.events('request-session', { entry: true })
    expect(select).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { sessionId } }))
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('keeps an imported draft outside a blank native session until its first canvas prompt is admitted', async () => {
  const f = fixture()
  try {
    f.respond()
    const transitions = []
    let tasks
    f.doc.addEventListener('sherlock:image-factory-task-state', event => { tasks = event.detail })
    const selected = vi.fn(event => {
      transitions.push(['select', event.detail.sessionId])
      return event.detail.sessionId
    })
    const adoptions = vi.fn(event => {
      transitions.push(['adopt', event.detail.sessionId])
      f.events('adopted', { sessionId: event.detail.sessionId })
    })
    f.doc.addEventListener('sherlock:image-factory-session', selected)
    f.doc.addEventListener('sherlock:image-factory-adopt', adoptions)
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    f.updateBlank(true)
    f.events('task-title', { scope: null, title: '导入的海报' })
    expect(selected.mock.results.at(-1)?.value).toBeNull()
    expect(tasks.tabs).toEqual([{ scope: null, title: '导入的海报' }])
    const content = [{ type: 'text', text: '修改导入的海报' }]
    f.session.prompt.mockResolvedValueOnce({ ok: false })
    await f.binding.prompt(f.session, content, 'queue')
    expect(adoptions).not.toHaveBeenCalled()
    await f.binding.prompt(f.session, content, 'queue')
    expect(adoptions).not.toHaveBeenCalled()
    f.state.chat.order.push('user')
    f.state.chat.nodes.set('user', { kind: 'user', data: { content: f.session.prompt.mock.calls.at(-1)[0] } })
    f.state.running = true
    f.updateBlank(false)
    expect(selected.mock.results.at(-1)?.value).toBeNull()
    for (const listener of f.listeners) listener()
    expect(adoptions).toHaveBeenCalledOnce()
    expect(transitions.slice(-2)).toEqual([['adopt', f.session.sessionId], ['select', f.session.sessionId]])
    expect(tasks.tabs).toEqual([{ scope: f.session.sessionId, title: '导入的海报' }])
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('adds workspace context to the real native prompt while leaving ordinary chat unchanged', async () => {
  const f = fixture()
  try {
    f.respond()
    const content = [{ type: 'text', text: '用于活动的海报' }]
    f.doc.body.dataset.workspaceSurface = 'browser'
    await f.binding.prompt(f.session, content, 'queue')
    expect(f.session.prompt).toHaveBeenLastCalledWith(content, 'queue')
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    await f.binding.prompt(f.session, content, 'queue')
    const [nativeContent, mode] = f.session.prompt.mock.calls.at(-1)
    expect(mode).toBe('queue')
    expect(readImageFactoryContext(nativeContent[0].text)).toMatchObject({ operation: 'generate', text: content[0].text })
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字')
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('sends background removal through the shared native session with only the current canvas reference', async () => {
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const id = f.win.crypto.randomUUID()
    const reported = vi.fn()
    f.doc.addEventListener('sherlock:image-factory-cutout-result', reported)
    expect(f.events('cutout', { id, prompt: '去除当前图片的背景，保留主体。' }, true)).toBe(false)
    await vi.waitFor(() => expect(reported).toHaveBeenCalledTimes(1))
    const [[content, mode]] = f.session.prompt.mock.calls
    expect(mode).toBe('queue')
    expect(readImageFactoryContext(content[0].text)).toMatchObject({ id, operation: 'cutout', internalReference: true })
    expect(content.slice(1)).toEqual([{ type: 'image', data: 'AAAA', mediaType: 'image/png', name: '当前画布' }])
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字')
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('submits an anchored comment with a reference through the native session without replacing the composer draft', async () => {
  const f = fixture()
  try {
    f.sessionsState.current = undefined
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const submitted = new Promise(resolve => f.doc.addEventListener('sherlock:image-factory-comment-result', event => resolve(event.detail), { once: true }))
    const id = 'fc7906e2-8e95-4ccd-84af-a1e58247fe51'
    expect(f.events('comment', { id, prompt: '把框内的物件换成绿色' }, true)).toBe(false)
    expect(await submitted).toEqual({ id, error: undefined })
    expect(f.session.prompt).toHaveBeenCalledOnce()
    const [[content]] = f.session.prompt.mock.calls
    expect(readImageFactoryContext(content[0].text)).toMatchObject({
      id, operation: 'region', internalReference: true, editBounds: { left: .2, top: .2, right: .8, bottom: .8 }
    })
    expect(content[1]).toMatchObject({ type: 'image', data: 'AAAA', mediaType: 'image/png' })
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字')
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('unlocks the canvas when ordinary session admission rejects a command', async () => {
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    f.session.prompt.mockResolvedValueOnce({ ok: false })
    const settled = vi.fn()
    f.doc.addEventListener('sherlock:image-factory-settled', settled)
    await f.binding.prompt(f.session, [{ type: 'text', text: '修改图片' }], 'queue')
    expect(settled).toHaveBeenCalledOnce()
    expect(f.listeners.size).toBe(0)
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('unlocks a removed queued image request while an unrelated turn keeps running', async () => {
  vi.useFakeTimers()
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    f.state.running = true
    const settled = vi.fn()
    f.doc.addEventListener('sherlock:image-factory-settled', settled)
    await f.binding.prompt(f.session, [{ type: 'text', text: '第一张活动海报' }], 'queue')
    const [[content]] = f.session.prompt.mock.calls
    const id = readImageFactoryContext(content[0].text).id
    const other = { placement: 'queued', content: [{ type: 'text', text: '无关的排队对话' }] }
    const publish = queue => { f.state.queue = queue; for (const listener of f.listeners) listener() }
    publish([{ placement: 'queued', content }, other])
    await vi.advanceTimersByTimeAsync(2000)
    expect(settled).not.toHaveBeenCalled()
    publish([other])
    await vi.advanceTimersByTimeAsync(1000)
    publish([other])
    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: { id } }))
    expect(f.listeners.size).toBe(0)
  } finally { f.binding.dispose(); vi.useRealTimers(); await f.win.happyDOM.abort() }
})

it('keeps a queued image request through its handoff to the durable native turn', async () => {
  vi.useFakeTimers()
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const settled = vi.fn()
    const publish = () => { for (const listener of f.listeners) listener() }
    f.doc.addEventListener('sherlock:image-factory-settled', settled)
    await f.binding.prompt(f.session, [{ type: 'text', text: '下一张海报' }], 'queue')
    const [[content]] = f.session.prompt.mock.calls
    f.state.queue = [{ placement: 'queued', content }]
    publish()
    f.state.queue = []
    publish()
    await vi.advanceTimersByTimeAsync(500)
    f.state.chat.order.push('user')
    f.state.chat.nodes.set('user', { kind: 'user', data: { content } })
    f.state.running = true
    publish()
    await vi.advanceTimersByTimeAsync(2000)
    expect(settled).not.toHaveBeenCalled()
    expect(f.listeners.size).toBe(1)
    f.state.running = false
    publish()
    await vi.advanceTimersByTimeAsync(1600)
    expect(settled).toHaveBeenCalledOnce()
  } finally { f.binding.dispose(); vi.useRealTimers(); await f.win.happyDOM.abort() }
})

it('projects a completed native tool receipt once even after the canvas is hidden', async () => {
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    await f.binding.prompt(f.session, [{ type: 'text', text: '活动海报' }], 'queue')
    const [[content]] = f.session.prompt.mock.calls
    const { id } = readImageFactoryContext(content[0].text)
    f.sessionsState.byId[f.session.sessionId].title = '活动海报会话'
    const attachment = { attachmentId: 'generated-png', mediaType: 'image/png', width: 200, height: 280 }
    f.state.chat.order.push('tool')
    f.state.chat.nodes.set('tool', { kind: 'tool-call', data: { root: {
      callId: 'native-image-call', name: 'image_generate', content: [
        { type: 'text', text: JSON.stringify({ kind: 'odyssey-image-generation', ok: true, image: attachment, factory: { id } }) },
        { type: 'image', attachment },
      ],
    } } })
    f.session.readAttachment.mockResolvedValue({ ok: true, value: { attachment, data: Uint8Array.of(1, 2, 3) } })
    const delivered = new Promise(resolve => f.doc.addEventListener('sherlock:image-factory-deliver', event => {
      URL.revokeObjectURL(event.detail.url)
      resolve(event.detail)
    }, { once: true }))
    f.doc.body.dataset.workspaceSurface = 'knowledge'
    for (const listener of f.listeners) listener()
    for (const listener of f.listeners) listener()
    expect(await delivered).toMatchObject({ id, sessionId: 'native-session', sessionTitle: '活动海报会话', revoke: true })
    expect(f.session.readAttachment).toHaveBeenCalledExactlyOnceWith('generated-png')
    expect(f.listeners.size).toBe(0)
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('uses the shared composer draft when switching gallery examples', async () => {
  const f = fixture()
  try {
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    expect(f.events('use-prompt', { prompt: '样例一' }, true)).toBe(false)
    expect(f.events('use-prompt', { prompt: '样例二' }, true)).toBe(false)
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字\n\n样例二')
    expect(f.session.prompt).not.toHaveBeenCalled()
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('keeps the uploaded reference visible and appends the current canvas privately', async () => {
  const f = fixture()
  try {
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const canvas = { data: 'QUFB', mediaType: 'image/png' }
    const title = '花市海报'.repeat(30)
    f.doc.addEventListener('sherlock:image-factory-prepare', ({ detail }) => {
      expect(detail.uploaded).toBe(true)
      f.events('prepared', { id: detail.id, operation: 'edit', size: '1024x1536', width: 1080, height: 1350, title, reference: canvas })
    })
    const image = { type: 'image', data: 'QkJC', mediaType: 'image/png', name: '色卡.png' }
    const request = { type: 'text', text: '参考色卡，给当前海报换色' }
    await f.binding.prompt(f.session, [request, image], 'queue')
    const [[content]] = f.session.prompt.mock.calls
    expect(readImageFactoryContext(content[0].text)).toMatchObject({ title: title.slice(0, 100), internalReference: true })
    expect(content.slice(1)).toEqual([image, { type: 'image', ...canvas, name: '当前画布' }])
    await expect(f.binding.prompt(f.session, [request, image, image, image, image], 'queue')).rejects.toThrow('最多可再附加三张')
    expect(f.session.prompt).toHaveBeenCalledOnce()
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字')
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})

it('replaces each conversation’s gallery example after switching conversations', async () => {
  const f = fixture()
  try {
    const other = {
      snapshot: { draft: '另一个会话的文字' },
      setDraft(draft) { this.snapshot.draft = draft },
    }
    f.shells.set('other-session', other)
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const select = prompt => f.events('use-prompt', { prompt }, true)
    select('山脊徒步\n画面比例为 16:9。')
    f.sessionsState.current = 'other-session'
    select('橄榄绿香氛\n画面比例为 4:5。')
    f.sessionsState.current = f.session.sessionId
    select('提灯的狐狸\n画面比例为 4:5。')
    expect(f.shell.snapshot.draft).toBe('保留未发送的文字\n\n提灯的狐狸\n画面比例为 4:5。')
    expect(other.snapshot.draft).toBe('另一个会话的文字\n\n橄榄绿香氛\n画面比例为 4:5。')
    expect(f.session.prompt).not.toHaveBeenCalled()
  } finally { f.binding.dispose(); await f.win.happyDOM.abort() }
})
