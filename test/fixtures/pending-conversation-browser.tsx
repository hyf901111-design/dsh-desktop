import React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import {createPendingConversation} from '../../scripts/lib/pending-conversation.mjs'
import {mountDesktopShellStyles} from '../../src/preload/shell-style'
declare global{interface Window{pendingInput:any;pendingFixture:any;__ModuleLoader__:any}}
const data=window.pendingInput,fake:any=new Proxy(function(){},{get:(_target,key)=>key===Symbol.toPrimitive?()=> 'unused':fake,apply:()=>fake,construct:()=>({})});let runtime:any
function load(source:string){let result:any;window.__ModuleLoader__={load:({factory}:any)=>{result=factory((name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom'?{createPortal}:name==='@deepseek-ai/dsh-client-runtime/client'?runtime:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/cordis'?new Proxy({Context:{filter:Symbol('filter')}},{get:(target,key)=>Reflect.get(target,key)??fake}):fake)}};new Function(source)();return result}
runtime=load(data.runtime);const native=load(data.conversation),workspace=load(data.workspace)
let failCreate=false;const events:any[]=[],projects={phase:'ready',items:[{workspaceId:'A',title:'研究项目 A',path:'/tmp/a',sessionIds:[]},{workspaceId:'B',title:'研究项目 B',path:'/tmp/b',sessionIds:[]}],recentWorkspaceId:undefined,archivedSessionIds:[]},current={current:undefined as string|undefined}
const real=new native.__testSessionInputShell({actx:{},inputTriggers:()=>undefined,defaultSink:(text:string,images:string[])=>events.push({type:'send',text,images})})
const record=createPendingConversation({makeShell:(deps:any)=>new native.__testSessionInputShell({...deps,actx:{},inputTriggers:()=>undefined}),sessions:{list:{getSnapshot:()=>current},create:async(value:any)=>{events.push({type:'create',...value});if(failCreate){failCreate=false;throw Error('测试创建失败，输入保留')}return 'new-session'},open:(id:string)=>{current.current=id;events.push({type:'open',id})}},workspaces:{list:{getSnapshot:()=>projects,subscribe:()=>()=>{}}},getInput:()=>real,onCreated:()=>{},prepareContext:async()=>undefined})
native.__testSetPending(record)
const NativePendingBar=new Function('eworkPendingConversation','react','react_jsx_runtime','InputBar','EWorkSharedInputBar','conversationController','EWorkBrowserReference','return ('+data.wrapper+')')(record,React,jsx,native.__testInputBar,native.__testInputBar,{draftImages:()=>[],createDraftImages:()=>[],releaseDraftImage:()=>{},releaseDraftImages:()=>{}},native.__testEWorkBrowserReference)
const lexicon=new Map(),state={running:false,removed:false,subagent:null,pending:[],permissions:{}};const t=(key:string)=>({'input.send':'发送消息','placeholder.workspace':'选择项目','workspace.select':'选择工作区','workspace.choose':'选择工作区','workspace.pick':'选择工作区'}[key]||key)
const hooks={sessionId:undefined,useSession:(select:any)=>select(state),useInput:(select:any)=>select(undefined),inputActions:undefined,keyboard:undefined,useNotices:(select:any)=>select(null),useLexicon:(select:any)=>select(lexicon),useMenuLauncher:(select:any)=>select(undefined),useProjection:(_key:string,select:any)=>typeof select==='function'?select(undefined):undefined,t,resolveSubmitMode:()=> 'queue'}
const useWorkspaces=(select:any)=>select(projects)
const renderSlot=(name:string,props:any)=>name==='conversation.composer.bar'?<NativePendingBar {...hooks} {...props} renderSlot={()=>null}/>:name==='conversation.hero.workspace'?<workspace.__testWorkspacePicker {...props} useWorkspaces={useWorkspaces} useDirectoryFlow={(select:any)=>select({status:'idle'})} createWorkspace={async()=>{throw Error('not used')}} renderSlot={()=>null} t={t}/>:null
mountDesktopShellStyles(document)
createRoot(document.getElementById('app')!).render(<native.__testEWorkPendingConversation sessionId={undefined} useWorkspaces={useWorkspaces} renderSlot={renderSlot} t={t}/>)
window.pendingFixture={events,record,real,current,failOnce:()=>{failCreate=true}};document.documentElement.dataset.ready='true'
