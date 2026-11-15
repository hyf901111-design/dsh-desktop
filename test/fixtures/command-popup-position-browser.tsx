// @ts-nocheck -- Test-only host data; SlotCore, SlotRenderer and all composer/popup components are native.
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import {createRoot} from 'react-dom/client'
import {SlotCore} from '@deepseek-ai/dsh-client-ui-slots'
import {createSlotRenderer} from '@deepseek-ai/dsh-client-web-react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
const empty=()=>null,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake
const runtime=window.nativeModules.runtime.factory(modules),load=key=>window.nativeModules[key].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?runtime:modules(id)),native=load('conversation'),commands=load('commands'),triggers=load('triggers')
let trigger
const shell=new native.SessionInputShell({actx:{get:()=>undefined},inputTriggers:()=>trigger,defaultSink(){throw Error('Fixture never sends')}}),use=store=>selector=>selector(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
const events=[],popup=new commands.PopupSelectController({consume:segment=>{events.push('consume');return segment?shell.consumeToken({kind:'span',span:segment.span}):true},focusComposer:()=>document.querySelector('textarea')?.focus()}),sessionId='popup-position-qa'
const t=key=>({'search.aria':'Search options','search.placeholder':'Search…','overlay.aria':'Command options','listbox.aria':'Choices','input.send':'Send','input.commands':'Commands','hero.headline':'探索更远，洞见更深','placeholder.default':'描述你想要构建的内容'})[key]||key
const optionsFor=count=>Array.from({length:count},(_,index)=>({id:'choice-'+index,label:['Read Only','Workspace Write','Full access'][index]||'Model '+index,active:index===2}))
const spec=count=>({kind:'popupSelect',options:async()=>optionsFor(count),onSelect:async option=>events.push(option.id)})
const knowledgeSpec={kind:'popupSelect',options:async()=>[
 {id:JSON.stringify({kind:'category',id:'all'}),label:'所有文件'},
 {id:JSON.stringify({kind:'shared-menu'}),label:'他人共享'},
 {id:JSON.stringify({kind:'shared-category',id:'industry'}),label:'行业研究'},
 {id:JSON.stringify({kind:'shared-category',id:'data'}),label:'数据分析'},
 {id:JSON.stringify({kind:'folder',id:'f'}),label:'研究资料'}
],onSelect:async option=>events.push(JSON.parse(option.id).id)}
const source={name:'command',trigger:'/',order:0,candidates:async()=>[{name:'permission',description:'Permission options'},{name:'model',description:'Model options'},{name:'plan',description:'Plan options'},{name:'knowledge',description:'Knowledge Base options'}],onPick:({span,candidate,flyout})=>{
 commands.CommandUiRuntime.prototype.openPopup.call({scopeFor:()=>({}),popupFor:()=>popup},candidate?.name||'permission',candidate?.name==='knowledge'?knowledgeSpec:spec(3),{sessionId},{via:'menu',span,flyout})
 return 'handled'
}}
trigger=new triggers.InputTriggerController({sessionId,roster:{all:()=>[source],sources:()=>[source]}})
let setPage,setExtra,requestReflow
function Composer({renderSlot,renderSlotChain}){
 const[page,changePage]=React.useState(window.positionOptions.mode),[extra,changeExtra]=React.useState(false),[reflow,force]=React.useReducer(value=>value+1,0);setPage=changePage;setExtra=changeExtra;requestReflow=force
 const inputBar=renderSlot('conversation.composer.bar',{sessionId,keyboard:shell,inputActions:shell.actions,useInput:use(shell.state),useNotices:use(shell.notices),useSession:selector=>selector({running:false,promptError:null,subagent:null,removed:false}),useLexicon:use(trigger.lexicon),useMenuLauncher:use(trigger.launcher),useProjection:()=>undefined,draftImages:()=>[],resolveSubmitMode:()=> 'queue',toggleCommandMenu:selection=>trigger.toggleSource('command',{trigger:'/',query:'',position:'leading',span:{...selection,draftRev:shell.snapshot.draftRev}}),t,overlay:renderSlot('conversation.input.overlay',{}),accessory:extra?<div style={{height:140}}>本地附件预览</div>:undefined})
 return <main className="pI_x6G_centerCol" data-qa-right-composer={page==='right'||undefined}><div className="wSkVaW_root" data-odyssey-page={page==='right'?'conversation':page} data-fixture-render={reflow}><div className="detail-background"/><div data-center-composer-host><native.ComposerSurface zone={{sessionId}} hero={page==='home'} inputBar={inputBar} t={t} renderSlot={renderSlot} renderSlotChain={renderSlotChain}/></div></div></main>
}
const core=new SlotCore(),stops=[]
stops.push(core.register({name:'root',children:{'conversation.input.overlay':{kind:'list',scope:'session'},'conversation.input.dock':{kind:'list',scope:'session'},'conversation.composer.bar':{kind:'single',scope:'session-maybe'},'conversation.composer':{kind:'chain',scope:'session'}}},Composer))
stops.push(core.register({name:'conversation.composer.bar',children:{'conversation.input.plan':{kind:'single',scope:'session'},'conversation.input.model':{kind:'single',scope:'session'}}},native.__InputBar))
stops.push(core.register({name:'conversation.input.overlay',id:'slash-menu',order:0,inject:()=>({menu:trigger.menu,onPick:(source,index,flyout)=>trigger.pick(source,index,flyout),onHighlight:highlight=>trigger.reduce({type:'point',highlight}),onDismiss:()=>trigger.dismiss(),t})},triggers.__Menu))
stops.push(core.register({name:'conversation.input.overlay',id:'command-popup',order:1,inject:()=>({popup,t})},commands.__Popup))
const info={sessionId,hooks:{},props:{}},current=runtime.createSnapshotStore(info),sessionList=runtime.createSnapshotStore({current:sessionId}),workspaceList=runtime.createSnapshotStore({}),host={subscribe:(key,fn)=>core.subscribe(key,fn),getVersion:key=>core.getVersion(key),entriesOf:key=>core.entries(key),entriesOfSlot:key=>core.entriesOfSlot(key),specOf:key=>core.specDynamic(key),isLive:entry=>core.isLive(entry),reportEntryError:(...args)=>core.reportEntryError(...args),storeOf:()=>undefined,sessions:{list:sessionList,provideInfo:current,provideInfoFor:id=>id===sessionId?info:undefined},workspaces:{list:workspaceList}}
const root=createRoot(document.querySelector('#root'));root.render(createSlotRenderer().renderRoot(host,{}))
window.probe={core,popup,shell,events,open(command='permission',count=3){popup.open(command,spec(count),{sessionId})},reflow(){requestReflow()},extra(value){setExtra(value)},page(value){setPage(value)},dispose(){popup.dispose();trigger.dispose();root.unmount();shell.dispose();stops.reverse().forEach(off=>off())}}
