import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { installImageFactoryContext } from '../scripts/lib/image-factory-native.mjs'
import { readImageFactoryContext } from '../packages/dsh-research-task-runtime/image-factory-context.js'

function fixture() {
  const win = new Window(), doc = win.document
  const snapshot = { draft: '保留未发送的文字', imageIds: [] }
  const shell = { snapshot, notify: vi.fn(), setDraft: vi.fn(draft => { snapshot.draft = draft }) }
  const listeners = new Set()
  const state = { running: false, chat: { order: [], nodes: new Map() } }
  const session = {
    sessionId: 'native-session', getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    prompt: vi.fn(async () => ({ ok: true })), readAttachment: vi.fn(),
  }
  const sessionsState = { current: session.sessionId }
  const events = (name, detail, cancelable = false) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail, cancelable }))
  const binding = installImageFactoryContext({
    sessions: { list: { getSnapshot: () => sessionsState }, binding: () => ({ session }) },
    getInput: () => shell,
    getPending: () => ({ shell, submitExternal: async submit => { sessionsState.current = session.sessionId; await submit(session.sessionId) } }),
    send: (...args) => binding.prompt(...args), doc, win,
  })
  const respond = (error) => doc.addEventListener('sherlock:image-factory-prepare', ({ detail }) => {
    events('prepared', { id: detail.id, ...(error ? { error } : {
      operation: detail.region ? 'region' : 'generate', size: '1024x1536', width: 200, height: 280, title: '海报',
      reference: detail.region ? { data: 'AAAA', mediaType: 'image/png' } : undefined,
    }) })
  })
  return { win, doc, shell, binding, session, events, respond, state, listeners, sessionsState }
}

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

it('submits an anchored comment with a reference through the native session without replacing the composer draft', async () => {
  const f = fixture()
  try {
    f.sessionsState.current = undefined
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    const submitted = new Promise(resolve => f.doc.addEventListener('sherlock:image-factory-comment-result', event => resolve(event.detail), { once: true }))
    expect(f.events('comment', { id: 'local-comment', prompt: '把框内的物件换成绿色' }, true)).toBe(false)
    expect(await submitted).toEqual({ id: 'local-comment', error: undefined })
    expect(f.session.prompt).toHaveBeenCalledOnce()
    const [[content]] = f.session.prompt.mock.calls
    expect(readImageFactoryContext(content[0].text)).toMatchObject({ operation: 'region', internalReference: true })
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

it('projects a completed native tool receipt once even after the canvas is hidden', async () => {
  const f = fixture()
  try {
    f.respond()
    f.doc.body.dataset.workspaceSurface = 'image-factory'
    await f.binding.prompt(f.session, [{ type: 'text', text: '活动海报' }], 'queue')
    const [[content]] = f.session.prompt.mock.calls
    const { id } = readImageFactoryContext(content[0].text)
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
    expect(await delivered).toMatchObject({ id, sessionId: 'native-session', revoke: true })
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
