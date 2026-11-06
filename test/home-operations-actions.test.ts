import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { createHomeOperationsActions } from '../src/preload/home-operations-actions'
import { installHomeOperationsNavigation } from '../src/preload/home-operations-navigation'
import { createSkillUseBridge } from '../src/preload/integrations/skill-use'
import { installSkillComposer } from '../src/preload/integrations/skill-composer'
import { decodeSkillReference, SKILL_REFERENCE_SOURCE } from '../src/shared/skill-reference'
import type { IntegrationBridge, IntegrationCommand, IntegrationReply, IntegrationRow, SkillDetail } from '../src/shared/integration-ui'

const require = createRequire(import.meta.url)
const nativeSource = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
let descriptor: any
runInNewContext(nativeSource.slice(0, nativeSource.indexOf('\n//# sourceMappingURL=client.js.map')), {
  window: { __ModuleLoader__: { load: (value: unknown) => { descriptor = value } } },
  navigator: { platform: 'MacIntel' }, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  document: new Window().document,
})
function fakeModule(): any { let fake: any; fake = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) }); return fake }
function store<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, set(next: T) { value = next; listeners.forEach(listener => listener()) }, subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) } }
}
const native = descriptor.factory((id: string) => id.startsWith('react') ? require(id) : id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : fakeModule())
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
const ids = { ppt: 'builtin:efund-ppt-maker', report: 'builtin:ework-equity-research' } as const
const details: Record<string, SkillDetail> = {
  [ids.ppt]: { type: 'skill-detail', id: ids.ppt, revision: 3, enabled: true, invocationName: 'ework-skill-0123456789abcdef', invocationLabel: 'efund-ppt-maker', content: '# Fresh installed presentation skill' },
  [ids.report]: { type: 'skill-detail', id: ids.report, revision: 7, enabled: true, invocationName: 'ework-skill-fedcba9876543210', invocationLabel: 'ework-equity-research', content: '# Fresh installed equity skill' },
}

function fixture({ draft = '', waitDetail = false, waitSnapshot = false, beforeNavigate }: { draft?: string; waitDetail?: boolean; waitSnapshot?: boolean; beforeNavigate?(): Promise<void> } = {}) {
  const window = new Window({ url: 'http://127.0.0.1/' }), document = window.document as unknown as Document
  document.body.innerHTML = `<div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home">
    <header data-srb-session-header data-ework-notes-session="current"><div data-srb-tabs>
      <button role="tab" data-conversation-view-id="conversation" aria-selected="true">对话</button>
      <button role="tab" data-conversation-view-id="research" aria-selected="false">研究</button>
      <button role="tab" data-conversation-view-id="notes" aria-selected="false">笔记</button>
    </div></header><main inert><textarea data-odyssey-file-reference-session="current"></textarea><textarea data-odyssey-file-reference-session="other"></textarea></main>
  </div></div>`
  const trace: string[] = [], sent: string[] = []
  const shells = new Map(['current', 'other'].map(id => [id, new native.SessionInputShell({ actx: {}, defaultSink: (text: string) => sent.push(text) })]))
  const shell: any = shells.get('current'), other: any = shells.get('other')
  shell.setDraft(draft); other.setDraft('另一会话草稿')
  const list = store<{ current?: string }>({ current: 'current' })
  const bindings = new Map(['current', 'other'].map(id => [id, { session: store({ removed: false, subagent: null }) }]))
  const sessions = {
    list, binding: (id: string) => bindings.get(id),
    subagentAddress: () => undefined,
    create: vi.fn(async (): Promise<string> => { throw Error('An existing home session must be reused') }),
    open: vi.fn(async (id: string) => list.set({ current: id })),
  }
  const workspaces = { list: store({ items: [{ workspaceId: 'workspace-1', path: '/test/work', sessionIds: ['current', 'other'] }], recentWorkspaceId: 'workspace-1' }), connectWorkspace: vi.fn(async (): Promise<string> => { throw Error('A current home session must not connect a workspace') }) }
  const inputHub = { shell: (id: string) => shells.get(id) as any }
  const composerBlocks = { storeFor: () => ({ getSnapshot: () => undefined }) }
  const researchStore = store({ binding: { active: false } })
  const researchSidebar = { stores: new Map([['current', researchStore]]), service: { activateTab: vi.fn(), setPanelState: vi.fn() } }
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-conversation-view-id]')) tab.addEventListener('click', () => {
    trace.push(`tab:${tab.dataset.conversationViewId}`)
    for (const sibling of document.querySelectorAll('[data-conversation-view-id]')) sibling.setAttribute('aria-selected', String(sibling === tab))
    researchStore.set({ binding: { active: tab.dataset.conversationViewId === 'research' } })
  })
  const releaseNavigation = installHomeOperationsNavigation({ document, sessions, workspaces, inputHub, composerBlocks } as any)
  const releaseComposer = installSkillComposer({ document, sessions, inputHub, researchSidebar, composerBlocks })
  const projectNativeDraft = () => {
    for (const input of document.querySelectorAll<HTMLTextAreaElement>('textarea')) input.value = (shells.get(input.dataset.odysseyFileReferenceSession!) as any).snapshot.draft.replaceAll('\uFFFC', '\uE000')
  }
  // Mirrors the native React projection; all draft mutations still go through
  // the actual SessionInputShell and the installed skill-composer adapter.
  window.addEventListener('sherlock:skill-compose-request', event => {
    const phase = (event as unknown as CustomEvent).detail.phase
    trace.push(`compose:${phase}`); projectNativeDraft()
  })
  window.addEventListener('sherlock:home-action-request', event => { trace.push(`home:${(event as unknown as CustomEvent).detail.action}`) })
  const rows: IntegrationRow[] = [
    { id: 'managed:same-name-ppt', kind: 'skill', tab: 'skills', name: 'efund-ppt-maker', description: '', source: '个人', status: '', revision: 99, enabled: true, invocationName: 'ework-skill-aaaaaaaaaaaaaaaa', invocationLabel: 'efund-ppt-maker' },
    ...Object.values(details).map(detail => ({ id: detail.id, kind: 'skill' as const, tab: 'skills' as const, name: detail.invocationLabel!, description: '', source: 'EWork 内置', status: '', revision: detail.revision, enabled: true, invocationName: 'ework-skill-0000000000000000', invocationLabel: detail.invocationLabel })),
  ]
  const detailResult = deferred<SkillDetail>(), snapshotResult = deferred<IntegrationReply>()
  const request: IntegrationBridge['request'] = vi.fn(async (command: IntegrationCommand): Promise<IntegrationReply> => {
    trace.push(`ipc:${command.type}`)
    if (command.type === 'snapshot') return waitSnapshot ? snapshotResult.promise : { type: 'snapshot', snapshot: { revision: 12, rows } }
    if (command.type === 'skill-detail') return waitDetail ? detailResult.promise : { ...details[command.id]! }
    throw Error(`Unexpected external command ${command.type}`)
  })
  const skill = createSkillUseBridge(document, { request }, () => { trace.push('skill:reveal'); document.querySelector('main')!.removeAttribute('inert') })
  const actions = createHomeOperationsActions(document, { request, useSkill: skill.useSkill }, { beforeNavigate })
  const abort = new AbortController(), reveal = deferred<void>()
  const context = { signal: abort.signal, revealComposer: vi.fn(async () => { trace.push('reveal:start'); await reveal.promise; document.querySelector('main')!.removeAttribute('inert'); trace.push('reveal:ready') }) }
  const textarea = document.querySelector<HTMLTextAreaElement>('[data-odyssey-file-reference-session="current"]')!
  projectNativeDraft()
  cleanup.push(async () => { actions.dispose(); skill.dispose(); releaseComposer(); releaseNavigation(); await window.happyDOM.close() })
  return { window, document, shell, other, textarea, list, sessions, shells, bindings, workspaces, rows, request, trace, sent, actions, context, abort, reveal, detailResult, snapshotResult, projectNativeDraft }
}

it.each([{ card: 'board', tab: 'research' }, { card: 'note', tab: 'notes' }] as const)('opens the current native $tab view for $card without creating or sending', async ({ card, tab }) => {
  const f = fixture({ draft: '保留现有草稿' })
  await f.actions.run(card, f.context)
  expect(f.trace).toContain(`tab:${tab}`)
  expect(f.document.querySelector(`[data-conversation-view-id="${tab}"]`)!.getAttribute('aria-selected')).toBe('true')
  expect(f.request).not.toHaveBeenCalled()
  expect(f.context.revealComposer).not.toHaveBeenCalled()
  expect(f.sessions.create).not.toHaveBeenCalled(); expect(f.workspaces.connectWorkspace).not.toHaveBeenCalled()
  expect(f.shell.snapshot.draft).toBe('保留现有草稿'); expect(f.sent).toEqual([])
})

it.each(['ppt', 'report'] as const)('waits for the composer and replaces the old prompt with the exact builtin %s skill while preserving attachments', async card => {
  const f = fixture({ draft: '  原有需求\n补充说明' })
  f.shell.insertFilePaths(['/work/材料.md']); f.shell.addImages(['image-a']); f.projectNativeDraft()
  const before = f.shell.snapshot, oldFile = before.occurrences[0]
  const operation = f.actions.run(card, f.context)
  await vi.waitFor(() => expect(f.context.revealComposer).toHaveBeenCalledTimes(1))
  expect(f.trace).not.toContain('compose:prepare')
  expect(f.shell.snapshot.draft).toBe(before.draft)
  f.reveal.resolve()
  await operation
  expect(f.trace.indexOf('compose:prepare')).toBeGreaterThan(f.trace.indexOf('reveal:ready'))
  expect(f.request).toHaveBeenCalledWith({ type: 'skill-detail', id: ids[card], revision: details[ids[card]]!.revision })
  const snapshot = f.shell.snapshot, reference = snapshot.occurrences.find((occurrence: any) => occurrence.source === SKILL_REFERENCE_SOURCE)
  expect(decodeSkillReference(reference.ref)).toMatchObject({ id: ids[card], invocationName: details[ids[card]]!.invocationName })
  expect(snapshot.draft).not.toContain('原有需求')
  expect(snapshot.draft).not.toContain('补充说明')
  expect(snapshot.occurrences.find((occurrence: any) => occurrence.occurrenceId === oldFile.occurrenceId)).toMatchObject({ ref: oldFile.ref, source: oldFile.source })
  expect(snapshot.imageIds).toEqual(['image-a'])
  expect(f.textarea.selectionEnd).toBeGreaterThan(f.textarea.selectionStart)
  expect(f.textarea.value.slice(f.textarea.selectionStart, f.textarea.selectionEnd)).toMatch(/^[\u3000]+$/)
  if (card === 'ppt') expect(f.textarea.selectionEnd - f.textarea.selectionStart).toBe(6)
  expect(f.document.activeElement).toBe(f.textarea)
  expect(f.sent).toEqual([])
})

it('replaces old skill tags and edited prompts across PPT→report→PPT and a repeated card without dropping native attachments', async () => {
  const f = fixture({ draft: '旧手写提示词必须清空' })
  const old = details[ids.report]!
  const oldReference = { id: old.id, revision: old.revision, invocationName: old.invocationName, label: old.invocationLabel! }
  f.shell.insertReference({ source: SKILL_REFERENCE_SOURCE, ref: JSON.stringify(oldReference), label: `/${oldReference.label}`, clipboardText: `/${oldReference.label}` }, { start: 0, end: 0, draftRev: f.shell.snapshot.draftRev })
  f.shell.insertFilePaths(['/work/材料一.md', '/work/材料二.md']); f.shell.addImages(['image-a', 'image-b'])
  // Interleave another skill between identical native attachment glyphs. A
  // whole-draft diff must not accidentally keep that skill instead of a file.
  const secondFile = f.shell.snapshot.occurrences.filter((item: any) => item.source !== SKILL_REFERENCE_SOURCE)[1]
  f.shell.insertReference({ source: SKILL_REFERENCE_SOURCE, ref: JSON.stringify({ ...oldReference, id: ids.ppt, invocationName: details[ids.ppt]!.invocationName, label: details[ids.ppt]!.invocationLabel! }), label: '/efund-ppt-maker', clipboardText: '/efund-ppt-maker' }, { start: secondFile.offset, end: secondFile.offset, draftRev: f.shell.snapshot.draftRev })
  const attachments = f.shell.snapshot.occurrences.filter((item: any) => item.source !== SKILL_REFERENCE_SOURCE).map(({ offset: _offset, ...item }: any) => item)
  f.reveal.resolve()
  let initialPpt = ''
  for (const card of ['ppt', 'report', 'ppt', 'ppt'] as const) {
    await f.actions.run(card, f.context)
    const snapshot = f.shell.snapshot, skills = snapshot.occurrences.filter((item: any) => item.source === SKILL_REFERENCE_SOURCE)
    expect(skills).toHaveLength(1)
    expect(decodeSkillReference(skills[0].ref).id).toBe(ids[card])
    expect(snapshot.draft).not.toContain('旧手写提示词必须清空')
    expect(snapshot.draft).not.toContain('上次手动填写的主题')
    expect(snapshot.occurrences.filter((item: any) => item.source !== SKILL_REFERENCE_SOURCE).map(({ offset: _offset, ...item }: any) => item)).toEqual(attachments)
    expect(snapshot.imageIds).toEqual(['image-a', 'image-b'])
    expect(f.textarea.value.slice(f.textarea.selectionStart, f.textarea.selectionEnd)).toBe('\u3000'.repeat(6))
    expect(f.document.activeElement).toBe(f.textarea)
    if (card === 'ppt') {
      if (!initialPpt) initialPpt = snapshot.draft
      else expect(snapshot.draft).toBe(initialPpt)
      expect(snapshot.draft).not.toContain('请围绕研究主题')
    } else expect(snapshot.draft).not.toContain('公司品牌与模板规范')
    f.shell.insertText('上次手动填写的主题', { start: f.textarea.selectionStart, end: f.textarea.selectionEnd, draftRev: snapshot.draftRev })
  }
  expect(f.sent).toEqual([])
})

it('rejects a disabled builtin instead of substituting a similarly named personal skill', async () => {
  const f = fixture({ draft: '原有草稿' })
  f.rows.find(row => row.id === ids.ppt)!.enabled = false
  f.reveal.resolve()
  await expect(f.actions.run('ppt', f.context)).rejects.toThrow()
  expect(f.trace).not.toContain('compose:insert')
  expect(f.shell.snapshot.draft).toBe('原有草稿'); expect(f.sent).toEqual([])
})

it('does not redirect a pending skill action to a newly selected session', async () => {
  const f = fixture({ draft: '原有会话草稿', waitDetail: true })
  f.reveal.resolve()
  const operation = f.actions.run('ppt', f.context), rejected = expect(operation).rejects.toThrow()
  await vi.waitFor(() => expect(f.trace).toContain('ipc:skill-detail'))
  f.list.set({ current: 'other' })
  f.detailResult.resolve(details[ids.ppt]!)
  await rejected
  expect(f.shell.snapshot.draft).toBe('原有会话草稿'); expect(f.other.snapshot.draft).toBe('另一会话草稿')
  expect(f.sent).toEqual([])
})

it.each(['abort', 'reset', 'dispose'] as const)('discards late skill authority after %s without changing a native draft', async reason => {
  const f = fixture({ draft: '取消后仍保留', waitDetail: true })
  f.reveal.resolve()
  const operation = f.actions.run('report', f.context), rejected = expect(operation).rejects.toThrow()
  await vi.waitFor(() => expect(f.trace).toContain('ipc:skill-detail'))
  if (reason === 'abort') f.abort.abort()
  else f.actions[reason]()
  f.detailResult.resolve(details[ids.report]!)
  await rejected
  expect(f.trace).not.toContain('compose:insert')
  expect(f.shell.snapshot.draft).toBe('取消后仍保留'); expect(f.sent).toEqual([])
})


it.each(['snapshot', 'skill-detail'] as const)('rejects a late %s after a real A→B→A session selection without writing or stealing focus', async stage => {
  const f = fixture({ draft: '切换前的原生草稿', waitSnapshot: stage === 'snapshot', waitDetail: stage === 'skill-detail' })
  f.reveal.resolve()
  const before = f.shell.snapshot
  const operation = f.actions.run('ppt', f.context).then(() => ({ ok: true }), error => ({ ok: false, error }))
  await vi.waitFor(() => expect(f.trace).toContain(`ipc:${stage}`))
  const focusTarget = f.document.querySelector<HTMLButtonElement>('[data-conversation-view-id="notes"]')!
  focusTarget.focus()
  // These are real observable session-list transitions. The installed native
  // navigation adapter emits context changes even after composer-ready replied.
  f.list.set({ current: 'other' })
  f.list.set({ current: 'current' })
  if (stage === 'snapshot') f.snapshotResult.resolve({ type: 'snapshot', snapshot: { revision: 12, rows: f.rows } })
  else f.detailResult.resolve(details[ids.ppt]!)
  const outcome = await operation
  expect(f.shell.snapshot.draft, 'returning to the same session must not revive the old action').toBe(before.draft)
  expect(f.shell.snapshot.occurrences).toEqual(before.occurrences)
  expect(f.other.snapshot.draft).toBe('另一会话草稿')
  expect(f.document.activeElement, 'a late skill result must not steal the newly chosen focus').toBe(focusTarget)
  expect(outcome.ok).toBe(false)
  expect(f.trace).not.toContain('compose:insert')
  expect(f.sent).toEqual([])
})

it('continues an owned native session creation and inserts only into its new composer', async () => {
  const f = fixture({ draft: '此前会话草稿' })
  f.list.set({})
  const requests: Array<{ requestId: string; action: string }> = []
  const changes: Array<{ sessionId?: string; ownedRequestId?: string }> = []
  f.window.addEventListener('sherlock:home-action-request', event => { requests.push((event as unknown as CustomEvent).detail) })
  f.window.addEventListener('sherlock:home-action-context-changed', event => { changes.push((event as unknown as CustomEvent).detail) })
  f.sessions.create.mockImplementation(async () => {
    f.shells.set('created', new native.SessionInputShell({ actx: {}, defaultSink: (text: string) => f.sent.push(text) }))
    f.bindings.set('created', { session: store({ removed: false, subagent: null }) })
    const input = f.document.createElement('textarea')
    input.dataset.odysseyFileReferenceSession = 'created'
    f.document.querySelector('main')!.append(input)
    f.document.querySelector<HTMLElement>('[data-srb-session-header]')!.dataset.eworkNotesSession = 'created'
    return 'created'
  })
  f.workspaces.connectWorkspace.mockImplementation(async () => f.sessions.create())
  f.reveal.resolve()
  await f.actions.run('ppt', f.context)
  const request = requests.find(value => value.action === 'composer')!
  expect(changes).toContainEqual(expect.objectContaining({ sessionId: 'created', ownedRequestId: request.requestId }))
  expect(f.workspaces.connectWorkspace).toHaveBeenCalledExactlyOnceWith('workspace-1')
  expect(f.sessions.create).toHaveBeenCalledTimes(1)
  expect(f.sessions.open).toHaveBeenCalledExactlyOnceWith('created')
  expect(f.list.getSnapshot().current).toBe('created')
  const snapshot = (f.shells.get('created') as any).snapshot
  const reference = snapshot.occurrences.find((occurrence: any) => occurrence.source === SKILL_REFERENCE_SOURCE)
  expect(decodeSkillReference(reference.ref)).toMatchObject({ id: ids.ppt })
  const input = f.document.querySelector<HTMLTextAreaElement>('[data-odyssey-file-reference-session="created"]')!
  expect(f.document.activeElement).toBe(input)
  expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe('\u3000'.repeat(6))
  expect(f.shell.snapshot.draft).toBe('此前会话草稿')
  expect(f.other.snapshot.draft).toBe('另一会话草稿')
  expect(f.sent).toEqual([])
})

it.each(['changes', 'changes and returns to the same text'] as const)('rejects a late catalog after the native draft %s without inserting or stealing focus', async change => {
  const initialDraft = '目录请求前的原生草稿'
  const f = fixture({ draft: initialDraft, waitSnapshot: true })
  f.reveal.resolve()
  const operation = f.actions.run('ppt', f.context).then(() => ({ ok: true }), error => ({ ok: false, error }))
  await vi.waitFor(() => expect(f.trace).toContain('ipc:snapshot'))
  const originalRevision = f.shell.snapshot.draftRev
  f.shell.setDraft('目录等待期间用户输入的新需求')
  if (change === 'changes and returns to the same text') f.shell.setDraft(initialDraft)
  f.projectNativeDraft()
  const edited = f.shell.snapshot
  expect(edited.draftRev).toBeGreaterThan(originalRevision)
  const focusTarget = f.document.querySelector<HTMLButtonElement>('[data-conversation-view-id="notes"]')!
  focusTarget.focus()
  f.snapshotResult.resolve({ type: 'snapshot', snapshot: { revision: 12, rows: f.rows } })
  const outcome = await operation
  expect(f.shell.snapshot.draft, 'a delayed catalog must not insert into a draft edited after composer-ready').toBe(edited.draft)
  expect(f.shell.snapshot.draftRev).toBe(edited.draftRev)
  expect(f.shell.snapshot.occurrences).toEqual(edited.occurrences)
  expect(f.document.activeElement, 'the late action must preserve the user’s chosen focus').toBe(focusTarget)
  expect(outcome.ok).toBe(false)
  expect(f.trace).not.toContain('compose:insert')
  expect(f.sent).toEqual([])
})


it('saves the current note before any quick-create navigation and preserves it on save failure', async () => {
  const saved = deferred<void>(), f = fixture({beforeNavigate: () => saved.promise})
  const operation = f.actions.run('note', f.context)
  await Promise.resolve()
  expect(f.trace).not.toContain('home:notes')
  saved.resolve()
  await operation
  expect(f.trace).toContain('home:notes')
  const failed = fixture({beforeNavigate: async () => { throw Error('笔记保存失败') }})
  await expect(failed.actions.run('board', failed.context)).rejects.toThrow('笔记保存失败')
  expect(failed.trace).not.toContain('home:research')
})
it('does not navigate after the user cancels while a note save is pending', async () => {
  const saved = deferred<void>(), f = fixture({beforeNavigate: () => saved.promise})
  const operation = f.actions.run('board', f.context)
  const rejected = expect(operation).rejects.toThrow(/变化/)
  f.abort.abort(); saved.resolve()
  await rejected
  expect(f.trace).not.toContain('home:research')
})
