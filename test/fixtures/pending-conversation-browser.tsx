import {createRightProjectDrafts,installSidebarWorkspaceHandoff} from '../../scripts/lib/right-project-drafts.mjs'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import {createPendingComposerPreferences} from '../../scripts/lib/pending-composer-preferences.mjs'
import {createPendingConversation} from '../../scripts/lib/pending-conversation.mjs'
import {eworkBindWorkspaceDraft} from '../../scripts/lib/workspace-draft-state.mjs'
import {mountDesktopShellStyles} from '../../src/preload/shell-style'
import {WorkspaceSurfaceHost} from '../../src/preload/workspace-surface-host'
import {mountImageFactory} from '../../src/preload/image-factory/view'
import {installImageFactoryContext} from '../../scripts/lib/image-factory-native.mjs'
import type {CanvasScope, StoredCanvas} from '../../src/shared/image-factory-canvas'
declare global{interface Window{pendingInput:any;pendingFixture:any;__ModuleLoader__:any}}
const data=window.pendingInput,fake:any=new Proxy(function(){},{get:(_target,key)=>key===Symbol.toPrimitive?()=> 'unused':fake,apply:()=>fake,construct:()=>({})});let runtime:any
function load(source:string){let result:any;window.__ModuleLoader__={load:({factory}:any)=>{result=factory((name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom'?{createPortal}:name==='@deepseek-ai/dsh-client-runtime/client'?runtime:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/cordis'?new Proxy({Context:{filter:Symbol('filter')}},{get:(target,key)=>Reflect.get(target,key)??fake}):fake)}};new Function(source)();return result}
runtime=load(data.runtime);const native=load(data.conversation),workspace=load(data.workspace),panel=load(data.panel),triggers=load(data.triggers)
let failCreate=false;const events:any[]=[],projects={phase:'ready',items:[{workspaceId:'A',title:'研究项目 A',path:'/tmp/a',sessionIds:data.verifyRightProject?['existing-canvas']:[]},{workspaceId:'B',title:'研究项目 B',path:'/tmp/b',sessionIds:[]}],recentWorkspaceId:data.recentWorkspaceId,archivedSessionIds:[]},current={current:undefined as string|undefined}
const active=runtime.createSnapshotStore(undefined),ready=runtime.createSnapshotStore(false)
const initialized:any[]=[],views=new Map<string,string>()
const source={name:'command',trigger:'/',order:0,candidates:async()=>[{name:'model',description:'切换模型'}],onPick:()=> 'handled'}
const controller=new triggers.InputTriggerController({sessionId:'new-session',roster:{all:()=>[source],sources:()=>[source]}})
const real=new native.__testSessionInputShell({actx:{get:()=>undefined},inputTriggers:()=>controller,defaultSink:(text:string,images:string[])=>events.push({type:'send',text,images})})
const history = new native.__testSessionInputShell({
 actx:{get:()=>undefined},inputTriggers:()=>undefined,
 defaultSink:(text:string)=>events.push({type:'continue',id:'existing-canvas',text})
})
const imageInputs = new Map([['existing-canvas', history]])
const historyState = {openState:'open',composerPhase:'active',pending:[],chat:{
 order:['prior'],nodes:new Map([['prior',{kind:'context',data:{text:'已有消息'}}]])
}}
const options={makeShell:(deps:any)=>new native.__testSessionInputShell({...deps,actx:{},inputTriggers:()=>undefined}),sessions:{list:{getSnapshot:()=>current,subscribe:active.subscribe},create:async(value:any)=>{events.push({type:'create',...value});if(failCreate){failCreate=false;throw Error('测试创建失败，输入保留')}
 const id=value.sessionId??'new-session';
 const project=projects.items.find(item=>item.workspaceId===value.workspaceId);project?.sessionIds.push(id);emptySessions.byId[id]={cwd:value.cwd??project?.path,blank:true};
 if(value.sessionId)imageInputs.set(id,options.makeShell({defaultSink:(text:string,images:string[])=>events.push({type:'send',text,images})}));
 return id},open:(id:string)=>{current.current=id;events.push({type:'open',id});active.set(id)}},workspaces:{list:{getSnapshot:()=>projects,subscribe:()=>()=>{}}},getInput:()=>real,onCreated:(id:string,_context:unknown,source?:{sessionId?:string})=>{
 if(!source?.sessionId)window.dispatchEvent(new CustomEvent('sherlock:pending-conversation-created',{detail:{sessionId:id}}))
},prepareContext:async()=>undefined,
 initializeWorkspaceSession:async(id:string,view:string)=>initialized.push({id,view}),
 currentSurface:()=>document.body.dataset.workspaceSurface,
 standaloneDirectory:async()=>'/tmp/standalone/outputs',
 setView:(id:string,view:string)=>{views.set(id,view);events.push({type:'view',id,view})}}
const record=createPendingConversation(options)
const right=createRightProjectDrafts({globalDraft:record,makeDraft:(entry:any,ownership:any)=>createPendingConversation({
 ...options,initialWorkspace:entry.workspaceId,detached:{...ownership,get sessionId(){return entry.sessionId},mode:['notes','research','spreadsheet'].includes(entry.mode)?entry.mode:'chat',
  isCommandCurrent:()=>!entry.tabId||document.body.dataset.browserActiveTab===entry.tabId}
})})
if(data.verifyRightProject){current.current='existing-canvas';active.set('existing-canvas')}
native.__testSetRightProjects(right)

record.views={subscribe:()=>()=>{},version:()=>1,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'},{id:'spreadsheet',label:'表格'}]}
record.preferences=createPendingComposerPreferences({api:{llm:{models:async()=>({result:{ok:true,value:{groups:[],failures:[]}}})},settings:{describe:async()=>({result:{ok:true,value:{namespaces:[]}}})}}});native.__testSetPending(record)
const NativePendingBar=new Function('eworkPendingConversation','react','react_jsx_runtime','InputBar','EWorkSharedInputBar','conversationController','return ('+data.wrapper+')')(record,React,jsx,native.__testInputBar,native.__testInputBar,{draftImages:()=>[],createDraftImages:()=>[],releaseDraftImage:()=>{},releaseDraftImages:()=>{}})
const lexicon=new Map(),state={running:false,removed:false,subagent:null,pending:[],permissions:{}};const t=(key:string)=>({'input.send':'发送消息','input.commands':'命令','placeholder.workspace':'选择项目','workspace.select':'选择工作区','workspace.choose':'选择工作区','workspace.pick':'选择工作区','hero.chooseWorkspace':'选择项目'}[key]||key)
const hooks={sessionId:undefined,useSession:(select:any)=>select(state),useInput:(select:any)=>select(undefined),inputActions:undefined,keyboard:undefined,useNotices:(select:any)=>select(null),useLexicon:(select:any)=>select(lexicon),useMenuLauncher:(select:any)=>select(undefined),useProjection:(_key:string,select:any)=>typeof select==='function'?select(undefined):undefined,t,resolveSubmitMode:()=> 'queue'}
const useWorkspaces=(select:any)=>select(projects)
const renderSlot=(name:string,props:any)=>name==='conversation.composer.bar'?<NativePendingBar {...hooks} {...props} renderSlot={()=>null}/>:name==='conversation.hero.workspace'?<workspace.__testWorkspacePicker {...props} useWorkspaces={useWorkspaces} useDirectoryFlow={(select:any)=>select({status:'idle'})} createWorkspace={async()=>{throw Error('not used')}} renderSlot={()=>null} t={t}/>:null
mountDesktopShellStyles(document)
const coordinator=new native.ResearchSidebarCoordinator(),registry=new native.ResearchWorkspaceRegistry(),sidebarStore=new panel.__testSidebarStore();sidebarStore.reduce((s:any)=>({...s,panelOpen:true}));
function NativeRight(){React.useSyncExternalStore(active.subscribe,active.getSnapshot);const snapshot=React.useSyncExternalStore((fn:any)=>sidebarStore.subscribe(fn),()=>sidebarStore.getSnapshot()),state=snapshot.state;return <panel.__testWorkbench state={state} pendingSession={current.current===undefined} newTabOptions={[]} actions={{activateTab:(_pane:string,id:string)=>sidebarStore.reduce((s:any)=>({...s,splits:{...s.splits,active:id}})),closeTab:()=>{},focusPane:()=>{},moveTabToEdge:()=>{},moveTabBefore:()=>{},resizeSplit:()=>{}}} onNewTab={()=>{}} renderTab={(tab:any,active:boolean)=>tab.type==='sherlock-research-conversation'?<native.__testResearchSidebarConversationTab scope={{sessionId:current.current}} visible={active} coordinator={coordinator}/>:<div>项目文件</div>} getTabIcon={()=>null} getTabBadge={()=>null}/>}
const emptySessions={current:undefined,byId:(data.verifyRightProject?{'existing-canvas':{cwd:'/tmp/a',blank:!data.verifyHistory}}:{}) as Record<string,{cwd:string|undefined,blank:boolean}>,subagentsByParent:{}},view={view:data.initialView??'chat',selection:null,inspect:null},actions={setResearchRightTab(){},setResearchConversationUnread(){},select(){}};
const sidebarWorkspace=installSidebarWorkspaceHandoff({
 sessions:{list:{getSnapshot:()=>({...current,byId:emptySessions.byId})}},workspaces:options.workspaces,pending:record,right,doc:document
})
native.__testSetSidebarWorkspace(sidebarWorkspace)
document.body.dataset.odysseyGlobalRightOpen='true';
coordinator.service={getSnapshot:()=>sidebarStore.getSnapshot(),subscribeState:(fn:any)=>sidebarStore.subscribe(fn),
 openTab(){},updateTab(){},closeTab(){},activateTab(){},
 setPanelState({open}:{open:boolean}){sidebarStore.reduce((value:any)=>({...value,panelOpen:open}))}};coordinator.sessions={list:{subscribe:()=>()=>{},getSnapshot:()=>emptySessions}};coordinator.sourceWorkspaces={list:{subscribe:()=>()=>{},getSnapshot:()=>projects}};
const nativeRenderSlot=(name:string,props:any)=>name==='conversation.composer.bar'?<NativePendingBar {...hooks} {...props} renderSlot={()=>null}/>:renderSlot(name,props);
function ProjectComposer({sessionId}:{sessionId:string}){
 const opened=React.useSyncExternalStore(ready.subscribe,ready.getSnapshot)
 React.useLayoutEffect(()=>eworkBindWorkspaceDraft(real,'chat','',{},()=>{},()=>{throw Error('unexpected view switch')}),[])
 const fromStore=(store:any)=>(select:any)=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot))
 const toggleCommandMenu=(selection:any)=>{
  real.dismissPopup()
  controller.toggleSource('command',{trigger:'/',query:'',position:real.snapshot.draft.slice(0,selection.start).trim()?'inline':'leading',span:{...selection,draftRev:real.snapshot.draftRev}})
 }
 const overlay=<triggers.__testMenuView menu={controller.menu} onPick={(name:string,index:number)=>controller.pick(name,index)} onHighlight={(highlight:any)=>controller.reduce({type:'point',highlight})} onDismiss={()=>controller.dismiss()} t={t}/>
 return <div data-mounted-project={sessionId}><NativePendingBar {...hooks} sessionId={sessionId} keyboard={real} inputActions={real.actions} useInput={fromStore(real.state)} useSession={(select:any)=>select({...state,openState:opened?'open':'loading'})} useLexicon={fromStore(controller.lexicon)} useMenuLauncher={fromStore(controller.launcher)} toggleCommandMenu={toggleCommandMenu} overlay={overlay} draftImages={()=>[]} renderSlot={()=>null}/></div>
}
function Home(){
 const sessionId=React.useSyncExternalStore(active.subscribe,active.getSnapshot)
 if(data.verifyRightCommand&&sessionId==='new-session')return null
 if(data.verifyHandoff&&sessionId==='new-session')return <ProjectComposer sessionId={sessionId}/>
 const inHistory=data.verifyHistory&&sessionId==='existing-canvas'
 const shell=sessionId==='new-session'?real:inHistory?history:data.realImageTabs?imageInputs.get(sessionId):undefined
 const sessionState=inHistory?historyState:shell?{...state,openState:'open',composerPhase:'blank'}:undefined
 const historyInput=(select:any)=>select(React.useSyncExternalStore(shell.state.subscribe,shell.state.getSnapshot))
 const historyRenderSlot=(name:string,props:any)=>name==='conversation.composer.bar'
  ? <NativePendingBar {...hooks} {...props} sessionId={sessionId} useSession={select=>select(sessionState)}
      keyboard={shell} inputActions={shell.actions} useInput={historyInput} renderSlot={()=>null}/>
  : nativeRenderSlot(name,props)
 return <native.__testHomeGuideNativeOriginalConversationRoot key={sessionId??'home'} sessionId={sessionId} useSession={(select:any)=>sessionState?select(sessionState):undefined} useSessions={(select:any)=>select(emptySessions)} useWorkspaces={useWorkspaces} useInput={shell?historyInput:()=>undefined} useComposerBlock={()=>undefined} useStore={(select:any)=>select({...view,view:views.get(sessionId)??view.view})} actions={actions} researchSidebar={coordinator} researchWorkspaces={registry} useProjection={()=>undefined} renderSlot={shell?historyRenderSlot:nativeRenderSlot} renderSlotChain={(_name:any,_props:any,{fallback}:any)=>fallback} selectWorkspace={async(id:string)=>record.selectWorkspace(id)} t={t}/>
}
function Right(){
 const sessionId=React.useSyncExternalStore(active.subscribe,active.getSnapshot)
 React.useLayoutEffect(()=>{
  if(data.verifyRightCommand&&sessionId==='new-session')right.show({
   sessionId,mode:'browser',tabId:document.body.dataset.browserActiveTab,workspaceId:'B'
  })
 },[sessionId])
 return data.verifyRightCommand&&sessionId==='new-session'?<ProjectComposer sessionId={sessionId}/>:<NativeRight/>
}
createRoot(document.getElementById('app')!).render(<Home/>);
createRoot(document.getElementById('right-body')!).render(<Right/>);
const surfaces=new WorkspaceSurfaceHost(document)
let images: ReturnType<typeof mountImageFactory> | undefined
if (data.realImageTabs) {
 const canvases=new Map<CanvasScope,StoredCanvas>()
 const factory=installImageFactoryContext({
  sessions:{...options.sessions,
   binding:(id:string)=>emptySessions.byId[id]?{state:'open'}:undefined,
   clear:()=>{current.current=undefined;active.set(undefined)}
  },
  getInput:(id:string)=>imageInputs.get(id),getPending:()=>record,
  getTaskWorkspace:(id=current.current)=>id==null?record.getSnapshot().workspaceId:
   projects.items.find(project=>project.sessionIds.includes(id))?.workspaceId??null,
  standaloneDirectory:options.standaloneDirectory,
  setTaskView:(id:string)=>options.setView(id,'chat'),
  send:async()=>({ok:true})
 })
 native.__testSetImageFactory(factory)
 images=mountImageFactory(document,surfaces,{
  storage:{read:async scope=>({epoch:1,canvas:canvases.get(scope)}),
   write:async ({scope,canvas})=>{canvases.set(scope,canvas)},adopt:async()=>false},
  saveProject:async()=>{},save:async()=>({})
 })
}
for (const name of ['browser','image-factory','knowledge'] as const) {
 if (name==='image-factory' && images) continue
 const surface=document.createElement('section')
 surface.innerHTML='<button type="button">返回工作区</button>'
 surface.firstElementChild!.addEventListener('click',()=>surfaces.back())
 surfaces.register(name,surface)
}
const openSurface=(name:'browser'|'image-factory'|'knowledge')=>name==='image-factory'&&images?images.open():surfaces.open(name)
window.pendingFixture={sidebarWorkspace,openViaRail(name:'browser'|'image-factory'|'knowledge'){
 document.dispatchEvent(new CustomEvent('sherlock:sidebar-launch-workspace-app',{detail:name}))
 openSurface(name)
},openSurface,events,initialized,record,right,real,controller,openExisting(id:string){current.current=id;active.set(id)},
 goHome(){document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened'));current.current=undefined;active.set(undefined)},
 readySession:()=>ready.set(true),current,failOnce:()=>{failCreate=true},setPaneOpen(open:boolean){
 sidebarStore.reduce((s:any)=>({...s,panelOpen:open}))
 document.getElementById('right')!.hidden=!open
 document.body.dataset.odysseyGlobalRightOpen=String(open)
}};document.documentElement.dataset.ready='true'
