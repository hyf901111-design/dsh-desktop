import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import {createPendingComposerPreferences} from '../../scripts/lib/pending-composer-preferences.mjs'
import {createPendingConversation} from '../../scripts/lib/pending-conversation.mjs'
import {mountDesktopShellStyles} from '../../src/preload/shell-style'
import {WorkspaceSurfaceHost} from '../../src/preload/workspace-surface-host'
declare global{interface Window{pendingInput:any;pendingFixture:any;__ModuleLoader__:any}}
const data=window.pendingInput,fake:any=new Proxy(function(){},{get:(_target,key)=>key===Symbol.toPrimitive?()=> 'unused':fake,apply:()=>fake,construct:()=>({})});let runtime:any
function load(source:string){let result:any;window.__ModuleLoader__={load:({factory}:any)=>{result=factory((name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom'?{createPortal}:name==='@deepseek-ai/dsh-client-runtime/client'?runtime:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/cordis'?new Proxy({Context:{filter:Symbol('filter')}},{get:(target,key)=>Reflect.get(target,key)??fake}):fake)}};new Function(source)();return result}
runtime=load(data.runtime);const native=load(data.conversation),workspace=load(data.workspace),panel=load(data.panel)
let failCreate=false;const events:any[]=[],projects={phase:'ready',items:[{workspaceId:'A',title:'研究项目 A',path:'/tmp/a',sessionIds:[]},{workspaceId:'B',title:'研究项目 B',path:'/tmp/b',sessionIds:[]}],recentWorkspaceId:data.recentWorkspaceId,archivedSessionIds:[]},current={current:undefined as string|undefined}
const real=new native.__testSessionInputShell({actx:{},inputTriggers:()=>undefined,defaultSink:(text:string,images:string[])=>events.push({type:'send',text,images})})
const record=createPendingConversation({makeShell:(deps:any)=>new native.__testSessionInputShell({...deps,actx:{},inputTriggers:()=>undefined}),sessions:{list:{getSnapshot:()=>current},create:async(value:any)=>{events.push({type:'create',...value});if(failCreate){failCreate=false;throw Error('测试创建失败，输入保留')}return 'new-session'},open:(id:string)=>{current.current=id;events.push({type:'open',id})}},workspaces:{list:{getSnapshot:()=>projects,subscribe:()=>()=>{}}},getInput:()=>real,onCreated:()=>{},prepareContext:async()=>undefined,
 currentSurface:()=>document.body.dataset.workspaceSurface,
 setView:(id:string,view:string)=>events.push({type:'view',id,view}),
 openCommands:(id:string,shell:any,selection:any,typed:boolean)=>events.push({type:'commands',id,draft:shell.snapshot.draft,caret:selection.start,typed:!!typed})})
record.views={subscribe:()=>()=>{},version:()=>1,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'},{id:'spreadsheet',label:'表格'}]}
record.preferences=createPendingComposerPreferences({api:{llm:{models:async()=>({result:{ok:true,value:{groups:[],failures:[]}}})},settings:{describe:async()=>({result:{ok:true,value:{namespaces:[]}}})}}});native.__testSetPending(record)
const NativePendingBar=new Function('eworkPendingConversation','react','react_jsx_runtime','InputBar','EWorkSharedInputBar','conversationController','return ('+data.wrapper+')')(record,React,jsx,native.__testInputBar,native.__testInputBar,{draftImages:()=>[],createDraftImages:()=>[],releaseDraftImage:()=>{},releaseDraftImages:()=>{}})
const lexicon=new Map(),state={running:false,removed:false,subagent:null,pending:[],permissions:{}};const t=(key:string)=>({'input.send':'发送消息','input.commands':'命令','placeholder.workspace':'选择项目','workspace.select':'选择工作区','workspace.choose':'选择工作区','workspace.pick':'选择工作区','hero.chooseWorkspace':'选择项目'}[key]||key)
const hooks={sessionId:undefined,useSession:(select:any)=>select(state),useInput:(select:any)=>select(undefined),inputActions:undefined,keyboard:undefined,useNotices:(select:any)=>select(null),useLexicon:(select:any)=>select(lexicon),useMenuLauncher:(select:any)=>select(undefined),useProjection:(_key:string,select:any)=>typeof select==='function'?select(undefined):undefined,t,resolveSubmitMode:()=> 'queue'}
const useWorkspaces=(select:any)=>select(projects)
const renderSlot=(name:string,props:any)=>name==='conversation.composer.bar'?<NativePendingBar {...hooks} {...props} renderSlot={()=>null}/>:name==='conversation.hero.workspace'?<workspace.__testWorkspacePicker {...props} useWorkspaces={useWorkspaces} useDirectoryFlow={(select:any)=>select({status:'idle'})} createWorkspace={async()=>{throw Error('not used')}} renderSlot={()=>null} t={t}/>:null
mountDesktopShellStyles(document)
const coordinator=new native.ResearchSidebarCoordinator(),registry=new native.ResearchWorkspaceRegistry(),sidebarStore=new panel.__testSidebarStore();sidebarStore.reduce((s:any)=>({...s,panelOpen:true}));
function NativeRight(){const snapshot=React.useSyncExternalStore((fn:any)=>sidebarStore.subscribe(fn),()=>sidebarStore.getSnapshot()),state=snapshot.state;return <panel.__testWorkbench state={state} pendingSession={snapshot.sessionId===undefined} newTabOptions={[]} actions={{activateTab:(_pane:string,id:string)=>sidebarStore.reduce((s:any)=>({...s,splits:{...s.splits,active:id}})),closeTab:()=>{},focusPane:()=>{},moveTabToEdge:()=>{},moveTabBefore:()=>{},resizeSplit:()=>{}}} onNewTab={()=>{}} renderTab={(tab:any,active:boolean)=>tab.type==='sherlock-research-conversation'?<native.__testResearchSidebarConversationTab scope={{sessionId:undefined}} visible={active} coordinator={coordinator}/>:<div>项目文件</div>} getTabIcon={()=>null} getTabBadge={()=>null}/>}
const emptySessions={current:undefined,byId:{},subagentsByParent:{}},view={view:'chat',selection:null,inspect:null},actions={setResearchRightTab(){},setResearchConversationUnread(){},select(){}};
document.body.dataset.odysseyGlobalRightOpen='true';
coordinator.service={getSnapshot:()=>sidebarStore.getSnapshot(),subscribeState:(fn:any)=>sidebarStore.subscribe(fn)};coordinator.sessions={list:{subscribe:()=>()=>{},getSnapshot:()=>emptySessions}};coordinator.sourceWorkspaces={list:{subscribe:()=>()=>{},getSnapshot:()=>projects}};
const nativeRenderSlot=(name:string,props:any)=>name==='conversation.composer.bar'?<NativePendingBar {...hooks} {...props} renderSlot={()=>null}/>:renderSlot(name,props);
createRoot(document.getElementById('app')!).render(<native.__testHomeGuideNativeOriginalConversationRoot sessionId={undefined} useSession={()=>undefined} useSessions={(select:any)=>select(emptySessions)} useWorkspaces={useWorkspaces} useInput={()=>undefined} useComposerBlock={()=>undefined} useStore={(select:any)=>select(view)} actions={actions} researchSidebar={coordinator} researchWorkspaces={registry} useProjection={()=>undefined} renderSlot={nativeRenderSlot} renderSlotChain={(_name:any,_props:any,{fallback}:any)=>fallback} selectWorkspace={async(id:string)=>record.selectWorkspace(id)} t={t}/>);
createRoot(document.getElementById('right-body')!).render(<NativeRight/>);
const surfaces=new WorkspaceSurfaceHost(document)
for (const name of ['browser','image-factory','knowledge'] as const) {
 const surface=document.createElement('section')
 surface.innerHTML='<button type="button">返回工作区</button>'
 surface.firstElementChild!.addEventListener('click',()=>surfaces.back())
 surfaces.register(name,surface)
}
window.pendingFixture={openSurface:(name:'browser'|'image-factory'|'knowledge')=>surfaces.open(name),events,record,real,current,failOnce:()=>{failCreate=true},setPaneOpen(open:boolean){
 sidebarStore.reduce((s:any)=>({...s,panelOpen:open}))
 document.getElementById('right')!.hidden=!open
 document.body.dataset.odysseyGlobalRightOpen=String(open)
}};document.documentElement.dataset.ready='true'
