import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {patchPendingConversationPanel,stripPendingConversationPanel} from '../scripts/lib/pending-conversation-panel.mjs'
it('preserves native pane behavior, removes eager creation, and keeps compact first-send handoff expanded',()=>{
 const raw=readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'),patched=patchPendingConversationPanel(raw)
 expect(stripPendingConversationPanel(patched)).toBe(stripPendingConversationPanel(raw));expect(patchPendingConversationPanel(patched)).toBe(patched);expect(()=>new Function(patched)).not.toThrow()
 const start=patched.indexOf('function Sidebar(props)'),end=patched.indexOf('\n\t\t//#endregion',start),body=patched.slice(start,end);expect(body).not.toContain('ctx.workspaces.startSession')
 expect(body).not.toContain('sRp_pendingFrame');expect(body).not.toContain('data-pending-conversation-host');expect(body).toContain('(Workbench, {')
 expect(patched).toContain('pendingState = makePendingPanelState()');expect(patched).toContain('adoptPending(sessionId)')
 const from=body.indexOf('const pendingCompactHandoff='),to=body.indexOf('const summaryCwd',from),fragment=body.slice(from,to)
 const refs=[{current:false},{current:undefined}],values=[]
 let nextRef=0,sessionId,showChat
 const react={useRef:()=>refs[nextRef++],useLayoutEffect:fn=>fn()}
 const document={documentElement:{dataset:{},hasAttribute:()=>false},addEventListener:(_name,handler)=>{showChat=handler}}
 const store={getSnapshot:()=>({sessionId})}
 const render=new Function('react','document','store','current','sessionId','state','setCompactPanelOpen',fragment)
 const select=(id)=>{
  nextRef=0;sessionId=id
  render(react,document,store,id,id,{panelOpen:true},value=>values.push(value))
 }
 select(undefined);select('first');expect(values.at(-1)).toBe(true)
 select('other');expect(values.at(-1)).toBe(false)
 showChat({detail:{sessionId:'from-knowledge'}})
 select('from-knowledge');expect(values.at(-1)).toBe(true)
 select('unrelated');expect(values.at(-1)).toBe(false)
 select('from-knowledge');expect(values.at(-1)).toBe(false)
 showChat({detail:{sessionId:'from-knowledge'}});expect(values.at(-1)).toBe(true)
})
it('uses the global sidebar store without persisting a fake session, then hands its tabs to the created session',()=>{
 const source=patchPendingConversationPanel(readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')),start=source.indexOf('function makePendingPanelState'),end=source.indexOf('\n\t\t//#endregion',start);
 const makeDefaultState=(width,panelOpen)=>({width,panelOpen,splits:{id:'main',kind:'leaf',tabs:[{id:'files',type:'editor'}],active:'files'}}),values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const Store=new Function('makeDefaultState','SIDEBAR_PREFS_DEFAULTS','localStorage','loadState','maxCounterId','let nextIdCounter=0;'+source.slice(start,end)+';return SidebarStore')(makeDefaultState,{},storage,()=>makeDefaultState(340,false),()=>0),store=new Store(),persist=vi.fn();store.schedulePersist=persist;
 store.reduce(state=>({...state,panelOpen:true,width:400}));expect(store.getSnapshot().sessionId).toBeUndefined();expect(store.getSnapshot().state.splits.tabs[0].type).toBe('sherlock-research-conversation');expect(store.bySession.has(undefined)).toBe(false);expect(persist).not.toHaveBeenCalled();
 store.adoptPending('first');store.setSession('first');expect(store.getSnapshot().state.width).toBe(400);expect(store.getSnapshot().state.panelOpen).toBe(true);expect(persist).toHaveBeenCalledWith('first',expect.any(Object));store.setSession(undefined);expect(store.getSnapshot().state.width).toBe(400);
})
