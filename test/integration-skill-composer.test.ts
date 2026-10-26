import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it,vi } from 'vitest'
import {SKILL_REFERENCE_SOURCE,decodeSkillReference} from '../src/shared/skill-reference'
import { installSkillComposer,serializeSharedSkillDraft } from '../src/preload/integrations/skill-composer'
import { createSkillUseBridge } from '../src/preload/integrations/skill-use'
import { installSkillCommand } from '../src/preload/integrations/skill-command'
import { installSkillCommandBridge } from '../src/preload/integrations/skill-command-bridge'
import type { IntegrationBridge } from '../src/shared/integration-ui'
// @ts-expect-error The build patch is an untyped Node module.
import { patchIntegrationSkillComposer } from '../scripts/lib/patch-integration-skill-composer.mjs'

const require = createRequire(import.meta.url)
const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
let descriptor: any
runInNewContext(source.slice(0, source.indexOf('\n//# sourceMappingURL=client.js.map')), { window: { __ModuleLoader__: { load: (value: any) => { descriptor = value } } }, navigator: { platform: 'MacIntel' }, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
function fakeModule(): any { let fake: any; fake = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) }); return fake }
function store(initial: any) { let value = initial; return { getSnapshot: () => value, set: (next: any) => { value = next }, subscribe: () => () => {} } }
const client = descriptor.factory((id: string) => id.startsWith('react') ? require(id) : id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : fakeModule())
let commandDescriptor: any
runInNewContext(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js', 'utf8'), { window: { __ModuleLoader__: { load: (value: any) => { commandDescriptor = value } } }, AbortController, console, setTimeout, clearTimeout })
const commandClient = commandDescriptor.factory((id: string) => id.startsWith('react') ? require(id) : id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore: store } : fakeModule())
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

const prefillReference = { id: 'builtin:efund-ppt-maker', revision: 3, invocationName: alias, label: 'efund-ppt-maker' }
const prefillText = '请按公司风格制作PPT。\n主题：'
const blankTopic = { text: prefillText, selectionStart: prefillText.length, selectionEnd: prefillText.length }

it('replaces prompt text and old skills through native edits while retaining attachment identities and undo', async () => {
    const f = fixture(); f.shell.insertFilePaths(['/work/保留一.md', '/work/保留二.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: { ...blankTopic, mode: 'replace' } })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefillText}\n\n\uFFFC \uFFFC `)
    expect(f.shell.snapshot.occurrences.slice(1).map(({ offset: _offset, ...item }: any) => item)).toEqual(before.occurrences.map(({ offset: _offset, ...item }: any) => item))
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']); expect(f.sent).toEqual([])
    for (let step = 0; step < 8 && f.shell.snapshot.draft !== before.draft; step++) f.shell.undo()
    expect(f.shell.snapshot.draft).toBe(before.draft)
    expect(f.shell.snapshot.occurrences).toEqual(before.occurrences)
    expect(f.shell.snapshot.imageIds).toEqual(before.imageIds)
})

function nativeSkillMenuFixture() {
    const f = fixture()
    const skills = [
        { ...prefillReference, name: 'PPT制作助手' },
        { id: 'builtin:ework-equity-research', revision: 5, invocationName: 'ework-skill-fedcba9876543210', label: 'ework-equity-research', name: '研报写作' },
    ]
    const request: IntegrationBridge['request'] = async command => {
        if (command.type === 'snapshot') return { type: 'snapshot', snapshot: { revision: 1, rows: skills.map(skill => ({ ...skill, invocationLabel: skill.label, kind: 'skill', tab: 'skills', description: '内置技能', source: 'EWork 内置', enabled: true, status: '已启用' })) } }
        if (command.type === 'skill-detail') {
            const skill = skills.find(skill => skill.id === command.id)!
            return { type: 'skill-detail', ...skill, invocationLabel: skill.label, enabled: true, content: '# Actual native skill' }
        }
        throw Error('Unexpected integration command')
    }
    const project = () => {
        f.textarea.value = f.shell.snapshot.draft.replaceAll('\uFFFC', '\uE000')
        f.document.querySelector('main')!.removeAttribute('inert')
    }
    const adapter = createSkillUseBridge(f.document, { request }, project)
    const bridge = installSkillCommandBridge(f.document, { request, useSkill: adapter.useSkill })
    let contribution: any
    const unregister = installSkillCommand({ document: f.document, command: { register: value => { contribution = value; return () => {} } }, sessions: { subagentAddress: () => undefined } })
    const popup = new commandClient.PopupSelectController({ consume: (segment: any) => f.shell.consumeToken(segment.via === 'menu' ? { kind: 'span', span: segment.span } : { kind: 'bare-token', token: segment.token }), focusComposer: () => { project(); f.textarea.focus() } })
    const segments: Array<{ start: number; end: number; draftRev: number }> = []
    const open = async (start: number, end = start) => {
        const span = { start, end, draftRev: f.shell.snapshot.draftRev }
        segments.push(span)
        commandClient.CommandUiRuntime.prototype.openPopup.call({ scopeFor: () => ({}), popupFor: () => popup }, 'skills', contribution.ui, { sessionId: 'current' }, { via: 'menu', span })
        await vi.waitFor(() => expect(popup.state.getSnapshot().status).toBe('ready'))
    }
    const select = async (id: string) => {
        const index = popup.state.getSnapshot().options.findIndex((option: any) => option.id === id)
        expect(index).toBeGreaterThanOrEqual(0)
        await popup.select(index)
    }
    const close = cleanup.pop()!
    cleanup.push(async () => { popup.dismiss(); unregister(); bridge.dispose(); adapter.dispose(); await close() })
    return { ...f, skills, popup, segments, open, select, useSkill: adapter.useSkill }
}

it('adds second and third native skills after replacement prefill leaves its fullwidth topic selected, then remains editable after clearing', async () => {
    const f = nativeSkillMenuFixture(), topic = '\u3000'.repeat(6)
    f.skills.push({ id: 'builtin:ework-free-data-sources', revision: 4, invocationName: 'ework-skill-1111111111111111', label: 'ework-free-data-sources', name: '基础数据源' })
    f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const file = f.shell.snapshot.occurrences[0]
    for (const [index, text] of [`PPT主题「${topic}」\n制作演示文稿。`, `研究主题「${topic}」\n撰写研究报告。`].entries()) {
        const skill = f.skills[index]!, selectionStart = text.indexOf(topic)
        await f.useSkill({ id: skill.id, revision: skill.revision, invocationName: skill.invocationName, name: skill.name, sessionId: 'current', prefill: { mode: 'replace', text, selectionStart, selectionEnd: selectionStart + topic.length } })
    }
    expect(f.shell.snapshot.draft).not.toContain('PPT主题')
    expect(f.textarea.value.slice(f.textarea.selectionStart, f.textarea.selectionEnd)).toBe(topic)
    await f.open(f.textarea.selectionStart, f.textarea.selectionEnd); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    await f.open(f.textarea.selectionStart, f.textarea.selectionEnd); await f.select(f.skills[2]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    expect(f.shell.snapshot.occurrences.filter((item: any) => item.source === SKILL_REFERENCE_SOURCE).map((item: any) => decodeSkillReference(item.ref).id)).toEqual([f.skills[1]!.id, f.skills[0]!.id, f.skills[2]!.id])
    expect(f.shell.snapshot.occurrences.find((item: any) => item.occurrenceId === file.occurrenceId)).toMatchObject({ ref: file.ref, source: file.source })
    expect(f.shell.snapshot.draft).toContain('撰写研究报告。')
    expect(f.shell.snapshot.imageIds).toEqual(['image-a'])
    expect(f.document.activeElement).toBe(f.textarea)
    f.shell.setDraft('')
    await f.open(0); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    const caret = f.textarea.selectionStart
    expect(f.shell.insertText('清空后仍可编辑', { start: caret, end: caret, draftRev: f.shell.snapshot.draftRev })).toBe(true)
    expect(f.shell.snapshot.draft).toBe('\uFFFC 清空后仍可编辑')
    expect(f.sent).toEqual([])
})

it.each([' ', '\u3000'.repeat(6), '\n\t\r\n \u3000'])('accepts only a fresh all-whitespace native menu selection (%j)', async whitespace => {
    const f = fixture(); f.shell.setDraft(`正文${whitespace}尾文`)
    const span = { start: 2, end: 2 + whitespace.length, draftRev: f.shell.snapshot.draftRev }
    const prepared = await f.request('prepare', { commandSegment: { via: 'menu', span } })
    expect(prepared).toMatchObject({ ok: true })
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe('正文\uFFFC 尾文')
    expect(f.sent).toEqual([])
})

it.each(['普通正文', ' \u3000正文 ', '/other', '/skills changed'])('rejects a native menu selection containing non-command text (%j)', async text => {
    const f = fixture(); f.shell.setDraft(`前${text}后`)
    const before = f.shell.snapshot
    expect(await f.request('prepare', { commandSegment: { via: 'menu', span: { start: 1, end: 1 + text.length, draftRev: before.draftRev } } })).toMatchObject({ ok: false, message: expect.stringContaining('技能命令已变化') })
    expect(f.shell.snapshot).toBe(before); expect(f.sent).toEqual([])
})

it.each([false, true])('rejects stale whitespace menu selections even when the draft text returns (ABA=%s)', async aba => {
    const f = fixture(), text = `主题「${'\u3000'.repeat(6)}」`
    f.shell.setDraft(text)
    const span = { start: 3, end: 9, draftRev: f.shell.snapshot.draftRev }
    f.shell.setDraft(text + '后来输入')
    if (aba) f.shell.setDraft(text)
    const before = f.shell.snapshot
    expect(await f.request('prepare', { commandSegment: { via: 'menu', span } })).toMatchObject({ ok: false, message: expect.stringContaining('草稿') })
    expect(f.shell.snapshot).toBe(before); expect(f.sent).toEqual([])
})

it('uses a fresh native menu span to add multiple distinct skill chips and retain body, attachments and focus', async () => {
    const f = nativeSkillMenuFixture()
    f.shell.insertFilePaths(['/work/材料.md']); f.shell.addImages(['image-a'])
    const original = f.shell.snapshot, file = original.occurrences[0]
    await f.open(0); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot().open).toBe(false)
    expect(f.textarea.selectionStart).toBe(2)
    await f.open(2); await f.select(f.skills[1]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC \uFFFC ${original.draft}`)
    expect(f.shell.snapshot.occurrences.filter((item: any) => item.source === SKILL_REFERENCE_SOURCE).map((item: any) => decodeSkillReference(item.ref).id)).toEqual(f.skills.map(skill => skill.id))
    expect(f.shell.snapshot.occurrences[2]).toMatchObject({ occurrenceId: file.occurrenceId, offset: file.offset + 4 })
    expect(f.shell.snapshot.imageIds).toEqual(['image-a'])
    expect(f.document.activeElement).toBe(f.textarea)
    expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([4, 4])
    expect(f.segments[1]!.draftRev).toBeGreaterThan(f.segments[0]!.draftRev)
    expect(f.sent).toEqual([])
})

it('does not duplicate an existing native skill when selected again at a different menu caret', async () => {
    const f = nativeSkillMenuFixture()
    await f.open(0); await f.select(f.skills[0]!.id)
    const before = f.shell.snapshot
    await f.open(0); await f.select(f.skills[1]!.id)
    const both = f.shell.snapshot
    // A leading empty launcher span is already valid; duplicate detection must
    // look past the different first chip instead of minting the same label again.
    await f.open(0); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot().open).toBe(false)
    expect(f.shell.snapshot.draft).toBe(both.draft)
    expect(f.shell.snapshot.draftRev).toBe(both.draftRev)
    expect(f.shell.snapshot.occurrences).toEqual(both.occurrences)
    expect(f.shell.snapshot.occurrences).toHaveLength(before.occurrences.length + 1)
    expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([4, 4])
    expect(f.sent).toEqual([])
})

it.each([false, true])('refreshes an existing skill reference in place after catalog updates while preserving its original gap=%s', async keepGap => {
    const f = nativeSkillMenuFixture()
    await f.open(0); await f.select(f.skills[0]!.id)
    if (!keepGap) f.shell.insertText('', { start: 1, end: 2, draftRev: f.shell.snapshot.draftRev })
    f.shell.insertFilePaths(['/work/保留材料.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot
    f.skills[0]!.revision++
    f.skills[0]!.invocationName = 'ework-skill-1111111111111111'
    f.skills[0]!.label = 'updated-ppt-maker'
    await f.open(before.draft.length); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    const refs = f.shell.snapshot.occurrences.filter((item: any) => item.source === SKILL_REFERENCE_SOURCE)
    expect(refs).toHaveLength(1)
    expect(decodeSkillReference(refs[0].ref)).toMatchObject({ id: f.skills[0]!.id, revision: f.skills[0]!.revision, invocationName: f.skills[0]!.invocationName, label: f.skills[0]!.label })
    expect(f.shell.snapshot.draft).toBe(before.draft)
    expect(f.shell.snapshot.occurrences.filter((item: any) => item.source !== SKILL_REFERENCE_SOURCE)).toEqual(before.occurrences.filter((item: any) => item.source !== SKILL_REFERENCE_SOURCE))
    expect(f.shell.snapshot.imageIds).toEqual(['image-a'])
    expect(f.sent).toEqual([])
})

it('consumes only a newly typed slash token when an existing skill is selected after the body', async () => {
    const f = nativeSkillMenuFixture()
    await f.open(0); await f.select(f.skills[0]!.id)
    f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, start = before.draft.length
    f.shell.insertText('/skills', { start, end: start, draftRev: before.draftRev })
    await f.open(start, start + 7); await f.select(f.skills[0]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: false, error: null })
    expect(f.shell.snapshot.draft).toBe(before.draft)
    expect(f.shell.snapshot.occurrences).toEqual(before.occurrences)
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']); expect(f.sent).toEqual([])
})

it.each([false, true])('keeps the strict native menu revision guard after additional skills even for ABA=%s', async aba => {
    const f = nativeSkillMenuFixture()
    await f.open(0); await f.select(f.skills[0]!.id)
    await f.open(2)
    const original = f.shell.snapshot.draft
    f.shell.setDraft(original + '后来输入')
    if (aba) f.shell.setDraft(original)
    const before = f.shell.snapshot
    await f.select(f.skills[1]!.id)
    expect(f.popup.state.getSnapshot()).toMatchObject({ open: true, error: expect.stringContaining('草稿') })
    expect(f.shell.snapshot).toBe(before); expect(f.sent).toEqual([])
})

it('rejects prepare expectedDraftRev after the same native session draft changes during snapshot lookup', async () => {
    const f = fixture(), expectedDraftRev = f.shell.snapshot.draftRev
    f.shell.setDraft('等待技能列表时新输入的正文')
    f.shell.insertFilePaths(['/work/新材料.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot
    expect(await f.request('prepare', { sessionId: 'current', expectedDraftRev })).toMatchObject({ ok: false, message: expect.stringContaining('草稿') })
    expect(f.shell.snapshot).toBe(before)
    expect(f.sent).toEqual([])
})

it.each([null, NaN, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])('rejects invalid prepare expectedDraftRev without changing the native draft (%j)', async expectedDraftRev => {
    const f = fixture(), before = f.shell.snapshot
    expect(await f.request('prepare', { expectedDraftRev })).toMatchObject({ ok: false })
    expect(f.shell.snapshot).toBe(before); expect(f.sent).toEqual([])
})

it('accepts matching prepare expectedDraftRev and retains the optional legacy prepare path', async () => {
    const f = fixture(), before = f.shell.snapshot
    expect(await f.request('prepare', { expectedDraftRev: before.draftRev })).toMatchObject({ ok: true, token: expect.any(String) })
    expect(await f.request('prepare')).toMatchObject({ ok: true, token: expect.any(String) })
    expect(f.shell.snapshot).toBe(before)
})

it('cancels a pending native focus frame when the skill-use signal aborts before its first RAF', async () => {
    const f = fixture(), controller = new AbortController()
    f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot
    const frames = vi.spyOn(f.window, 'requestAnimationFrame'), cancelled = vi.spyOn(f.window, 'cancelAnimationFrame')
    const phases: string[] = []
    const adapter = createSkillUseBridge(f.document, { request: async () => ({ type: 'skill-detail', ...prefillReference, invocationLabel: prefillReference.label, enabled: true, content: '# Actual skill' }) }, () => {
        f.textarea.value = f.shell.snapshot.draft.replaceAll('\uFFFC', '\uE000')
        f.document.querySelector('main')!.removeAttribute('inert')
    })
    f.document.querySelector('button')!.focus()
    f.window.addEventListener('sherlock:skill-compose-request', (event: any) => {
        phases.push(event.detail.phase)
        // installSkillComposer has already scheduled the native focus frame.
        if (event.detail.phase === 'focus') controller.abort()
    })
    try {
        await expect(adapter.useSkill({ id: prefillReference.id, revision: prefillReference.revision, invocationName: alias, name: 'PPT制作助手', prefill: blankTopic, signal: controller.signal })).rejects.toThrow('变化')
        expect(phases).toEqual(['prepare', 'insert', 'focus', 'cancel'])
        expect(cancelled).toHaveBeenCalledWith(frames.mock.results[0]?.value)
        await new Promise(resolve => f.window.requestAnimationFrame(resolve))
        expect(f.document.activeElement).toBe(f.document.querySelector('button'))
        expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefillText}\n\n${before.draft}`)
        expect(f.shell.snapshot.occurrences[1].occurrenceId).toBe(before.occurrences[0].occurrenceId)
        expect(f.shell.snapshot.imageIds).toEqual(['image-a']); expect(f.sent).toEqual([])
    } finally { adapter.dispose() }
})

it.each([
    blankTopic,
    { text: '主题：待填写\n请先整理结构。', selectionStart: 3, selectionEnd: 6 },
])('inserts prefill with a real native chip and focuses its relative topic range (%j)', async prefill => {
    const f = fixture(); f.shell.setDraft('')
    const prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefill.text}`)
    expect(f.shell.snapshot.occurrences).toHaveLength(1)
    expect(decodeSkillReference(f.shell.snapshot.occurrences[0].ref)).toEqual(prefillReference)
    expect(f.sent).toEqual([])
    f.textarea.value = f.shell.snapshot.draft.replaceAll('\uFFFC', '\uE000')
    f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect(f.document.activeElement).toBe(f.textarea)
    expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([2 + prefill.selectionStart, 2 + prefill.selectionEnd])
})

it.each(['原有正文', '  原有正文'])('inserts prefill above the verbatim old tail and preserves native attachments (%j)', async original => {
    const f = fixture(); f.shell.setDraft(original); f.shell.insertFilePaths(['/work/材料.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, old = before.occurrences[0]
    const prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefillText}\n\n${before.draft}`)
    expect(f.shell.snapshot.occurrences).toHaveLength(2)
    expect(f.shell.snapshot.occurrences[1]).toMatchObject({ occurrenceId: old.occurrenceId, ref: old.ref, offset: old.offset + prefillText.length + 4 })
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']); expect(f.sent).toEqual([])
    f.shell.undo(); f.shell.undo()
    expect(f.shell.snapshot.draft).toBe(before.draft)
    expect(f.shell.snapshot.occurrences).toEqual(before.occurrences)
    expect(f.shell.snapshot.imageIds).toEqual(before.imageIds)
})

it('does not repeat prefill or change a native chip with existing body text', async () => {
    const f = fixture(); f.shell.setDraft('用户已有需求')
    f.shell.insertReference({ source: SKILL_REFERENCE_SOURCE, ref: JSON.stringify(prefillReference), label: '/efund-ppt-maker', clipboardText: '/efund-ppt-maker' }, { start: 0, end: 0, draftRev: f.shell.snapshot.draftRev })
    f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: true })
    expect(f.shell.snapshot).toBe(before)
    expect(f.sent).toEqual([])
})

it('fills prefill behind an existing empty native skill chip without duplicating it', async () => {
    const f = fixture(); f.shell.setDraft('')
    f.shell.insertReference({ source: SKILL_REFERENCE_SOURCE, ref: JSON.stringify(prefillReference), label: '/efund-ppt-maker', clipboardText: '/efund-ppt-maker' }, { start: 0, end: 0, draftRev: f.shell.snapshot.draftRev })
    const occurrence = f.shell.snapshot.occurrences[0], prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefillText}`)
    expect(f.shell.snapshot.occurrences).toEqual([occurrence])
    expect(f.sent).toEqual([])
})

it('fills prefill behind a native skill chip with only attachments and preserves their identities', async () => {
    const f = fixture(); f.shell.setDraft('')
    f.shell.insertReference({ source: SKILL_REFERENCE_SOURCE, ref: JSON.stringify(prefillReference), label: '/efund-ppt-maker', clipboardText: '/efund-ppt-maker' }, { start: 0, end: 0, draftRev: f.shell.snapshot.draftRev })
    f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${prefillText}\n\n${before.draft.slice(2)}`)
    expect(f.shell.snapshot.occurrences[0]).toEqual(before.occurrences[0])
    expect(f.shell.snapshot.occurrences[1]).toMatchObject({ occurrenceId: before.occurrences[1].occurrenceId, offset: before.occurrences[1].offset + prefillText.length + 2 })
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']); expect(f.sent).toEqual([])
})

it('replaces a captured slash token with a chip and prefill without changing the following tail', async () => {
    const f = fixture(); f.shell.setDraft('  /ski 原有正文')
    const before = f.shell.snapshot, prepared = await f.request('prepare', { commandSegment: { via: 'menu', span: { start: 2, end: 6, draftRev: before.draftRev } } })
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`  \uFFFC ${prefillText}\n\n 原有正文`)
    expect(f.shell.snapshot.occurrences[0]).toMatchObject({ source: SKILL_REFERENCE_SOURCE, offset: 2 })
    f.textarea.value = f.shell.snapshot.draft
    f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([4 + prefillText.length, 4 + prefillText.length])
    expect(f.sent).toEqual([])
})

it.each([
    null, {}, { ...blankTopic, mode: 'delete' }, { text: 12, selectionStart: 0, selectionEnd: 0 },
    { text: 'a'.repeat(16001), selectionStart: 0, selectionEnd: 0 },
    { text: '主题：', selectionStart: -1, selectionEnd: 0 },
    { text: '主题：', selectionStart: 2, selectionEnd: 1 },
    { text: '主题：', selectionStart: 0, selectionEnd: 4 },
    { text: '主题：', selectionStart: 0.5, selectionEnd: 1 },
    { text: '主题：', selectionStart: 0, selectionEnd: NaN },
])('rejects invalid prefill before any native draft mutation (%#)', async prefill => {
    const f = fixture(); f.shell.insertFilePaths(['/work/保留.md']); f.shell.addImages(['image-a'])
    const before = f.shell.snapshot, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill })).toMatchObject({ ok: false })
    expect(f.shell.snapshot).toBe(before)
    expect(f.sent).toEqual([])
})

it('rejects prefill without a real reference before plain alias fallback can mutate the draft', async () => {
    const f = fixture(), before = f.shell.snapshot, prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, prefill: blankTopic })).toMatchObject({ ok: false })
    expect(f.shell.snapshot).toBe(before)
    expect(f.sent).toEqual([])
})

it('accepts the 16000-character prefill limit and never submits it', async () => {
    const f = fixture(); f.shell.setDraft('')
    const text = 'a'.repeat(16000), prepared = await f.request('prepare')
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: { text, selectionStart: 16000, selectionEnd: 16000 } })).toMatchObject({ ok: true })
    expect(f.shell.snapshot.draft).toBe(`\uFFFC ${text}`)
    expect(f.sent).toEqual([])
})

it.each(['draft', 'session'])('keeps prefill out of a changed prepared session (%s)', async reason => {
    const f = fixture(), prepared = await f.request('prepare')
    if (reason === 'draft') f.shell.setDraft('后来输入')
    else f.list.set({ current: 'another' })
    const before = f.shell.snapshot
    expect(await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: blankTopic })).toMatchObject({ ok: false })
    expect(f.shell.snapshot).toBe(before); expect(f.sent).toEqual([])
})

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

it('replaces the captured slash-menu token atomically and retains the original draft and attachments',async()=>{
    const f=fixture();f.shell.setDraft('/ski 原有需求');f.shell.insertFilePaths(['/work/材料.md']);f.shell.addImages(['image-a'])
    const before=f.shell.snapshot,ref=before.occurrences[0]
    const prepared=await f.request('prepare',{sessionId:'current',commandSegment:{via:'menu',span:{start:0,end:4,draftRev:before.draftRev}}})
    expect(prepared.ok).toBe(true)
    expect(await f.request('insert',{token:prepared.token,invocationName:alias})).toMatchObject({ok:true})
    expect(f.shell.snapshot.draft).toBe('/ework-skill-0123456789abcdef 原有需求 \uFFFC ')
    expect(f.shell.snapshot.occurrences[0].occurrenceId).toBe(ref.occurrenceId)
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']);expect(f.sent).toEqual([])
    f.shell.undo();expect(f.shell.snapshot.draft).toBe(before.draft)
})

it('inserts a readable English native reference and retains the stable skill ID, attachments and undo',async()=>{
    const f=fixture();f.shell.setDraft('/skills 原有需求');f.shell.insertFilePaths(['/work/材料.md']);f.shell.addImages(['image-a'])
    const before=f.shell.snapshot,old=before.occurrences[0],reference={id:'builtin:efund-ppt-maker',revision:3,invocationName:alias,label:'efund-ppt-maker'}
    const prepared=await f.request('prepare',{sessionId:'current',commandSegment:{via:'menu',span:{start:0,end:7,draftRev:before.draftRev}}})
    expect(await f.request('insert',{token:prepared.token,invocationName:alias,reference})).toMatchObject({ok:true})
    expect(f.shell.snapshot.draft).toBe('\uFFFC 原有需求 \uFFFC ')
    expect(f.shell.snapshot.occurrences[0]).toMatchObject({source:SKILL_REFERENCE_SOURCE,label:'/efund-ppt-maker',clipboardText:'/efund-ppt-maker',offset:0})
    expect(decodeSkillReference(f.shell.snapshot.occurrences[0].ref)).toEqual(reference)
    expect(f.shell.snapshot.occurrences[1].occurrenceId).toBe(old.occurrenceId)
    expect(f.shell.snapshot.imageIds).toEqual(['image-a']);expect(f.sent).toEqual([])
    f.textarea.value=f.shell.snapshot.draft.replaceAll('\uFFFC','\uE000');f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus',{token:prepared.token})).toMatchObject({ok:true});expect(f.textarea.selectionStart).toBe(2)
    f.shell.undo();expect(f.shell.snapshot.draft).toBe(before.draft);expect(f.shell.snapshot.occurrences).toEqual(before.occurrences)
})

it('serializes a displayed English reference through its codec before the native send sink',async()=>{
    const sent:string[]=[],reference={id:'builtin:efund-ppt-maker',revision:3,invocationName:alias,label:'efund-ppt-maker'}
    const codec={serializeReference:async(source:string,ref:string)=>{expect(source).toBe(SKILL_REFERENCE_SOURCE);expect(decodeSkillReference(ref)).toEqual(reference);return `/${alias}`},adjudicate:async()=>undefined}
    const shell=new client.SessionInputShell({actx:{},inputTriggers:()=>codec,defaultSink:(text:string)=>sent.push(text)})
    shell.setDraft('制作演示文稿');shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref:JSON.stringify(reference),label:'/efund-ppt-maker',clipboardText:'/efund-ppt-maker'},{start:0,end:0,draftRev:shell.snapshot.draftRev})
    shell.submit();await vi.waitFor(()=>expect(sent).toEqual([`/${alias} 制作演示文稿`]))
})

it('retains shared board reference identities and offsets when expanding English skill chips',async()=>{
 const original={draft:'\uFFFC 需求 \uFFFC',occurrences:[{source:SKILL_REFERENCE_SOURCE,ref:'skill',offset:0},{source:'research-artifact',ref:'board-component',offset:5}]}
 const next=await serializeSharedSkillDraft(original,async()=>'/ework-skill-0123456789abcdef')
 expect(next.draft).toBe('/ework-skill-0123456789abcdef 需求 \uFFFC')
 expect(next.occurrences).toEqual([{source:'research-artifact',ref:'board-component',offset:next.draft.lastIndexOf('\uFFFC')}])
 expect(original.occurrences).toHaveLength(2)
})

it('does not redirect a skill menu selection to a newly selected session or overwrite a changed slash span',async()=>{
    const f=fixture();f.shell.setDraft('/skills');const before=f.shell.snapshot
    expect(await f.request('prepare',{sessionId:'previous'})).toMatchObject({ok:false})
    expect(await f.request('prepare',{sessionId:'current',commandSegment:{via:'menu',span:{start:0,end:7,draftRev:before.draftRev-1}}})).toMatchObject({ok:false})
    expect(f.shell.snapshot.draft).toBe('/skills')
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

it.each(['\uE001', '\uF8FF'])('focuses an individually measured skill marker %s while preserving literal private-use text', async marker => {
    const f = fixture()
    f.shell.setDraft('保留正文')
    const prepared = await f.request('prepare')
    const text = '\uE321 主题：　'
    const result = await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: { text, selectionStart: text.length - 1, selectionEnd: text.length } })
    expect(result).toMatchObject({ ok: true })
    f.textarea.value = f.shell.snapshot.draft.replaceAll('\uFFFC', marker)
    f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: true })
    expect(f.textarea.value.slice(f.textarea.selectionStart, f.textarea.selectionEnd)).toBe('　')
    expect(f.shell.snapshot.draft).toContain('\uE321')
    expect(f.sent).toEqual([])
})

it('does not treat literal private-use draft characters as interchangeable reference markers', async () => {
    const f = fixture(), prepared = await f.request('prepare')
    const text = '\uE321 主题：　'
    await f.request('insert', { token: prepared.token, invocationName: alias, reference: prefillReference, prefill: { text, selectionStart: text.length - 1, selectionEnd: text.length } })
    const before = f.shell.snapshot
    f.textarea.value = before.draft.replaceAll('\uFFFC', '\uE002').replace('\uE321', '\uE322')
    f.document.querySelector('main')!.removeAttribute('inert')
    expect(await f.request('focus', { token: prepared.token })).toMatchObject({ ok: false })
    expect(f.shell.snapshot).toBe(before)
    expect(f.sent).toEqual([])
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
    const ctx = { inject:()=>{}, effect: (fn: () => (() => void)) => effects.push(fn()) }
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

it('strictly upgrades the known composer effect and resolves the Notes owner only for the active Notes surface', () => {
    const anchor = 'const composerBlocks = new ComposerBlockRegistry();'
    const current = patchIntegrationSkillComposer(anchor)
    const installed = /\/\* sherlock:integration-skill-composer:v2 \*\/[\s\S]*?"Sherlock integration skill composer"\);/.exec(current)![0]
    const legacy = `/* sherlock:integration-skill-composer:v1 */
      ctx.effect(() => {
        if (window.top !== window) return;
        return sherlockBoardsPage.installSkillComposer({sessions,inputHub,composerBlocks,researchSidebar});
      }, "Sherlock integration skill composer");`
    expect(patchIntegrationSkillComposer(current.replace(installed, legacy))).toBe(current)
    expect(patchIntegrationSkillComposer(current)).toBe(current)
    for (const bad of [current.replace('activeInput:', 'wrongInput:'), current.replace('v2 */', 'v99 */'), current+'\n'+installed, current.replace(installed, legacy.replace('sessions,inputHub', 'sessions,wrongHub'))])
        expect(() => patchIntegrationSkillComposer(bad)).toThrow(/drifted|duplicate|unknown/)
    const ordinary = {}, notes = {}, document = {body:{dataset:{workspaceSurface:'notes'}}}, win:any={};win.top=win
    let options:any
    runInNewContext(current, {ComposerBlockRegistry:class{},ctx:{inject:()=>{},effect:(fn:()=>unknown)=>fn()},document,window:win,sessions:{},inputHub:{},researchSidebar:{},eworkActiveInput:(id:string,shell:unknown)=>{expect(id).toBe('owner');expect(shell).toBe(ordinary);return notes},sherlockBoardsPage:{installSkillComposer:(deps:unknown)=>{options=deps;return()=>{}}}})
    expect(options.activeInput('owner',ordinary)).toBe(notes)
    for (const mode of ['', 'integrations', 'research']) {document.body.dataset.workspaceSurface=mode;expect(options.activeInput('owner',ordinary)).toBe(ordinary)}
})
