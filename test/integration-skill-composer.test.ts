import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it,vi } from 'vitest'
import {SKILL_REFERENCE_SOURCE,decodeSkillReference} from '../src/shared/skill-reference'
import { installSkillComposer,serializeSharedSkillDraft } from '../src/preload/integrations/skill-composer'
import { createSkillUseBridge } from '../src/preload/integrations/skill-use'
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

const prefillReference = { id: 'builtin:efund-ppt-maker', revision: 3, invocationName: alias, label: 'efund-ppt-maker' }
const prefillText = '请按公司风格制作PPT。\n主题：'
const blankTopic = { text: prefillText, selectionStart: prefillText.length, selectionEnd: prefillText.length }

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
    null, {}, { text: 12, selectionStart: 0, selectionEnd: 0 },
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
