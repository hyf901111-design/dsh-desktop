// @ts-nocheck -- Native bundle exports are exposed only by this browser fixture.
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as cordis from '@deepseek-ai/cordis'
import {mountHomeGuides,playHomeGuideFromOperations} from '../../src/preload/home-guides'
import {mountHomeOperations} from '../../src/preload/home-operations'
import {mountNotes} from '../../src/preload/notes/mount'
import {NotesApp} from '../../src/preload/notes/editor'
import {WorkspaceSurfaceHost} from '../../src/preload/workspace-surface-host'

const input=window.entryInput,probe=window.entryProbe={frames:[],requests:[],actions:[],loads:[],started:false,sourceChanges:[],sent:0,stops:[]}
const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),empty=()=>null
const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty}:fake
function load(source,require){let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};new Function(source)();return descriptor.factory(require)}
const rt=load(input.runtime,modules),native=load(input.conversation,id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id))
const cleanups=[],ctx=new cordis.Context()
const events=new rt.ConversationEventRegistry(ctx),viewRegistry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:viewRegistry})
const api={sessions:{create:async payload=>({result:{ok:true,value:{sessionId:payload.sessionId}}}),history:async()=>({result:{ok:true,value:{events:[],hasMore:false,lastSeq:0}}}),subscribe:async()=>({result:{ok:true,value:{}}}),unsubscribe:async()=>({result:{ok:true,value:{}}})},subagents:{list:async()=>({result:{ok:true,value:{entries:[],parentAvailable:true}}})}}
const sessions=new rt.SessionRuntime(ctx,api,{},{events,views:viewRegistry}),chatStore=native.__createChatStore(),scopes=new Map(),shells=new Map()
const storeFor=id=>{if(!scopes.has(id))scopes.set(id,chatStore.create(id));return scopes.get(id)}
const shellFor=id=>{if(!shells.has(id)){const shell=new native.SessionInputShell({actx:{},defaultSink:async()=>probe.sent++});if(id==='source')shell.setDraft('原会话草稿和技能不得改变😀');shells.set(id,shell)}return shells.get(id)}
const install=async id=>{await sessions.create({sessionId:id,cwd:'/qa/'+id});const session=sessions.manager.get(id);session.openState='open';session.installWindow([],false);storeFor(id);shellFor(id);return id}
const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'notes',label:'笔记'},{id:'research',label:'研究'}]},registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true})
const sidebarState={composerHost:null,conversationHost:null},sidebar={storeFor:()=>({subscribe:()=>()=>{},getSnapshot:()=>sidebarState}),publish(){},enter(){},leave(){}}
const t=key=>({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.placeholder':'描述你的任务…','placeholder.hero':'描述你的任务…'})[key]??key
function Scope({id}){
 const session=sessions.manager.get(id),view=storeFor(id),shell=shellFor(id),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useInput=use(shell.state),useStore=use(view),useSessions=use(sessions.list)
 const actions={...view.actions,setView:value=>{probe.actions.push({type:'mode',id,view:value,time:performance.now()});view.actions.setView(value)}}
 const shared={sessionId:id,useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:()=>undefined,sessionId:id,t}
 const renderSlot=(name,props={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.view'?<article data-native-chat-body/>:null
 return <native.ConversationRoot {...shared} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'qa',title:'原工作区',sessionIds:['source']}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/>
}
function App(){const state=React.useSyncExternalStore(sessions.list.subscribe,sessions.list.getSnapshot);return state.current?<Scope id={state.current}/>:null}
const bridge={request:async(method,value)=>{if(method==='load'){probe.loads.push({id:value.sessionId,time:performance.now()});await new Promise(resolve=>setTimeout(resolve,120))}return window.entryNotesStorage(method,value)},draft:value=>window.entryNotesStorage('draft',value)}
const workspace=new WorkspaceSurfaceHost(document),notes=mountNotes(document,bridge,workspace)
const guide=mountHomeGuides(document,{
 beforeOpen:session=>notes.prepareGuide(session.sessionId),revealConversation:()=>workspace.revealConversation(),
 // Actor steps are outside this entry-only test. Readiness is the real editor,
 // not a stubbed ready callback; no model/send is allowed.
 async mountNotes(_document,host,options){const root=createRoot(host);let api;root.render(<NotesApp sessionId={options.sessionId} bridge={bridge} dark={false} navigate={()=>{}} guide={{ready:value=>api=value}}/>);const deadline=performance.now()+5000;while(!api||!host.querySelector('.bn-editor')){if(performance.now()>deadline)throw Error('真实NotesApp尚未加载');await new Promise(resolve=>setTimeout(resolve,16))}probe.noteReady=performance.now();return{runStep:async()=>{await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}))},flush:()=>api.flush(),dispose:()=>root.unmount()}},
 mountPresentation:async()=>({runStep:async()=>{},dispose(){}})
})
const operations=mountHomeOperations(document,{onExample:(kind,context)=>playHomeGuideFromOperations(guide,kind,context)})
const receive=async event=>{const d=event.detail;probe.requests.push({command:d.command,kind:d.kind,time:performance.now(),sourceMode:storeFor('source').getSnapshot().view});let sessionId='example-'+d.kind
 if(d.command==='prepare'){probe.preparing=true;if(input.holdPrepare)await new Promise(resolve=>probe.releasePrepare=resolve);else await new Promise(resolve=>setTimeout(resolve,input.prepareDelay??650));if(input.failPrepare){window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:d.requestId,ok:false,message:'真实准备失败'}}));return}await install(sessionId);probe.prepared=performance.now()}
 else{sessions.open(d.sessionId);probe.opened=performance.now()}
 window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:d.requestId,ok:true,sessionId,cwd:'/qa/'+sessionId,title:'演示案例',fresh:true}}))}
window.addEventListener('sherlock:home-guide-session-request',receive)
// The Board actor is intentionally not acknowledged as ready. This fixture
// checks the real source→target session/mode handoff, not generated cards.
let frame=0,disposed=false
const sample=()=>{if(probe.started){const header=document.querySelector('[data-srb-session-header][data-ework-notes-session]'),root=document.querySelector('[data-home-guide]'),pointer=document.querySelector('[data-home-guide-pointer]');probe.frames.push({time:performance.now(),id:header?.dataset.eworkNotesSession,mode:header?.querySelector('[aria-selected=true]')?.dataset.conversationViewId,guide:!!root,guideKind:root?.dataset.kind,guideEditor:!!root?.querySelector('.bn-editor'),ordinaryEditor:!!document.querySelector('[data-workspace-surface=notes]:not([hidden]) .bn-editor'),pointer:pointer?.dataset.homeGuidePointer,phase:pointer?.dataset.state,transition:document.documentElement.dataset.homeGuideTransitionSession})}if(!disposed)frame=requestAnimationFrame(sample)};frame=requestAnimationFrame(sample)
document.addEventListener('click',event=>{const target=event.target.closest('button');if(target?.matches('[data-odyssey-operations-open-example]')){probe.started=true;probe.startedAt=performance.now()}if(probe.started&&target?.matches('[data-srb-tabs] button'))probe.actions.push({type:'tab-click',view:target.dataset.conversationViewId,time:performance.now()})},true)
Object.assign(probe,{sessions,storeFor,shellFor,guide,async dispose(){disposed=true;cancelAnimationFrame(frame);operations();await guide.dispose();notes.dispose();workspace.dispose();root.unmount();for(const shell of shells.values())shell.dispose();cleanups.reverse().forEach(fn=>fn())}})
const root=createRoot(document.querySelector('#native-root'));void(async()=>{await install('source');sessions.open('source');root.render(<App/>);document.documentElement.dataset.fixtureReady='true'})()
