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
 const root={dataset:{},hasAttribute(name){
  const key={'data-home-guide-transition':'homeGuideTransition','data-home-guide-transition-sidebar':'homeGuideTransitionSidebar'}[name]
  return key in this.dataset
 }}
 const document={documentElement:root,addEventListener:(name,handler)=>{if(name==='sherlock:knowledge-session-chat')showChat=handler}}
 const window={addEventListener:()=>{}}
 const store={getSnapshot:()=>({sessionId})}
 const render=new Function('react','document','window','store','current','sessionId','state','setCompactPanelOpen',fragment)
 const select=(id)=>{
  nextRef=0;sessionId=id
  render(react,document,window,store,id,id,{panelOpen:true},value=>values.push(value))
 }
 select(undefined);select('first');expect(values.at(-1)).toBe(true)
 select('other');expect(values.at(-1)).toBe(false)
 showChat({detail:{sessionId:'from-knowledge'}})
 select('from-knowledge');expect(values.at(-1)).toBe(true)
 select('unrelated');expect(values.at(-1)).toBe(false)
 select('from-knowledge');expect(values.at(-1)).toBe(false)
 showChat({detail:{sessionId:'from-knowledge'}});expect(values.at(-1)).toBe(true)
 select(undefined)
 root.dataset={homeGuideTransition:'entry',homeGuideTransitionSession:'ppt'}
 select('ppt');expect(values.at(-1)).toBe(false)
 root.dataset={homeGuideTransition:'entry',homeGuideTransitionSession:'research',homeGuideTransitionSidebar:''}
 select('research');expect(values.at(-1)).toBe(true)
})
it('uses the global sidebar store without persisting a fake session, then hands its tabs to the created session',()=>{
 const source=patchPendingConversationPanel(readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')),start=source.indexOf('function makePendingPanelState'),end=source.indexOf('\n\t\t//#endregion',start);
 const makeDefaultState=(width,panelOpen)=>({width,panelOpen,splits:{id:'main',kind:'leaf',tabs:[{id:'files',type:'editor'}],active:'files'}}),values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const Store=new Function('makeDefaultState','SIDEBAR_PREFS_DEFAULTS','localStorage','loadState','maxCounterId','let nextIdCounter=0;'+source.slice(start,end)+';return SidebarStore')(makeDefaultState,{},storage,()=>makeDefaultState(340,false),()=>0),store=new Store(),persist=vi.fn();store.schedulePersist=persist;
 store.reduce(state=>({...state,panelOpen:true,width:400}));expect(store.getSnapshot().sessionId).toBeUndefined();expect(store.getSnapshot().state.splits.tabs[0].type).toBe('sherlock-research-conversation');expect(store.bySession.has(undefined)).toBe(false);expect(persist).not.toHaveBeenCalled();
 store.adoptPending('first');store.setSession('first');expect(store.getSnapshot().state.width).toBe(400);expect(store.getSnapshot().state.panelOpen).toBe(true);expect(persist).toHaveBeenCalledWith('first',expect.any(Object));store.setSession(undefined);expect(store.getSnapshot().state.width).toBe(400);
})

it('collapses Home and New Chat panes while retaining tabs, widths and other sessions',()=>{
 const source=patchPendingConversationPanel(readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'))
 const start=source.indexOf('function makePendingPanelState'),end=source.indexOf('\n\t\t//#endregion',start)
 const makeDefaultState=(width,panelOpen)=>({width,panelOpen,splits:{id:'main',kind:'leaf',tabs:[{id:'files',type:'editor'}],active:'files'}})
 const storage={getItem:()=>null,setItem:()=>{}}
 const Store=new Function('makeDefaultState','SIDEBAR_PREFS_DEFAULTS','localStorage','loadState','maxCounterId','let nextIdCounter=0;'+source.slice(start,end)+';return SidebarStore')(makeDefaultState,{},storage,()=>makeDefaultState(420,true),()=>0)
 const store=new Store()
 store.schedulePersist=vi.fn()
 const listenerStart=source.indexOf('react.useLayoutEffect(()=>{\n  const collapseHomePanel=')
 const listenerEnd=source.indexOf('\n },[store]);',listenerStart)
 expect(listenerStart).toBeGreaterThan(0)
 const fragment=source.slice(listenerStart,listenerEnd+'\n },[store]);'.length)
 const documentHandlers=new Map(),windowHandlers=new Map(),compact=[]
 const document={addEventListener:(name,fn)=>documentHandlers.set(name,fn),removeEventListener:name=>documentHandlers.delete(name)}
 const window={addEventListener:(name,fn)=>windowHandlers.set(name,fn),removeEventListener:name=>windowHandlers.delete(name)}
 let dispose
 new Function('react','document','window','store','setCompactPanelOpen','pendingCompactHandoff',fragment)(
  {useLayoutEffect:fn=>{dispose=fn()}},document,window,store,value=>compact.push(value),{current:true})
 const home=()=>documentHandlers.get('sherlock:sidebar-home-opened')({})
 const newChat=id=>windowHandlers.get('sherlock:conversation-initial-chat')({detail:{sessionId:id}})
 store.reduce(value=>({...value,panelOpen:true,width:400}))
 const tabs=store.getSnapshot().state.splits
 home()
 expect(store.getSnapshot().state).toMatchObject({panelOpen:false,width:400,splits:tabs})
 store.reduce(value=>({...value,panelOpen:true}))
 home()
 expect(store.getSnapshot().state.panelOpen).toBe(false)
 store.setSession('existing')
 const existing=store.getSnapshot().state
 home()
 expect(store.getSnapshot().state).toBe(existing)
 expect(existing.panelOpen).toBe(true)
 newChat('fresh-chat')
 expect(store.bySession.get('fresh-chat').panelOpen).toBe(false)
 expect(store.getSnapshot().state).toBe(existing)
 store.setSession('fresh-chat')
 store.reduce(value=>({...value,panelOpen:true}))
 newChat('fresh-chat')
 expect(store.getSnapshot().state.panelOpen).toBe(false)
 expect(compact.at(-1)).toBe(false)
 dispose()
 expect(documentHandlers.size+windowHandlers.size).toBe(0)
})
