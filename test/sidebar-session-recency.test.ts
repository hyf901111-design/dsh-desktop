import {Window} from 'happy-dom'
import {readFileSync} from 'node:fs'
import {Script,runInNewContext} from 'node:vm'
import {afterEach,expect,it,vi} from 'vitest'
import {recordSidebarSessionUse,sidebarUsageTimes,patchSidebarSessionExperience} from '../scripts/lib/sidebar-session-recency.mjs'
import {patchSessionViewPreferences} from '../scripts/lib/session-view-preferences.mjs'
import {promoteSidebarOrder} from '../src/preload/sidebar-manual-order'
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
it('counts each actual edit even within the same session and ignores legacy navigation timestamps',()=>{
 const w=new Window();vi.stubGlobal('document',w.document);vi.stubGlobal('localStorage',w.localStorage);vi.stubGlobal('Event',w.Event)
 vi.spyOn(Date,'now').mockReturnValue(1000)
 w.localStorage.setItem('sherlock.sidebar.used.v1',JSON.stringify({visited:9000}));expect(sidebarUsageTimes()).toEqual({})
 recordSidebarSessionUse('old');const first=sidebarUsageTimes().old
 recordSidebarSessionUse('old');expect(sidebarUsageTimes().old).toBeGreaterThan(first!)
 recordSidebarSessionUse('other');recordSidebarSessionUse('old')
 expect(sidebarUsageTimes().old).toBeGreaterThan(sidebarUsageTimes().other!)
 expect(promoteSidebarOrder([{key:'old',time:sidebarUsageTimes().old!},{key:'other',time:sidebarUsageTimes().other!}],[],{}).order).toEqual(['old','other'])
 w.localStorage.setItem('sherlock.sidebar.activity.v2','invalid');expect(sidebarUsageTimes()).toEqual({})
})
it('upgrades the actual native workspace tree once without changing its grouping or drag infrastructure',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'),next=patchSidebarSessionExperience(source)
 expect(()=>new Script(next)).not.toThrow();expect(patchSidebarSessionExperience(next)).toBe(next)
 expect(next).toContain('revealedSidebarSession.current===key')
 expect(next).toContain('useSidebarRecencyList(useSessions');expect(next).not.toContain('recordSidebarSessionUse(list.current)')
})

it('moves a reused blank board to the front of its workspace only on explicit creation', () => {
 const w = new Window()
 vi.stubGlobal('document', w.document)
 vi.stubGlobal('localStorage', w.localStorage)
 vi.stubGlobal('Event', w.Event)
 vi.spyOn(Date, 'now').mockReturnValue(1000)

 const byId = { note: { updatedAt: 700 }, research: { updatedAt: 650 }, blank: { updatedAt: 100 } }
 const sessionIds = Object.keys(byId)
 const sessions = { list: { getSnapshot: () => ({ ids: sessionIds, byId }) } }
 const initializeWorkbenchResponsiveArrange = vi.fn()
 const conversation = patchSessionViewPreferences(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
 const intentStart = conversation.indexOf('function installInitialChatViewIntent(')
 const intentEnd = conversation.indexOf('function useInitialChatSessionView(', intentStart)
 const install = runInNewContext(conversation.slice(intentStart, intentEnd) + '; installInitialChatViewIntent', {
   window: w, explicitHomeViewSessions: new Set()
 })
 const off = install({}, sessions, { for: () => ({ initializeWorkbenchResponsiveArrange }) }, recordSidebarSessionUse)
 try {
   const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
   const start = source.indexOf('function reconciledSessionOrder(')
   const end = source.indexOf('function ViewOptionsMenu(', start)
   const nextOrder = runInNewContext(source.slice(start, end) + '; nextSessionOrderAccount')
   const entries = Object.entries(byId)
   const order = () => {
     const activity = sidebarUsageTimes()
     return nextOrder({
       sessionIds, previousOrder: sessionIds,
       previousUpdatedAt: Object.fromEntries(entries.map(([id, session]) => [id, session.updatedAt])),
       list: { byId: Object.fromEntries(entries.map(([id, session]) => [id, {
         updatedAt: Math.max(session.updatedAt, activity[id] ?? 0)
       }])) },
       orderBy: 'manual', sortByRecency: false
     }).order
   }
   const intent = (detail: { sessionId: string; newResearch?: boolean }) =>
     w.dispatchEvent(new w.CustomEvent('sherlock:conversation-initial-research', { detail }))

   intent({ sessionId: 'research' })
   expect(order()).toEqual(['note', 'research', 'blank'])
   intent({ sessionId: 'blank', newResearch: true })
   expect(order()).toEqual(['blank', 'note', 'research'])
   expect(initializeWorkbenchResponsiveArrange).toHaveBeenCalledTimes(1)
 } finally {
   off()
 }
})

it('promotes actual canvas edits, while loading, reopening, selection and viewport persistence leave order unchanged',()=>{
 const w=new Window();let descriptor:any
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const fake:any=new Proxy(function(){},{get:()=>fake,apply:()=>fake})
 ;(w as any).__ModuleLoader__={load:(value:any)=>descriptor=value}
 runInNewContext(source,{window:w,document:w.document,localStorage:w.localStorage,Event:w.Event,URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout})
 const bundle=descriptor.factory(()=>fake),values=new Map(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);return true}}
 let updates=0;w.document.addEventListener('sherlock-sidebar-recency',()=>updates++)
 let workspace=bundle.createResearchWorkspaceSession(storage,'board')
 workspace.setCanvasSize({width:900,height:700});workspace.persist();expect(updates).toBe(0)
 workspace.setArtifacts([{id:'p',kind:'pasted-text',title:'编辑验收',messageId:'m',excerpt:'正文',x:330,y:250,width:500,height:260,sizeMode:'manual'}]);expect(updates).toBeGreaterThan(0)
 const afterEdit=updates
 workspace.updateSelection(['p'],'replace');workspace.persist();expect(updates).toBe(afterEdit)
 workspace=bundle.createResearchWorkspaceSession(storage,'board');workspace.setCanvasSize({width:900,height:700});workspace.persist();expect(updates).toBe(afterEdit)
 workspace.applyDirectoryCanvas({files:[],artifacts:[{...workspace.getSnapshot().artifacts[0],excerpt:'打开目录时加载的内容'}]});workspace.persist();expect(updates).toBe(afterEdit)
 workspace.setArtifacts(workspace.getSnapshot().artifacts.map((node:any)=>({...node,excerpt:'用户修改正文'})));expect(updates).toBeGreaterThan(afterEdit)
})
