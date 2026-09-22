import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it } from 'vitest'
import { installSkillComposer } from '../src/preload/integrations/skill-composer'
// @ts-expect-error The build patch is an untyped Node module.
import { patchIntegrationSkillComposer } from '../scripts/lib/patch-integration-skill-composer.mjs'

const require = createRequire(import.meta.url)
const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
let descriptor: any
runInNewContext(source.slice(0, source.indexOf('\n//# sourceMappingURL=client.js.map')), { window: { __ModuleLoader__: { load: (value: any) => { descriptor = value } } }, navigator: { platform: 'MacIntel' }, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
function fakeModule(): any { let fake: any; fake = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) }); return fake }
function store(initial: any) { let value = initial; return { getSnapshot: () => value, set: (next: any) => { value = next }, subscribe: () => () => {} } }
const client = descriptor.factory((id: string) => id.startsWith('react') ? require(id) : id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : fakeModule())
const alias = 'ework-skill-0123456789abcdef'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })

function fixture(research = false) {
    const window = new Window(), document = window.document as unknown as Document
    document.body.innerHTML = '<textarea data-odyssey-file-reference-session="other"></textarea><main inert><textarea data-odyssey-file-reference-session="current"></textarea></main><button>立即使用</button>'
    const textarea = document.querySelectorAll<HTMLTextAreaElement>('textarea')[1]!
    const sent: string[] = []
    const shell = new client.SessionInputShell({ actx: {}, defaultSink: (text: string) => sent.push(text) })
    shell.setDraft('保留正文')
    const list = store({ current: 'current' })
    const session = store({ removed: false, subagent: null })
    let subagent: unknown, blocked: unknown
    const sessions = { list, binding: () => ({ session }), subagentAddress: () => subagent }
    const inputHub = { shell: () => shell }
    const panel = { active: 'file', open: false }
    const researchSidebar = { stores: new Map([['current', store({ binding: { active: research } })]]), service: {
        activateTab: (id: string, scope: { sessionId: string }) => { expect(scope.sessionId).toBe('current'); panel.active = id },
        setPanelState: (patch: { open: boolean }) => { panel.open = patch.open }
    } }
    const dispose = installSkillComposer({ document, sessions, inputHub, researchSidebar, composerBlocks: { storeFor: () => ({ getSnapshot: () => blocked }) } })
    const request = (phase: string, args: Record<string, unknown> = {}) => new Promise<any>(resolve => {
        const requestId = window.crypto.randomUUID()
        const listener = (event: any) => { if (event.detail.requestId === requestId) { window.removeEventListener('sherlock:skill-compose-reply', listener); resolve(event.detail) } }
        window.addEventListener('sherlock:skill-compose-reply', listener)
        window.dispatchEvent(new window.CustomEvent('sherlock:skill-compose-request', { detail: { requestId, phase, ...args } }))
    })
    cleanup.push(async () => { dispose(); await window.happyDOM.close() })
    return { document, window, textarea, shell, list, session, sent, panel, request, dispose, setChild: () => { subagent = {} }, block: () => { blocked = { reason: 'approval' } } }
}

it('prepends a native skill token without replacing text, image drafts or inline file references and never sends', async () => {
    const f = fixture()
    f.shell.insertFilePaths(['/work/材料.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, ref = before.occurrences[0]
    const prepared = await f.request('prepare')
    expect(prepared.ok).toBe(true)
    expect(await f.request('insert', { token: prepared.token, invocationName: alias })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe('/ework-skill-0123456789abcdef 保留正文 \uFFFC ')
    expect(f.shell.snapshot.imageIds).toEqual(['image-a'])
    expect(f.shell.snapshot.occurrences).toMatchObject([{ occurrenceId: ref.occurrenceId, ref: ref.ref, offset: ref.offset + 30 }])
    expect(f.sent).toEqual([])
    expect(f.panel).toEqual({ active: 'file', open: false })
    f.shell.undo()
    expect(f.shell.snapshot.draft).toBe(before.draft)
})

it.each(['draft', 'session', 'disposed', 'readonly', 'blocked'])('rejects a stale or unavailable prepared input (%s) without changing it', async reason => {
    const f = fixture(), prepared = await f.request('prepare')
    if (reason === 'draft') f.shell.setDraft('后来输入')
    if (reason === 'session') f.list.set({ current: 'another' })
    if (reason === 'disposed') f.shell.dispose()
    if (reason === 'readonly') f.textarea.readOnly = true
    if (reason === 'blocked') f.block()
    const draft = f.shell.snapshot.draft
    expect(await f.request('insert', { token: prepared.token, invocationName: alias })).toMatchObject({ ok: false, message: expect.any(String) })
    expect(f.shell.snapshot.draft).toBe(draft)
    expect(f.sent).toEqual([])
})

it.each(['missing', 'child', 'disabled', 'busy'])('rejects prepare for an unavailable composer (%s)', async reason => {
    const f = fixture()
    if (reason === 'missing') f.list.set({ current: undefined })
    if (reason === 'child') f.setChild()
    if (reason === 'disabled') f.textarea.disabled = true
    if (reason === 'busy') f.shell.setResearchContextPreparing(true)
    expect(await f.request('prepare')).toMatchObject({ ok: false, message: expect.any(String) })
    expect(f.shell.snapshot.draft).toBe('保留正文')
})

it('rejects a forged alias and a cancelled token', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: 'skill\n发送' })).toMatchObject({ ok: false })
    const again = await f.request('prepare')
    expect(await f.request('cancel', { token: again.token })).toMatchObject({ ok: true })
    expect(await f.request('insert', { token: again.token, invocationName: alias })).toMatchObject({ ok: false })
    expect(f.shell.snapshot.draft).toBe('保留正文')
})

it('does not duplicate the same leading skill and opens the current research conversation tab', async () => {
    const f = fixture(true)
    f.shell.setDraft('/ework-skill-0123456789abcdef 已有需求')
    const revision = f.shell.snapshot.draftRev, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draftRev).toBe(revision)
    expect(f.panel).toEqual({ active: 'sherlock-research-conversation', open: true })
})

it('focuses only the prepared session after the surface closes, then consumes its token', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.textarea.value = f.shell.snapshot.draft // Native React input projection, not an adapter mutation.
    f.document.querySelector('main')!.removeAttribute('inert')
    const draft = f.shell.snapshot.draft
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect(f.document.activeElement).toBe(f.textarea)
    expect(f.textarea.selectionStart).toBe(30)
    expect(f.shell.snapshot.draft).toBe(draft)
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: false })
})

it('does not focus or revive a token after a session switch', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.list.set({ current: 'another' })
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: false })
    expect(f.document.activeElement).not.toBe(f.textarea)
})

it('cancels a queued focus frame when the request token is cancelled after insertion', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.textarea.value = f.shell.snapshot.draft
    f.document.querySelector('main')!.removeAttribute('inert')
    f.document.querySelector('button')!.focus()
    const focus = f.request('focus', { token: prepared.token })
    expect(await f.request('cancel', { token: prepared.token })).toMatchObject({ ok: true })
    expect(await focus).toMatchObject({ ok: false })
    expect(f.document.activeElement).not.toBe(f.textarea)
    expect(f.shell.snapshot.draft).toBe('/ework-skill-0123456789abcdef 保留正文')
})

it('reports an unavailable focus target without rewriting its DOM value or native draft', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    const before = f.shell.snapshot
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: false, message: expect.any(String) })
    expect(f.textarea.value).toBe('')
    expect(f.shell.snapshot).toBe(before)
})

it('focuses a native composer whose inline-reference renderer projects the placeholder character', async () => {
    const f = fixture()
    f.shell.insertFilePaths(['/work/材料.md'])
    const prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.textarea.value = f.shell.snapshot.draft.replace('\uFFFC', '\uE000')
    f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect(f.textarea.selectionStart).toBe(30)
    expect(f.shell.snapshot.occurrences).toHaveLength(1)
})

it('opens the native compact research panel exactly once after leaving the integrations surface', async () => {
    const f = fixture(true)
    f.window.innerWidth = 800
    const toggle = f.document.createElement('button')
    toggle.dataset.odysseyPanelEntry = 'right'; toggle.dataset.workspacePanel = 'integrations'
    toggle.setAttribute('aria-expanded', 'false'); f.document.body.append(toggle)
    f.document.body.dataset.workspaceSurface = 'integrations'
    let clicks = 0
    toggle.onclick = () => { clicks++; toggle.setAttribute('aria-expanded', 'true'); f.document.querySelector('main')!.removeAttribute('inert') }
    const prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.textarea.value = f.shell.snapshot.draft
    const focused = f.request('focus', { token: prepared.token })
    await new Promise(resolve => f.window.requestAnimationFrame(resolve))
    expect(clicks).toBe(0)
    delete f.document.body.dataset.workspaceSurface; delete toggle.dataset.workspacePanel
    expect(await focused).toMatchObject({ ok: true })
    expect(clicks).toBe(1)
    expect(f.document.activeElement).toBe(f.textarea)
})

it('does not open a compact right panel when using the ordinary chat composer', async () => {
    const f = fixture(false), toggle = f.document.createElement('button')
    toggle.dataset.odysseyPanelEntry = 'right'; toggle.setAttribute('aria-expanded', 'false'); f.document.body.append(toggle)
    let clicks = 0; toggle.onclick = () => { clicks++ }
    const prepared = await f.request('prepare')
    await f.request('insert', { token: prepared.token, invocationName: alias })
    f.textarea.value = f.shell.snapshot.draft; f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect(clicks).toBe(0)
})

it('patches the page plugin effect once and disposes its adapter with the owning fiber', () => {
    const effects: Array<() => void> = [], releases: string[] = []
    const anchor = 'const composerBlocks = new ComposerBlockRegistry();'
    const patch = patchIntegrationSkillComposer(anchor)
    const ctx = { effect: (fn: () => (() => void)) => effects.push(fn()) }
    runInNewContext(patch, { ComposerBlockRegistry: class {}, ctx, sessions: {}, inputHub: {}, researchSidebar: {}, window: { top: null }, sherlockBoardsPage: { installSkillComposer: () => () => releases.push('disposed') } })
    // Top-frame guard refuses iframe registration.
    expect(effects).toHaveLength(1)
    expect(effects[0]).toBeUndefined()
    const win: any = {}; win.top = win
    runInNewContext(patch, { ComposerBlockRegistry: class {}, ctx, sessions: {}, inputHub: {}, researchSidebar: {}, window: win, sherlockBoardsPage: { installSkillComposer: () => () => releases.push('disposed') } })
    effects[1]!()
    expect(releases).toEqual(['disposed'])
    expect(patchIntegrationSkillComposer(patch)).toBe(patch)
    expect(() => new Script(patchIntegrationSkillComposer(source))).not.toThrow()
})
