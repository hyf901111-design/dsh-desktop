import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { patchSidebarFileReference, patchConversationFileReference } from '../scripts/lib/sidebar-file-reference.mjs'

const require = createRequire(import.meta.url)
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const originalSidebar = readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', 'utf8')
const originalConversation = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const sidebar = patchSidebarFileReference(originalSidebar)
const conversation = patchConversationFileReference(originalConversation)
function fakeModule(): any {
  let fake: any
  fake = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  return fake
}
function store(initial: any) { let value = initial; return { getSnapshot: () => value, set: (next: any) => { value = next }, subscribe: () => () => {} } }
let descriptor: any
runInNewContext(conversation.replace('exports.apply = apply;', 'exports.apply = apply; exports.__testInputBar = InputBar;'), { window: { __ModuleLoader__: { load: (value: any) => { descriptor = value } } }, navigator: { platform: "MacIntel" }, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
const client = descriptor.factory((id: string) => id.startsWith('react') ? require(id) : id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : id === '@deepseek-ai/dsh-client-ui-primitives' ? new Proxy({ Tooltip: ({ children }: any) => children, MessageText: ({ text }: any) => createElement('span', null, text) }, { get: (target, property) => Reflect.get(target, property) ?? (() => null) }) : id === '@deepseek-ai/dsh-client-ui-attachment' ? { DropOverlay: () => null, AttachmentRail: () => null, ImageGallery: () => null } : fakeModule())

function fixture(draft = '', sessionId = 'new-chat') {
  const win = new Window(), doc = win.document
  // A different session comes first: global textarea selectors would focus it.
  doc.body.innerHTML = '<textarea data-odyssey-file-reference-session="other"></textarea><textarea></textarea><button>@文件</button>'
  const input = doc.querySelectorAll('textarea')[1]!
  input.dataset.odysseyFileReferenceSession = sessionId
  const sent: string[] = []
  const shell = new client.SessionInputShell({ actx: {}, defaultSink: (text: string) => { sent.push(text) }, inputTriggers: () => ({ serializeReference: (_source: string, ref: string, signal: AbortSignal) => client.chatFileReferenceCodec.serialize(ref, signal) }) })
  shell.setDraft(draft); input.value = draft; input.setSelectionRange(draft.length, draft.length)
  const scope = {}, ctx = { sessions: { scope: (id: string) => id === sessionId ? scope : undefined }, get: () => ({ input: { for: (actx: unknown) => { if (actx !== scope) throw Error('wrong scope'); return shell } } }) }
  const frames: Array<() => void> = []
  const helperAt = sidebar.indexOf('function insertSidebarFileReference(')
  const helperEnd = sidebar.indexOf('\n/* odyssey:sidebar-file-reference:end */', helperAt)
  const helpers = helperAt < 0 ? '' : sidebar.slice(helperAt, helperEnd)
  const appendAt = sidebar.indexOf('function appendToDraft('), appendEnd = sidebar.indexOf('\n\t\t//#endregion', appendAt)
  const callbackAt = sidebar.indexOf('const referenceInChat ='), callbackEnd = sidebar.indexOf('\n\t\t\tif (state ===', callbackAt)
  const context = { ctx, sessionId, cwd: '/work', document: doc, requestAnimationFrame: (fn: () => void) => { frames.push(fn) }, react: { useCallback: (fn: unknown) => fn }, relativeTo: (_cwd: string, path: string) => path.split('/').at(-1), console }
  const reference = runInNewContext(helpers + '\n' + sidebar.slice(appendAt, appendEnd) + '\n' + sidebar.slice(callbackAt, callbackEnd) + '\nreferenceInChat', context)
  const insert = (path: string) => { doc.querySelector('button')!.focus(); reference(path); input.value = shell.snapshot.draft; while (frames.length) frames.shift()!() }
  return { doc, input, shell, reference, frames, insert, ctx, sent }
}

describe('Files native inline references', () => {
  it.each(['new-chat', 'existing-chat'])('inserts between surrounding text in %s and restores that composer focus', sessionId => {
    const f = fixture('正文前：；正文后', sessionId)
    f.input.setSelectionRange(4, 4); f.insert('/work/01-中文阅读样本.md')
    expect(f.shell.snapshot.draft).toBe('正文前：\uFFFC ；正文后')
    expect(f.shell.snapshot.occurrences).toMatchObject([{ source: 'chat-file', label: '01-中文阅读样本.md', offset: 4 }])
    expect(f.doc.activeElement).toBe(f.input)
    expect(f.input.selectionStart).toBe(6)
  })
  it('keeps same-name paths distinct during consecutive inserts and uses the native codec and delete action', async () => {
    const f = fixture('前后'); f.input.setSelectionRange(1, 1)
    f.insert('/one/同名.md'); f.insert('/two/同名.md')
    expect(f.shell.snapshot.draft).toBe('前\uFFFC \uFFFC 后')
    const refs = f.shell.snapshot.occurrences
    expect(refs.map((r: any) => JSON.parse(r.ref).path)).toEqual(['/one/同名.md', '/two/同名.md'])
    expect(refs[0].occurrenceId).not.toBe(refs[1].occurrenceId)
    const serialized = await Promise.all(refs.map((r: any) => client.chatFileReferenceCodec.serialize(r.ref, new AbortController().signal)))
    expect(serialized).toEqual(['📎 文件：`/one/同名.md`', '📎 文件：`/two/同名.md`'])
    client.deleteResearchReferenceOccurrence(f.shell, refs[0].occurrenceId)
    expect(f.shell.snapshot.occurrences.map((r: any) => JSON.parse(r.ref).path)).toEqual(['/two/同名.md'])
  })
  it('replaces a selection and retains the native append behavior for uploads', () => {
    const f = fixture('前替换后'); f.input.setSelectionRange(1, 3); f.insert('/work/file.md')
    expect(f.shell.snapshot.draft).toBe('前\uFFFC 后')
    const append = new client.SessionInputShell({ actx: {}, defaultSink: () => {} }); append.setDraft('请分析')
    append.actions.insertFilePaths(['/one/a.md', '/two/b.md'])
    expect(append.snapshot.draft).toBe('请分析 \uFFFC \uFFFC ')
  })
  it.each(['disabled', 'readOnly', 'detached', 'wrong-session'])('does not mutate or focus an unavailable composer (%s)', reason => {
    const f = fixture('原文')
    if (reason === 'disabled') f.input.disabled = true
    if (reason === 'readOnly') f.input.readOnly = true
    if (reason === 'detached') f.input.remove()
    if (reason === 'wrong-session') f.input.dataset.odysseyFileReferenceSession = 'other'
    f.insert('/work/file.md')
    expect(f.shell.snapshot.draft).toBe('原文')
    expect(f.doc.activeElement?.tagName).toBe('BUTTON')
  })
  it('does not steal focus after the session/input changes before the animation frame', () => {
    const f = fixture('原文'); f.doc.querySelector('button')!.focus(); f.reference('/work/file.md')
    f.input.dataset.odysseyFileReferenceSession = 'replacement'
    while (f.frames.length) f.frames.shift()!()
    expect(f.doc.activeElement?.tagName).toBe('BUTTON')
  })
  it.each([false, true])('renders the real ordinary InputBar with native file references while running=%s', running => {
    const f = fixture('正文'); f.insert('/work/材料.md')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    let html: string
    try {
      html = renderToStaticMarkup(createElement(client.__testInputBar, {
        useSession: (select: any) => select({ running, promptError: null, subagent: null, removed: false }),
        useInput: (select: any) => select(f.shell.snapshot), inputActions: f.shell.actions, keyboard: f.shell,
        renderSlot: () => null, useNotices: (select: any) => select(null), useLexicon: (select: any) => select(new Map()),
        useMenuLauncher: (select: any) => select(null), useProjection: (_name: string, select?: any) => select?.(undefined),
        sessionId: 'new-chat', t: (key: string) => key, variant: 'composer'
      }))
    } finally { quiet.mockRestore() }
    const win = new Window(); win.document.body.innerHTML = html!
    const textarea = win.document.querySelector('textarea')!
    expect(textarea.dataset.odysseyFileReferenceSession).toBe('new-chat')
    expect(textarea.disabled).toBe(false); expect(textarea.readOnly).toBe(false)
    const chip = win.document.querySelector('[data-reference-source="chat-file"]')!
    expect(chip).not.toBeNull(); expect(chip.getAttribute('data-chat-file-tag')).toBe('/work/材料.md')
  })
  it('sends the native serialized payload and renders the existing clickable sent file chip', async () => {
    const f = fixture('前后'); f.input.setSelectionRange(1, 1); f.insert('/work/材料.md')
    f.shell.sinkSerialized(f.shell.snapshot.draft, 'queue')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    expect(f.sent[0]).toBe('前📎 文件：`/work/材料.md` 后')
    const html = renderToStaticMarkup(createElement(client.UserStyleBubble, {
      content: [{ type: 'text', text: f.sent[0] }], imageLoader: async () => '', t: (key: string) => key,
      openFile: () => {}
    }))
    const win = new Window(); win.document.body.innerHTML = html
    expect(win.document.querySelector('.gdEzaW_refChip')?.tagName).toBe('BUTTON')
    expect(win.document.body.textContent).toContain('材料.md')
    expect(win.document.body.textContent).not.toContain('/work/')
  })
  it('rejects a stale native span without losing the existing draft or references', () => {
    const f = fixture('正文'), old = f.shell.snapshot.draftRev
    f.shell.setDraft('正文新增')
    expect(f.shell.insertFilePaths(['/work/file.md'], { start: 1, end: 1, draftRev: old })).toBeNull()
    expect(f.shell.snapshot.draft).toBe('正文新增'); expect(f.shell.snapshot.occurrences).toHaveLength(0)
  })
  it('keeps unrelated text insertion unchanged and both real bundle transforms idempotent', () => {
    const appendAt = originalSidebar.indexOf('function appendToDraft('), appendEnd = originalSidebar.indexOf('\n\t\t//#endregion', appendAt)
    expect(sidebar).toContain(originalSidebar.slice(appendAt, appendEnd))
    expect(patchSidebarFileReference(sidebar)).toBe(sidebar)
    expect(patchConversationFileReference(conversation)).toBe(conversation)
    expect(() => new Script(sidebar)).not.toThrow(); expect(() => new Script(conversation)).not.toThrow()
    expect(conversation.includes('"data-odyssey-file-reference-session": sessionId')).toBe(true)
  })
})
