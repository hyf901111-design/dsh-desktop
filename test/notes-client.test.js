import { expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { patchNotesClient } from '../scripts/lib/notes-client.mjs'
const source = `function ConversationSessionHeader({sessionId, composerPhase, active}) {
const blank = useSession((s) => s.blank);
const homeHeader = blank && composerPhase === "blank" && active?.id === "chat";
return {"data-srb-session-header":"", "data-odyssey-home-header":homeHeader, children: nativeTabs, utilities:{children: renderSlot("conversation.session.header.utilities", {})}};
}
function ConversationSession(){}
function boot(){registerResearchCanvasView(slots, t, researchWorkspaces, researchOfficePreview);}`
it('adds the session identity and registers notes in the native view ledger exactly once', () => {
  const patched = patchNotesClient(source)
  expect(patched).toContain('"data-ework-notes-session":sessionId')
  expect(patched).toContain('children: nativeTabs')
  expect(patchNotesClient(patched)).toBe(patched)
  const entries = [], effects = [], events = [], nativeTabs = {}, reference = { current: undefined }
  const context = { nativeTabs, selectView:()=>{}, useSession:select=>select({blank:true}), renderSlot:()=>null, react: { useRef: value => { reference.current ??= value; return reference }, useLayoutEffect: fn => effects.push(fn) }, react_jsx_runtime: { jsx: (type, props) => ({ type, props }), jsxs: (type,props)=>({type,props}) }, slots: { register: (options, view) => entries.push({ options, view }) }, t: () => {}, researchWorkspaces: {}, researchOfficePreview: {}, registerResearchCanvasView: () => {}, CustomEvent: class { constructor(type, options){this.type=type;this.detail=options.detail} }, document: { dispatchEvent: e => events.push(e) } }
  runInNewContext(patched+';boot()', context)
  expect(entries).toHaveLength(1)
  expect(entries[0].options).toMatchObject({ name:'conversation.view', id:'notes', order:7 })
  expect(entries[0].options.inject('session')).toEqual({sessionId:'session'})
  expect(entries[0].view({sessionId:'session'})).toMatchObject({type:'div'})
  const close = effects[0](); close()
  expect(events.map(e=>e.type)).toEqual(['sherlock:notes-open','sherlock:notes-close'])
})
it('retains the same header presentation when entering notes from chat or research', () => {
  const reference = {current:undefined}, nativeTabs = {}
  const header = runInNewContext(patchNotesClient(source)+';ConversationSessionHeader', { nativeTabs, selectView:()=>{}, useSession:select=>select({blank:true}), renderSlot:()=>null, react_jsx_runtime:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}, react:{useLayoutEffect:()=>{},useRef:value=>{reference.current??=value;return reference}} })
  const props = { sessionId:'session', blank:true, composerPhase:'blank' }
  const chat = header({...props,active:{id:'chat'}})
  const notes = header({...props,active:{id:'notes'}})
  expect(notes['data-odyssey-home-header']).toBe(chat['data-odyssey-home-header'])
  expect(notes.children).toBe(nativeTabs)
  header({...props,active:{id:'research'}})
  expect(header({...props,active:{id:'notes'}})['data-odyssey-home-header']).toBe(false)
})
it('refuses an unknown host instead of attaching notes to the wrong session', () => {
  expect(() => patchNotesClient('other header')).toThrow('无法定位')
})
