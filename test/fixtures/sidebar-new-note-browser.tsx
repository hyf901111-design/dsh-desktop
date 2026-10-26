import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import * as primitiveIcons from '@deepseek-ai/dsh-client-ui-primitives'
import {ScheduledTaskView} from '../../src/preload/scheduled/view'
import {createSidebarNewNoteAction} from '../../src/preload/sidebar-new-note'
import {mountUiLocalization} from '../../src/preload/ui-localization'
import {mountNotes} from '../../src/preload/notes/mount'
import {BlockNoteEditor} from '@blocknote/core'
import {blocksToYDoc} from '@blocknote/core/yjs'
import * as Y from 'yjs'
declare global{interface Window{newNoteInput:any;newNoteFixture:any;__ModuleLoader__:any;noteEditors:any}}
const input=window.newNoteInput,events:any[]=[],saved:any={},drafts:any={};window.noteEditors={}
{
 const blocks=[{id:'old-paragraph',type:'paragraph' as const,content:'保留旧笔记正文😀'}],editor=BlockNoteEditor.create(),doc=blocksToYDoc(editor,blocks,'note')
 saved.old={title:'原有笔记',blocks,yjs:btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),revision:0,updatedAt:Date.now()}
 doc.destroy();editor._tiptapEditor.destroy()
}
const fake:any=new Proxy(function(){},{get:(_target,key)=>key===Symbol.toPrimitive?()=> 'unused':fake,apply:()=>fake,construct:()=>({})})
const names=['Fragment','jsx','jsxs','cloneElement','createPortal','useCallback','useEffect','useLayoutEffect','useRef','useState']
const values=[jsx.Fragment,jsx.jsx,jsx.jsxs,React.cloneElement,createPortal,React.useCallback,React.useEffect,React.useLayoutEffect,React.useRef,React.useState]
const Tooltip=new Function(...names,'Tooltip_module_css_default',input.tooltip+';return Tooltip')(...values,{bubble:input.tooltipClass})
let runtime:any
const primitives=new Proxy({...primitiveIcons,Tooltip},{get:(target,key)=>Reflect.get(target,key)??fake})
function load(source:string){let exports:any;window.__ModuleLoader__={load:({factory}:any)=>{exports=factory((name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom'?{createPortal}:name==='@deepseek-ai/dsh-client-runtime/client'?runtime:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/cordis'?new Proxy({Context:{filter:Symbol('filter')}},{get:(target,key)=>Reflect.get(target,key)??fake}):fake)}};new Function(source)();return exports}
runtime=load(input.runtime);const conversation=load(input.conversation),sidebar=load(input.sidebar),workspaceUi=load(input.workspace)
const context:any={get:()=>undefined,reflect:{provide:()=>{}},effect:()=>{}};context.plugin=()=>({ctx:{extend:()=>context},dispose:()=>{}})
let seq=0,holdCreate=false,pendingCreate:(()=>void)|null=null,failCreate=false
const api={sessions:{create:async(payload:any)=>{events.push({type:'create',payload});if(holdCreate)await new Promise<void>(resolve=>{pendingCreate=resolve});if(failCreate)throw Error('Host 未能创建新会话');return{result:{ok:true,value:{sessionId:payload.sessionId??'new-note-'+(++seq)}}}},history:async()=>({result:{ok:true,value:{entries:[],hasMore:false}}})},subagents:{list:async()=>({result:{ok:true,value:{entries:[],parentAvailable:true}}})},workspace:{list:async()=>({result:{ok:true,value:{items:[{workspaceId:'active',path:'/active',sessionIds:['old']},{workspaceId:'recent',path:'/recent',sessionIds:[]}],archivedSessionIds:[]}}})}}
const sessions=new runtime.SessionRuntime(context,api,{}),workspaces=new runtime.WorkspaceRuntime(context,api,sessions),chatStore=conversation.__testcreateChatStore(),workspaceStore=workspaceUi.__testcreateWorkspaceViewStore().create('new-note-fixture')
const shells=new Map<string,any>(),shellFor=(id:string)=>{if(!shells.has(id))shells.set(id,new conversation.SessionInputShell({actx:{},inputTriggers:()=>({track(){}}),defaultSink:async()=>{throw Error('must not send')}}));return shells.get(id)}
const use=(store:any)=>(select:any)=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
let collapsed=false,locale='zh',activeNotes=false
const t=(module:any)=>(key:string)=>(locale==='en'?module.__testen:module.__testzh)[key]??key
const host={register:(_kind:string,surface:HTMLElement)=>{Object.assign(surface.style,{position:'fixed',left:'280px',top:'0',right:'0',bottom:'0'});document.body.append(surface)},open:()=>{activeNotes=true;document.body.dataset.workspaceSurface='notes'},close:()=>{activeNotes=false;delete document.body.dataset.workspaceSurface},current:()=>activeNotes?{surface:'notes' as const}:undefined}
const notes=mountNotes(document,{request:async(method:string,value:any)=>{events.push({type:'notes',method,sessionId:value?.sessionId});if(method==='load')return{saved:saved[value.sessionId]??{title:value.sessionId==='old'?'原有笔记':'',blocks:value.sessionId==='old'?[{id:'old-paragraph',type:'paragraph',content:'保留旧笔记正文😀'}]:[],yjs:null,revision:0},draft:null};if(method==='save'){saved[value.sessionId]={...value.content,revision:(saved[value.sessionId]?.revision??0)+1};return{status:'saved',saved:saved[value.sessionId]}}if(method==='draftPut')drafts[value.sessionId]=value.snapshot;if(method==='draftClear')delete drafts[value.sessionId];return{}} ,draft:async(value:any)=>{drafts[value.sessionId]=value.content}} as any,host as any)
const action=createSidebarNewNoteAction(document,async()=>{events.push({type:'flush-start'});await notes.flushCurrent();events.push({type:'flush-end'})})
const stop=new Function('return ('+input.install+')')()({sessions,workspaces,chatStore,getInput:shellFor})
const scheduled=new ScheduledTaskView(document,{list:async()=>[],workspaces:async()=>[],save:async()=>{throw Error('unused')},action:async()=>{throw Error('unused')}},host as any,undefined,{newNote:action.create})
function App(){const state=React.useSyncExternalStore(sessions.list.subscribe,sessions.list.getSnapshot),id=state.current,view=id?chatStore.create(id).getSnapshot().view:null
 React.useLayoutEffect(()=>{if(view!=='notes')host.close()},[id,view])
 return <><aside style={{width:collapsed?80:260,height:'100vh'}}><sidebar.__testSidebarRoot collapsed={collapsed} width={260} t={t(sidebar)} toggleSidebar={()=>{collapsed=!collapsed;render()}} startSession={()=>events.push({type:'original-chat'})} startResearchSession={()=>events.push({type:'original-research'})} renderSlot={(name:string)=>name==='sidebar.workspaces'?<workspaceUi.__testWorkspaceBrowser wide={!collapsed} expandSidebar={()=>{collapsed=false;render()}} useSessions={use(sessions.list)} useWorkspaces={use(workspaces.list)} useStore={use(workspaceStore)} actions={workspaceStore.actions} startSession={()=>{}} open={()=>{}} openWorkspacePath={()=>{}} renameSession={()=>{}} forkSession={()=>{}} renameWorkspace={()=>{}} deleteWorkspace={()=>{}} insertWorkspaceBefore={()=>{}} archiveSession={()=>{}} insertSessionBefore={()=>{}} createWorkspace={()=>{}} searchSessions={()=>{}} useDirectoryFlow={(select:any)=>select(true)} renderSlot={()=>null} t={t(workspaceUi)}/>:null}/></aside><main className="pI_x6G_centerCol"><div data-ework-notes-session={id}>{view==='notes'?<span data-ework-note-view={id}/>:<textarea aria-label="原有对话输入" defaultValue={id?shellFor(id).snapshot.draft:''}/>}</div></main></>}
const root=createRoot(document.getElementById('app')!),render=()=>root.render(<App/>);sessions.list.subscribe(render)
window.newNoteFixture={events,saved,drafts,sessions,workspaces,chatStore,shellFor,notes,scheduled,setCollapsed:(value:boolean)=>{collapsed=value;render()},setLocale:(value:string)=>{locale=value;document.documentElement.dataset.odysseyLocale=value;render()},setDark:(value:boolean)=>{document.body.toggleAttribute('data-ds-dark-theme',value)},hold:()=>{holdCreate=true},release:()=>{holdCreate=false;pendingCreate?.()},fail:()=>{failCreate=true},switch:(view:string)=>{chatStore.create('old').actions.setView(view);render()},current:()=>({id:sessions.list.getSnapshot().current,view:chatStore.create(sessions.list.getSnapshot().current).getSnapshot().view}),dispose:()=>{action.dispose();stop();notes.dispose();root.unmount()}}
void(async()=>{await sessions.create({sessionId:'old',cwd:'/active'});sessions.open('old');await workspaces.refresh();workspaces.list.update((state:any)=>{state.recentWorkspaceId='recent'});shellFor('old').setDraft('原有对话草稿😀');chatStore.create('old').actions.setView('notes');render();scheduled.mount();mountUiLocalization(document);document.documentElement.dataset.fixtureReady='true'})()
