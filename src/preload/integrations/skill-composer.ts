import {SKILL_REFERENCE_SOURCE,encodeSkillReference,decodeSkillReference} from '../../shared/skill-reference'
import type { SkillComposerPrefill } from '../../shared/integration-ui'
type InputSnapshot = { draft: string; draftRev: number; phase: string; researchContextPreparing?: boolean; occurrences?:Array<{source:string;ref:string;offset:number}> }
type InputShell = {
    disposed?: boolean
    readonly snapshot: InputSnapshot
    setDraft?(text: string, editRange: { start: number; end: number; insertedLength: number }): void
    insertText(text: string, span: { start: number; end: number; draftRev: number }): boolean
    insertReference(reference:{source:string;ref:string;label:string;clipboardText:string},span:{start:number;end:number;draftRev:number}):boolean
}
type SessionScope = { sessionId: string }
type Dependencies = {
    document?: Document
    sessions: {
        list: { getSnapshot(): { current?: string } }
        binding(id: string): { session: { getSnapshot(): { removed?: boolean; subagent?: unknown } } } | undefined
        subagentAddress(id: string): unknown
    }
    inputHub: { shell(id: string): InputShell }
    activeInput?(id: string, ordinary: InputShell): InputShell
    composerBlocks: { storeFor(id: string): { getSnapshot(): unknown } }
    researchSidebar: {
        stores: Map<string, { getSnapshot(): { binding?: { active: boolean } | null } }>
        service: {
            activateTab(id: string, scope: SessionScope): void
            setPanelState(patch: { open: boolean }, scope: SessionScope): void
        } | null
    }
}
type Ticket = { sessionId: string; shell: InputShell; surface: 'conversation' | 'notes'; revision: number; expires: number; inserted: boolean; caret: number; selectionEnd: number; span: {start:number;end:number} }
const REQUEST = 'sherlock:skill-compose-request'
const REPLY = 'sherlock:skill-compose-reply'

// The inline-reference renderer gives measured chips one UTF-16 placeholder.
// Only canonical reference positions may differ; literal PUA draft text stays exact.
function matchesProjectedPrefix(value: string, prefix: string): boolean {
    if (value.length < prefix.length) return false
    for (let index = 0; index < prefix.length; index++) {
        if (value[index] === prefix[index]) continue
        const code = value.charCodeAt(index)
        if (prefix[index] !== '\uFFFC' || code < 0xE000 || code > 0xF8FF) return false
    }
    return true
}

function decodePrefill(value: unknown): SkillComposerPrefill | undefined {
    if (value === undefined) return undefined
    const prefill = value as SkillComposerPrefill | null
    if (!prefill || typeof prefill !== 'object' || Array.isArray(prefill) || typeof prefill.text !== 'string' || prefill.text.length > 16_000 || (prefill.mode !== undefined && prefill.mode !== 'replace') ||
        !Number.isSafeInteger(prefill.selectionStart) || !Number.isSafeInteger(prefill.selectionEnd) ||
        prefill.selectionStart < 0 || prefill.selectionEnd < prefill.selectionStart || prefill.selectionEnd > prefill.text.length)
        throw Error('预填内容或选择范围无效，原草稿已保留。')
    return { text: prefill.text, selectionStart: prefill.selectionStart, selectionEnd: prefill.selectionEnd, ...(prefill.mode ? { mode: prefill.mode } : {}) }
}

/** Expand method references while leaving shared file/artifact picks for the board adapter. */
export async function serializeSharedSkillDraft<T extends {draft:string;occurrences:readonly {source:string;ref:string;offset:number}[]}>(snapshot:T,serialize:(source:string,ref:string)=>Promise<string>):Promise<T> {
    const parts=await Promise.all(snapshot.occurrences.filter(o=>o.source===SKILL_REFERENCE_SOURCE).map(async o=>({offset:o.offset,text:await serialize(o.source,o.ref)})))
    parts.sort((a,b)=>a.offset-b.offset)
    let draft='',cursor=0
    for(const part of parts){draft+=snapshot.draft.slice(cursor,part.offset)+part.text;cursor=part.offset+1}
    draft+=snapshot.draft.slice(cursor)
    return {...snapshot,draft,occurrences:snapshot.occurrences.filter(o=>o.source!==SKILL_REFERENCE_SOURCE).map(o=>({...o,offset:o.offset+parts.filter(p=>p.offset<o.offset).reduce((n,p)=>n+p.text.length-1,0)}))}
}

/** Lives beside the native input hub; no prompt, submit, command or DOM draft writes. */
export function installSkillComposer(deps: Dependencies): () => void {
    const document = deps.document ?? globalThis.document
    const window = document.defaultView
    if (!window) return () => {}
    const tickets = new Map<string, Ticket>()
    const frames = new Map<number, { token: string; cancel(): void }>()
    let stopped = false
    const reply = (requestId: string, ok: boolean, extra: { token?: string; surface?: 'notes'; message?: string } = {}) => {
        if (!stopped) window.dispatchEvent(new window.CustomEvent(REPLY, { detail: { requestId, ok, ...extra } }))
    }
    const inputs = (sessionId: string, notes = false) => Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[data-odyssey-file-reference-session]'))
        .filter(element => element.dataset.odysseyFileReferenceSession === sessionId && (!notes || element.closest<HTMLElement>('[data-ework-notes-composer-host]')?.dataset.eworkNotesComposerHost === sessionId))
    const current = (ticket?: Ticket) => {
        const id = deps.sessions.list.getSnapshot().current
        if (!id) throw Error('请先创建或选择一个对话，再使用技能。')
        if (ticket && id !== ticket.sessionId) throw Error('当前对话已切换，请重新点击“立即使用”。')
        const binding = deps.sessions.binding(id)
        if (!binding) throw Error('对话尚未就绪，请稍后重试。')
        if (deps.sessions.subagentAddress(id) || binding.session.getSnapshot().subagent) throw Error('请返回主对话使用技能，子代理输入暂不支持。')
        const ordinary = deps.inputHub.shell(id), shell = deps.activeInput?.(id, ordinary) ?? ordinary, snapshot = shell.snapshot
        const notes = shell !== ordinary
        if (notes && document.body.dataset.workspaceSurface !== 'notes') throw Error('笔记输入已关闭，请重新选择技能。')
        if (shell.disposed || (ticket && (shell !== ticket.shell || (ticket.surface === 'notes') !== notes)) || binding.session.getSnapshot().removed) throw Error('对话已关闭，请重新选择对话。')
        if (snapshot.phase !== 'plain' || snapshot.researchContextPreparing || deps.composerBlocks.storeFor(id).getSnapshot() !== undefined)
            throw Error('对话输入暂不可编辑，请完成当前操作后再使用技能。')
        // A research composer can be resident in a hidden tab; the native disabled/readOnly
        // flags still carry workspace, approval and collaboration edit restrictions.
        if (!inputs(id, notes).some(element => !element.disabled && !element.readOnly)) throw Error('对话输入框暂不可编辑，请先打开可编辑的对话。')
        if (ticket && snapshot.draftRev !== ticket.revision) throw Error('对话草稿已变更，原输入已保留，请重新点击“立即使用”。')
        return { id, shell, snapshot, notes }
    }
    const focus = (requestId: string, token: string, ticket: Ticket) => {
        const origin = document.activeElement
        let attempts = 0
        let openedPanel = false
        const retry = () => {
            if (++attempts >= 12) throw Error('技能已加入草稿，请打开对话输入框继续填写需求。')
            schedule()
        }
        const tick = () => {
            try {
                if (stopped) return
                const {notes} = current(ticket)
                const research = !notes && deps.researchSidebar.stores.get(ticket.sessionId)?.getSnapshot().binding?.active === true
                const toggle = document.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry="right"]')
                // Compact desktop panes have their own native visibility state. Wait for
                // the surface handoff, then use that pane's existing control once.
                if ((!notes && document.body.dataset.workspaceSurface) || (research && toggle?.dataset.workspacePanel)) { retry(); return }
                if (research && !openedPanel && toggle?.getAttribute('aria-expanded') === 'false' && !toggle.disabled) {
                    openedPanel = true
                    toggle.click()
                    retry()
                    return
                }
                // Native file chips project their placeholder glyph in the textarea. The
                // newly inserted plain prefix remains identical and determines this caret.
                const prefix = ticket.shell.snapshot.draft.slice(0, ticket.caret)
                const input = inputs(ticket.sessionId, notes).find(element => !element.disabled && !element.readOnly && !element.closest('[hidden],[aria-hidden="true"],[inert]') && element.checkVisibility() && matchesProjectedPrefix(element.value, prefix))
                if (!input) {
                    retry()
                    return
                }
                if (document.activeElement !== origin && document.activeElement !== document.body && document.activeElement !== input)
                    throw Error('技能已加入草稿，焦点已移至其他位置。')
                input.focus({ preventScroll: true })
                input.setSelectionRange(ticket.caret, ticket.selectionEnd)
                reply(requestId, true)
            } catch (error) { reply(requestId, false, { message: error instanceof Error ? error.message : '无法定位对话输入框。' }) }
        }
        const schedule = () => {
            const frame = window.requestAnimationFrame(() => { frames.delete(frame); tick() })
            frames.set(frame, { token, cancel: () => reply(requestId, false, { message: '技能输入已取消。' }) })
        }
        schedule()
    }
    const onRequest = (event: Event) => {
        const data = (event as CustomEvent<unknown>).detail
        if (!data || typeof data !== 'object') return
        const request = data as Record<string, unknown>
        const requestId = request.requestId
        if (typeof requestId !== 'string' || !requestId || requestId.length > 200) return
        for (const [token, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(token)
        try {
            if (request.phase === 'prepare') {
                const { id, shell, snapshot, notes } = current()
                if (request.sessionId !== undefined && request.sessionId !== id) throw Error('当前对话已切换，请重新选择技能。')
                if (request.expectedDraftRev !== undefined && (!Number.isSafeInteger(request.expectedDraftRev) || request.expectedDraftRev !== snapshot.draftRev))
                    throw Error('对话草稿已变更，原输入已保留，请重新点击快捷卡片。')
                let span = {start:0,end:0}
                if (request.commandSegment !== undefined) {
                    const segment = request.commandSegment as {via?:string;span?:{start:number;end:number;draftRev:number};token?:string}
                    if(segment?.via==='menu') {
                        const s=segment.span
                        if(!s || !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start<0 || s.end<s.start || s.end>snapshot.draft.length || s.draftRev!==snapshot.draftRev) throw Error('草稿已变化，请重新打开技能菜单。')
                        const token=snapshot.draft.slice(s.start,s.end)
                        if(token.trim() && (!token.startsWith('/') || !'skills'.startsWith(token.slice(1)))) throw Error('技能命令已变化，原输入已保留。')
                        span={start:s.start,end:s.end}
                    } else if(segment?.via==='enter' && segment.token==='/skills' && snapshot.draft.trim()==='/skills') {
                        span={start:0,end:snapshot.draft.length}
                    } else throw Error('技能命令已变化，原输入已保留。')
                }
                if (tickets.size >= 32) tickets.delete(tickets.keys().next().value!)
                const token = window.crypto.randomUUID()
                tickets.set(token, { sessionId: id, shell, surface: notes ? 'notes' : 'conversation', revision: snapshot.draftRev, expires: Date.now() + 60_000, inserted: false, caret: 0, selectionEnd: 0, span })
                reply(requestId, true, { token, ...(notes ? { surface: 'notes' as const } : {}) })
                return
            }
            const token = typeof request.token === 'string' ? request.token : ''
            if (request.phase === 'cancel') {
                tickets.delete(token)
                for (const [frame, job] of frames) if (job.token === token) {
                    window.cancelAnimationFrame(frame)
                    frames.delete(frame)
                    job.cancel()
                }
                reply(requestId, true)
                return
            }
            const ticket = tickets.get(token)
            if (!ticket) throw Error('本次技能操作已失效，请重新点击“立即使用”。')
            if (request.phase === 'focus') {
                tickets.delete(token)
                if (!ticket.inserted) throw Error('技能尚未加入草稿，请重新点击“立即使用”。')
                current(ticket)
                focus(requestId, token, ticket)
                return
            }
            if (request.phase !== 'insert' || typeof request.invocationName !== 'string' || !/^ework-skill-[a-f0-9]{16}$/.test(request.invocationName))
                throw Error('技能引用无效，请刷新技能后重试。')
            const { shell, snapshot, notes } = current(ticket)
            if (ticket.inserted) throw Error('本次技能已加入草稿，请返回对话继续填写需求。')
            const research = !notes && deps.researchSidebar.stores.get(ticket.sessionId)?.getSnapshot().binding?.active === true
            if (research && !deps.researchSidebar.service) throw Error('对话面板尚未就绪，请稍后重试。')
            const reference=request.reference===undefined?undefined:decodeSkillReference(JSON.stringify(request.reference))
            if(reference&&reference.invocationName!==request.invocationName)throw Error('技能引用无效，请重新选择技能。')
            // Validate every prefill field before either native insertion can change the draft.
            const prefill = decodePrefill(request.prefill)
            if (prefill && !reference) throw Error('预填内容需要有效的技能引用，原草稿已保留。')
            const prefix = `/${request.invocationName}`
            let selection: { start: number; end: number } | undefined
            if(prefill?.mode==='replace'&&reference){
                if(typeof shell.setDraft!=='function')throw Error('当前输入框暂不支持替换预填，原草稿已保留。')
                const attachments=(snapshot.occurrences??[]).filter(o=>o.source!==SKILL_REFERENCE_SOURCE).sort((a,b)=>a.offset-b.offset)
                if(attachments.some((o,index)=>!Number.isSafeInteger(o.offset)||o.offset<0||snapshot.draft[o.offset]!=='\uFFFC'||(index>0&&o.offset===attachments[index-1]!.offset)))throw Error('附件引用已变化，原草稿已保留，请重试。')
                const changed=()=>Error('草稿发生变化，原输入已保留，请重试。')
                const write=(start:number,end:number,text:string)=>{
                    const {snapshot:before}=current(ticket)
                    const next=before.draft.slice(0,start)+text+before.draft.slice(end)
                    if(next===before.draft)return
                    // Match native chip deletion: an explicit edit range keeps
                    // identical placeholder glyphs from changing file identities.
                    shell.setDraft!(next,{start,end,insertedLength:text.length})
                    if(shell.snapshot.draftRev!==before.draftRev+1||shell.snapshot.draft!==next)throw changed()
                    ticket.revision=before.draftRev+1
                }
                // Keep every non-skill attachment in order. Work right to left
                // so these original offsets stay valid until the prefix is replaced.
                for(let index=attachments.length-1;index>=0;index--){
                    write(attachments[index]!.offset+1,attachments[index+1]?.offset??snapshot.draft.length,' ')
                }
                const {snapshot:before}=current(ticket)
                const ref=encodeSkillReference(reference),label=`/${reference.label}`
                if(!shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref,label,clipboardText:label},{start:0,end:attachments[0]?.offset??before.draft.length,draftRev:before.draftRev}))throw changed()
                ticket.revision=before.draftRev+1
                current(ticket)
                write(2,2,`${prefill.text}${attachments.length?'\n\n':''}`)
                selection={start:2+prefill.selectionStart,end:2+prefill.selectionEnd}
            }else if(reference){
                const ref=encodeSkillReference(reference),label=`/${reference.label}`
                const present=snapshot.occurrences?.find(o=>{
                    if(o.source!==SKILL_REFERENCE_SOURCE||snapshot.draft[o.offset]!=='\uFFFC')return false
                    try{return decodeSkillReference(o.ref).id===reference.id}catch{return false}
                })
                let referenceOffset=present?.offset??ticket.span.start
                if(present){
                    // A repeat selection consumes only this menu's slash token;
                    // the existing native chip, body and other references stay put.
                    if(ticket.span.end>ticket.span.start){
                        if(!shell.insertText('',{...ticket.span,draftRev:ticket.revision}))throw Error('草稿发生变化，原输入已保留，请重试。')
                        if(ticket.span.end<=referenceOffset)referenceOffset-=ticket.span.end-ticket.span.start
                    }
                    if(present.ref!==ref){
                        const keepGap=shell.snapshot.draft[referenceOffset+1]===' '
                        if(!shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref,label,clipboardText:label},{start:referenceOffset,end:referenceOffset+1,draftRev:shell.snapshot.draftRev}))throw Error('草稿发生变化，原输入已保留，请重试。')
                        // Native insertion adds a separator; an in-place refresh must
                        // preserve a gap the user deliberately removed as well.
                        if(!keepGap&&!shell.insertText('',{start:referenceOffset+1,end:referenceOffset+2,draftRev:shell.snapshot.draftRev}))throw Error('草稿发生变化，原输入已保留，请重试。')
                    }
                    const caret=referenceOffset+1+(shell.snapshot.draft[referenceOffset+1]===' '?1:0)
                    selection={start:caret,end:caret}
                }
                if(!present&&!shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref,label,clipboardText:label},{...ticket.span,draftRev:ticket.revision}))throw Error('草稿发生变化，原输入已保留，请重试。')
                if (prefill) {
                    const oldTail = present ? shell.snapshot.draft.slice(referenceOffset + 1) : snapshot.draft.slice(ticket.span.end)
                    const hasBody = present && shell.snapshot.draft.replace(/\uFFFC/g, '').trim().length > 0
                    if (!hasBody) {
                        // The native chip adds a space unless the original tail already
                        // begins with one. Preserve that original tail verbatim.
                        const nativeGap = !present && oldTail[0] !== ' '
                        const existingGap = present && oldTail[0] === ' '
                        const start = referenceOffset + 1 + (nativeGap || existingGap ? 1 : 0)
                        const gap = nativeGap || existingGap ? '' : ' '
                        const tail = existingGap ? oldTail.slice(1) : oldTail
                        const text = `${gap}${prefill.text}${tail ? '\n\n' : ''}`
                        const revision = shell.snapshot.draftRev
                        if (!shell.insertText(text, { start, end: start, draftRev: revision })) throw Error('草稿发生变化，原输入已保留，请重试。')
                        selection = { start: start + gap.length + prefill.selectionStart, end: start + gap.length + prefill.selectionEnd }
                    }
                }
            }else{
            const present = snapshot.draft.startsWith(prefix) && (snapshot.draft.length === prefix.length || /\s/.test(snapshot.draft[prefix.length]!))
            const separator = /\s/.test(snapshot.draft[ticket.span.end] ?? '') ? '' : ' '
            if (!present && !shell.insertText(`${prefix}${separator}`, { ...ticket.span, draftRev: ticket.revision }))
                throw Error('草稿发生变化，原输入已保留，请重试。')
            }
            ticket.revision = shell.snapshot.draftRev
            ticket.inserted = true
            ticket.caret = selection?.start ?? Math.min(ticket.span.start + (reference?2:prefix.length+1), shell.snapshot.draft.length)
            ticket.selectionEnd = selection?.end ?? ticket.caret
            if (research) {
                const scope = { sessionId: ticket.sessionId }
                deps.researchSidebar.service!.activateTab('sherlock-research-conversation', scope)
                deps.researchSidebar.service!.setPanelState({ open: true }, scope)
            }
            reply(requestId, true, { token })
        } catch (error) {
            if (typeof request.token === 'string') tickets.delete(request.token)
            reply(requestId, false, { message: error instanceof Error ? error.message : '暂时无法使用技能，请稍后重试。' })
        }
    }
    window.addEventListener(REQUEST, onRequest)
    return () => {
        window.removeEventListener(REQUEST, onRequest)
        for (const [frame, job] of frames) { window.cancelAnimationFrame(frame); job.cancel() }
        stopped = true
        frames.clear()
        tickets.clear()
    }
}
