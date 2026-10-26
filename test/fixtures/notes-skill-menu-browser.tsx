// @ts-nocheck -- Browser-only fixture exposes the real native input/menu objects.
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import {createRoot} from 'react-dom/client'
import {NotesApp} from '../../src/preload/notes/editor'
import {installSkillComposer} from '../../src/preload/integrations/skill-composer'
import {installSkillCommand} from '../../src/preload/integrations/skill-command'
import {createSkillUseBridge} from '../../src/preload/integrations/skill-use'
import {installSkillCommandBridge} from '../../src/preload/integrations/skill-command-bridge'
import '@blocknote/mantine/style.css'
import '../../src/preload/notes/style.css'
import '../../src/preload/notes/challenge.css'

window.react=React;window.react_jsx_runtime=jsxRuntime;window.react_dom=ReactDOM
const empty=()=>null,cordis={Service:class{constructor(ctx){this.ctx=ctx}}},slots=new Proxy({SlotCore:class{}},{get:(target,key)=>target[key]||empty})
const primitives=new Proxy({Tooltip:({children})=>children,useAnchoredMaxHeight:()=>400},{get:(target,key)=>target[key]||empty})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/cordis'?cordis:id.includes('ui-slots')?slots:primitives
const runtime=window.nativeModules.runtime.factory(modules)
const load=key=>window.nativeModules[key].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?runtime:modules(id))
const native=load('conversation'),commands=load('commands'),triggers=load('triggers')
const SessionInputShell=native.SessionInputShell,InputBar=native.__InputBar,react=React,react_jsx_runtime=jsxRuntime
const effects=[],sessionId='notes-skill-owner',sessions={list:runtime.createSnapshotStore({current:sessionId}),binding:()=>({session:{getSnapshot:()=>({subagent:null,removed:false})}}),subagentAddress:()=>undefined}
const ctx={get:name=>name==='commandUi'?{candidates:async()=>[commandDefinition]}:undefined,effect:fn=>{const stop=fn();if(typeof stop==='function')effects.push(stop);return stop}}
const inputHub=new native.InputHub(ctx,key=>key),composerBlocks={storeFor:()=>({getSnapshot:()=>undefined})},researchSidebar={stores:new Map(),service:null}
const referenceSources=[],probe={reveals:0,detailRequests:[],composeReplies:[],noteRequests:[],sent:[]};window.probe=probe
let trigger,commandDefinition,leaveNotes
const ordinary=new SessionInputShell({actx:ctx,inputTriggers:()=>trigger,defaultSink:text=>probe.sent.push(text)})
ordinary.setDraft('原对话草稿及附件不能改变');ordinary.insertFilePaths(['/qa/ordinary-keep.txt']);inputHub.shells.set(sessionId,ordinary)
const conversationController=new native.ConversationController(ctx,{input:inputHub,blocks:composerBlocks})
/* NOTES_SOURCE */
const record=eworkNotesInput(sessionId,ordinary,conversationController),shell=record.shell
const popup=new commands.PopupSelectController({consume:segment=>eworkActiveInput(sessionId,ordinary).consumeToken({kind:'span',span:segment.span}),focusComposer:()=>document.querySelector('#composer textarea')?.focus()})
const commandSource={name:'command',trigger:'/',order:0,candidates:async()=>[{name:'skills',description:'选择技能'}],onPick:({span})=>{commands.CommandUiRuntime.prototype.openPopup.call({scopeFor:()=>({}),popupFor:()=>popup},'skills',commandDefinition.ui,{sessionId},{via:'menu',span})}}
trigger=new triggers.InputTriggerController({sessionId,roster:{all:()=>[commandSource,...referenceSources],sources:value=>[commandSource,...referenceSources].filter(source=>source.trigger===value)}})
const skills=[{id:'builtin:efund-ppt-maker',revision:1,invocationName:'ework-skill-180a6a3f86f8942e',invocationLabel:'efund-ppt-maker',name:'PPT制作助手'},{id:'builtin:ework-free-data-sources',revision:1,invocationName:'ework-skill-1111111111111111',invocationLabel:'ework-free-data-sources',name:'基础数据源'},{id:'builtin:ework-equity-research',revision:1,invocationName:'ework-skill-778d85796a6c426b',invocationLabel:'ework-equity-research',name:'研报写作'}]
const request=async input=>{if(input.type==='snapshot')return{type:'snapshot',snapshot:{revision:1,rows:skills.map(skill=>({...skill,kind:'skill',enabled:true,status:'已启用',description:'真实管理目录边界'}))}};if(input.type==='skill-detail'){probe.detailRequests.push(input);if(probe.holdDetail)await new Promise(resolve=>probe.releaseDetail=resolve);return{type:'skill-detail',...skills.find(skill=>skill.id===input.id),enabled:true,usable:true,content:'# Builtin fixture'}};throw Error('Unexpected integration command')}
const skillUse=createSkillUseBridge(document,{request},()=>{probe.reveals++;leaveNotes()})
const commandBridge=installSkillCommandBridge(document,{request,useSkill:skillUse.useSkill})
effects.push(()=>commandBridge.dispose(),()=>skillUse.dispose(),installSkillCommand({document,command:{register:definition=>{commandDefinition=definition;return()=>{}}},inputTriggers:{registerSource:source=>{referenceSources.push(source);return()=>referenceSources.splice(referenceSources.indexOf(source),1)}},sessions}))
const sherlockBoardsPage={installSkillComposer}
/* INSTALL_COMPOSER_EFFECT */
window.addEventListener('sherlock:skill-compose-reply',event=>probe.composeReplies.push(JSON.parse(JSON.stringify(event.detail))))
const noteBridge={request:async(method,input)=>{probe.noteRequests.push({method,input});if(method==='load')return{saved:{title:'技能选择独立笔记',blocks:[],yjs:'',revision:0}};if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1}};return{}},draft:async()=>{}}
const noteRoot=createRoot(document.querySelector('#notes'));noteRoot.render(<NotesApp sessionId={sessionId} bridge={noteBridge} dark={false} navigate={()=>{}}/>)
const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
function NativeComposer(){
 const [notes,setNotes]=React.useState(true);leaveNotes=()=>{document.body.dataset.workspaceSurface='';document.querySelector('#note-surface').hidden=true;setNotes(false)}
 const props={sessionId,eworkNotes:notes,keyboard:ordinary,inputActions:ordinary.actions,useInput:use(ordinary.state),useNotices:use(ordinary.notices),useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),useLexicon:use(trigger.lexicon),useMenuLauncher:use(trigger.launcher),useProjection:()=>undefined,draftImages:ids=>conversationController.draftImages(ids),resolveSubmitMode:()=> 'queue',t:key=>({'input.commands':'命令','input.send':'发送消息'})[key]||key,renderSlot:()=>null,stop:()=>{},toggleCommandMenu:selection=>trigger.toggleSource('command',{trigger:'/',query:'',position:'leading',span:{...selection,draftRev:ordinary.snapshot.draftRev}})}
 return <EWorkSharedInputBar {...props}/>
}
function Menus(){return <div id="native-menus"><triggers.__Menu menu={trigger.menu} onPick={(source,index)=>trigger.pick(source,index)} onHighlight={highlight=>trigger.reduce({type:'point',highlight})} onDismiss={()=>trigger.dismiss()} t={key=>({'command.skills.name':'技能','suggestions.aria':'原生命令菜单'})[key]||key}/><commands.__Popup popup={popup} t={key=>key}/></div>}
const composerRoot=createRoot(document.querySelector('#composer'));composerRoot.render(<NativeComposer/>);const menuRoot=createRoot(document.querySelector('#menus'));menuRoot.render(<Menus/>)
Object.assign(probe,{ordinary,shell,record,popup,trigger,sessionId,sessions,researchSidebar,useSkill:skillUse.useSkill,leave:()=>leaveNotes(),skillIds:skills.map(skill=>skill.id),state:()=>({notes:shell.snapshot,ordinary:ordinary.snapshot,popup:popup.state.getSnapshot(),surface:document.body.dataset.workspaceSurface,reveals:probe.reveals}),dispose(){commandBridge.dispose();skillUse.dispose();popup.dismiss();trigger.dispose();composerRoot.unmount();noteRoot.unmount();menuRoot.unmount();for(const off of effects.reverse())off();shell.dispose();ordinary.dispose()}})
