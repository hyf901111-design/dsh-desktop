import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { installHomeOperationsNavigation } from '../src/preload/home-operations-navigation'
// @ts-expect-error Build patch modules do not publish TypeScript declarations.
import { patchIntegrationSkillComposer } from '../scripts/lib/patch-integration-skill-composer.mjs'

const nativeSource = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const tabStart = nativeSource.indexOf('function conversationViewTabProps(')
const tabEnd = nativeSource.indexOf('/**', tabStart)
const nativeTabProps = runInNewContext(`(${nativeSource.slice(tabStart, tabEnd).trim()})`, {
  clsx: (...values: unknown[]) => values.filter(Boolean).join(' '),
  ConversationRoot_module_css_default: { tab: 'native-tab', tabActive: 'native-active' }
}) as (tab: { id: string; label: string }, active: string, select: (id: string) => void) => Record<string, any>

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
function store<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }, set: (next: T) => { value = next; for (const listener of listeners) listener() } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function fixture(current: string | undefined = 'current') {
  const win = new Window(), document = win.document as unknown as Document
  document.body.innerHTML = '<aside><button class="hHd-Xa_newSession">新会话</button><button class="hHd-Xa_newSession">新建研究看板</button></aside><div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"></div></div><div data-odyssey-subagent-panel><header data-srb-session-header data-ework-notes-session="child"><div data-srb-tabs><button data-conversation-view-id="research">研究</button></div></header></div>'
  const root = document.querySelector<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root')!
  const list = store<{ current?: string }>({ current })
  const workspaceList = store({ phase: 'ready', recentWorkspaceId: 'work', items: [{ workspaceId: 'work', path: '/work', sessionIds: [] as string[] }] })
  const sessionState = store<{ removed?: boolean; subagent?: unknown }>({})
  const binding = { session: sessionState }
  const submit = vi.fn(), shell = { disposed: false, snapshot: { draft: '保留正文与引用', draftRev: 7, phase: 'plain' }, submit }
  let blocked: unknown, activeView = 'chat'
  const render = (id?: string) => {
    root.replaceChildren()
    if (!id) return
    const header = document.createElement('header'); header.dataset.srbSessionHeader = ''; header.dataset.eworkNotesSession = id
    const tabs = document.createElement('div'); tabs.dataset.srbTabs = ''
    for (const view of ['chat', 'research', 'notes']) {
      const props = nativeTabProps({ id: view, label: view }, activeView, selected => {
        activeView = selected
        for (const tab of tabs.querySelectorAll<HTMLElement>('button')) tab.setAttribute('aria-selected', String(tab.dataset.conversationViewId === selected))
      })
      const button = document.createElement('button'); button.type = props.type; button.dataset.conversationViewId = props['data-conversation-view-id']; button.setAttribute('aria-selected', String(props['aria-selected'])); button.textContent = props.children; button.addEventListener('click', props.onClick); tabs.append(button)
    }
    header.append(tabs)
    const textarea = document.createElement('textarea'); textarea.dataset.odysseyFileReferenceSession = id; textarea.value = shell.snapshot.draft
    root.append(header, textarea)
  }
  render(current)
  const sessions = {
    list,
    create: vi.fn(async (_options: { workspaceId: string }) => 'created'),
    open: vi.fn((id: string) => { list.set({ current: id }); render(id) }),
    binding: vi.fn(() => binding),
    subagentAddress: vi.fn(() => undefined as unknown)
  }
  const workspaces = { list: workspaceList, connectWorkspace: vi.fn((workspaceId: string) => sessions.create({ workspaceId })) }
  const inputHub = { shell: vi.fn(() => shell) }, composerBlocks = { storeFor: () => ({ getSnapshot: () => blocked }) }
  const sidebarClick = vi.fn(); for (const button of document.querySelectorAll('aside button')) button.addEventListener('click', sidebarClick)
  const dispose = installHomeOperationsNavigation({ document, sessions, workspaces, inputHub, composerBlocks })
  const replies: any[] = []; win.addEventListener('sherlock:home-action-reply', (event: any) => replies.push(event.detail))
  const dispatch = (requestId: string, action: unknown) => win.dispatchEvent(new win.CustomEvent('sherlock:home-action-request', { detail: { requestId, action } }))
  const request = async (action: unknown, requestId: string = win.crypto.randomUUID()) => {
    dispatch(requestId, action)
    await vi.waitFor(() => expect(replies.some(reply => reply.requestId === requestId)).toBe(true))
    return replies.find(reply => reply.requestId === requestId)
  }
  cleanup.push(async () => { dispose(); await win.happyDOM.close() })
  return { win, document, root, list, workspaceList, sessions, workspaces, inputHub, shell, submit, binding, sessionState, sidebarClick, replies, dispose, dispatch, request, render, block: () => { blocked = { reason: 'approval' } }, active: () => activeView }
}

it.each(['research', 'notes'])('selects the current native %s tab without creating, sending or losing the draft', async action => {
  const f = fixture(), textarea = f.root.querySelector('textarea')!
  expect(await f.request(action)).toMatchObject({ ok: true, sessionId: 'current' })
  expect(f.active()).toBe(action)
  expect(f.root.querySelector('textarea')).toBe(textarea); expect(textarea.value).toBe('保留正文与引用')
  expect(f.shell.snapshot.draft).toBe('保留正文与引用'); expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.sessions.open).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled(); expect(f.sidebarClick).not.toHaveBeenCalled()
  expect(f.document.querySelector('[data-odyssey-subagent-panel] button')?.getAttribute('aria-selected')).toBeNull()
})

it('only ensures an editable native composer and returns its current session without changing the view', async () => {
  const f = fixture()
  expect(await f.request('composer')).toMatchObject({ ok: true, sessionId: 'current', draftRev: 7 })
  expect(f.active()).toBe('chat'); expect(f.document.activeElement).toBe(f.document.body)
  expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
})

it('broadcasts every real A to B to A selection change after a navigation ticket has already completed', async () => {
  const f = fixture(), changes: any[] = []
  f.win.addEventListener('sherlock:home-action-context-changed', (event: any) => changes.push(event.detail))
  expect(await f.request('composer')).toMatchObject({ ok: true, sessionId: 'current' })
  f.list.set({ current: 'another' }); f.list.set({ current: 'current' }); f.list.set({ current: 'current' })
  expect(changes).toEqual([{ sessionId: 'another', revision: 1 }, { sessionId: 'current', revision: 2 }])
})

it('marks only the request-owned native materialization open with its request ID', async () => {
  const f = fixture(), changes: any[] = []
  f.list.set({ current: undefined }); f.render(undefined)
  f.win.addEventListener('sherlock:home-action-context-changed', (event: any) => changes.push(event.detail))
  expect(await f.request('composer', 'owned-open')).toMatchObject({ ok: true, sessionId: 'created' })
  expect(changes).toEqual([{ sessionId: 'created', revision: 2, ownedRequestId: 'owned-open' }])
  f.list.set({ current: 'user-selection' })
  expect(changes[1]).toEqual({ sessionId: 'user-selection', revision: 3 })
})

it('broadcasts unowned identity and disposal changes, then stops observing selection', async () => {
  const f = fixture(), changes: any[] = []
  f.win.addEventListener('sherlock:home-action-context-changed', (event: any) => changes.push(event.detail))
  expect(await f.request('composer')).toMatchObject({ ok: true })
  f.win.dispatchEvent(new f.win.Event('sherlock:skill-menu-reset'))
  f.dispose(); f.list.set({ current: 'after-disposal' })
  expect(changes).toEqual([{ sessionId: 'current', revision: 1 }, { sessionId: 'current', revision: 2 }])
})

it('requires a whitelisted string action instead of coercing a forged object into native navigation', async () => {
  const f = fixture()
  expect(await f.request({ toString: () => 'research' })).toMatchObject({ ok: false })
  expect(f.active()).toBe('chat'); expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
})

it('coalesces initial-home requests into one native workspace connection and one open, with latest intent winning', async () => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined)
  const creating = deferred<string>(); f.sessions.create.mockReturnValue(creating.promise)
  f.dispatch('first', 'research'); f.dispatch('latest', 'notes')
  await vi.waitFor(() => expect(f.sessions.create).toHaveBeenCalledTimes(1))
  creating.resolve('created')
  await vi.waitFor(() => expect(f.replies.find(reply => reply.requestId === 'latest')).toMatchObject({ ok: true, sessionId: 'created' }))
  expect(f.replies.find(reply => reply.requestId === 'first')).toMatchObject({ ok: false })
  expect(f.workspaces.connectWorkspace).toHaveBeenCalledExactlyOnceWith('work'); expect(f.sessions.open).toHaveBeenCalledExactlyOnceWith('created'); expect(f.active()).toBe('notes'); expect(f.submit).not.toHaveBeenCalled()
})

it('reuses a workspace blank session returned by the native connection instead of creating another', async () => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined)
  f.workspaces.connectWorkspace.mockResolvedValue('existing-blank')
  expect(await f.request('research')).toMatchObject({ ok: true, sessionId: 'existing-blank' })
  expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.sessions.open).toHaveBeenCalledExactlyOnceWith('existing-blank'); expect(f.active()).toBe('research')
})

it('refuses an initial home without a workspace and preserves the current page', async () => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined); f.workspaceList.set({ phase: 'ready', recentWorkspaceId: 'missing', items: [] })
  expect(await f.request('notes')).toMatchObject({ ok: false, message: expect.stringMatching(/工作区/) })
  expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.sessions.open).not.toHaveBeenCalled(); expect(f.sidebarClick).not.toHaveBeenCalled()
})

it.each(['switch', 'away-and-back', 'identity', 'cancel', 'dispose'])('does not navigate an asynchronously created session after %s', async reason => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined)
  const creating = deferred<string>(); f.sessions.create.mockReturnValue(creating.promise)
  f.dispatch('pending', 'research')
  await vi.waitFor(() => expect(f.sessions.create).toHaveBeenCalledTimes(1))
  if (reason === 'switch') f.list.set({ current: 'user-choice' })
  if (reason === 'away-and-back') { f.list.set({ current: 'user-choice' }); f.list.set({ current: undefined }) }
  if (reason === 'identity') f.win.dispatchEvent(new f.win.Event('sherlock:skill-menu-reset'))
  if (reason === 'cancel') f.dispatch('pending', 'cancel')
  if (reason === 'dispose') f.dispose()
  creating.resolve('created'); await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.sessions.open).not.toHaveBeenCalled(); expect(f.active()).toBe('chat'); expect(f.submit).not.toHaveBeenCalled()
  expect(f.replies.filter(reply => reply.requestId === 'pending' && reply.ok)).toHaveLength(0)
})

it('does not start a queued workspace connection after immediate cancellation', async () => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined)
  f.dispatch('cancel-before-create', 'research'); f.dispatch('cancel-before-create', 'cancel')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.sessions.open).not.toHaveBeenCalled()
})

it('rejects a removed workspace or failed native connection without opening a session', async () => {
  const f = fixture(); f.list.set({ current: undefined }); f.render(undefined)
  const creating = deferred<string>(); f.sessions.create.mockReturnValue(creating.promise)
  f.dispatch('removed-workspace', 'research')
  await vi.waitFor(() => expect(f.sessions.create).toHaveBeenCalledOnce())
  f.workspaceList.set({ phase: 'ready', recentWorkspaceId: 'work', items: [] }); creating.resolve('created')
  await vi.waitFor(() => expect(f.replies.find(reply => reply.requestId === 'removed-workspace')).toMatchObject({ ok: false }))
  expect(f.sessions.open).not.toHaveBeenCalled()
  f.workspaceList.set({ phase: 'ready', recentWorkspaceId: 'work', items: [{ workspaceId: 'work', path: '/work', sessionIds: [] }] })
  f.workspaces.connectWorkspace.mockRejectedValueOnce(Error('工作区暂不可用'))
  expect(await f.request('notes')).toMatchObject({ ok: false, message: '工作区暂不可用' })
  expect(f.sessions.open).not.toHaveBeenCalled()
})

it('ignores completed request replay and no longer handles requests after disposal', async () => {
  const f = fixture()
  expect(await f.request('research', 'once')).toMatchObject({ ok: true })
  f.dispatch('once', 'notes'); await Promise.resolve()
  expect(f.active()).toBe('research'); expect(f.replies.filter(reply => reply.requestId === 'once')).toHaveLength(1)
  f.dispose(); f.dispatch('after-dispose', 'notes'); await Promise.resolve()
  expect(f.active()).toBe('research'); expect(f.replies.some(reply => reply.requestId === 'after-dispose')).toBe(false)
})

it.each(['disabled', 'readonly', 'blocked', 'removed', 'child', 'busy'])('rejects unavailable native composer (%s) without sending or rewriting it', async reason => {
  const f = fixture(), textarea = f.root.querySelector('textarea')!
  if (reason === 'disabled') textarea.disabled = true
  if (reason === 'readonly') textarea.readOnly = true
  if (reason === 'blocked') f.block()
  if (reason === 'removed') f.sessionState.set({ removed: true })
  if (reason === 'child') f.sessions.subagentAddress.mockReturnValue({})
  if (reason === 'busy') f.shell.snapshot.phase = 'sending'
  expect(await f.request('composer')).toMatchObject({ ok: false, message: expect.any(String) })
  expect(f.shell.snapshot.draft).toBe('保留正文与引用'); expect(f.submit).not.toHaveBeenCalled(); expect(f.sessions.create).not.toHaveBeenCalled()
})

it('cancels a native-tab wait on user navigation and never clicks another session header', async () => {
  const f = fixture(); f.root.querySelector('[data-srb-tabs]')!.remove()
  f.dispatch('waiting', 'research'); f.list.set({ current: 'another' }); f.render('another')
  await vi.waitFor(() => expect(f.replies.find(reply => reply.requestId === 'waiting')).toMatchObject({ ok: false }))
  expect(f.active()).toBe('chat'); expect(f.sessions.open).not.toHaveBeenCalled()
})

it('adds an independently owned, idempotent top-frame navigation effect while preserving the skill installer', () => {
  const source = patchIntegrationSkillComposer('const composerBlocks = new ComposerBlockRegistry();')
  expect(source).toContain('/* sherlock:home-operations-navigation:v1 */')
  expect(source).toContain('/* sherlock:integration-skill-composer:v2 */')
  expect(patchIntegrationSkillComposer(source)).toBe(source)
  const homeDispose = vi.fn(), skillDispose = vi.fn(), effects: Array<undefined | (() => void)> = []
  const win: any = {}; win.top = win
  const deps = { sessions: {}, workspaces: {}, inputHub: {}, researchSidebar: {} }
  const install = vi.fn(() => homeDispose)
  runInNewContext(source, { ...deps, window: win, ComposerBlockRegistry: class {}, ctx: { inject: () => {}, effect: (fn: () => (() => void) | undefined) => effects.push(fn()) }, sherlockBoardsPage: { installHomeOperationsNavigation: install, installSkillComposer: () => skillDispose } })
  expect(install).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessions: deps.sessions, workspaces: deps.workspaces, inputHub: deps.inputHub }))
  for (const dispose of effects) dispose?.()
  expect(homeDispose).toHaveBeenCalledOnce(); expect(skillDispose).toHaveBeenCalledOnce()
})
