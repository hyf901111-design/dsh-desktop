// @ts-nocheck -- Real native controllers, input facade and menu; only remote catalog is isolated.
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
const empty=()=>null,primitives=new Proxy({Tooltip:({children})=>children,useAnchoredMaxHeight:()=>400},{get:(target,key)=>target[key]||empty})
const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:primitives
const rt=window.nativeModules.runtime.factory(modules),load=key=>window.nativeModules[key].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),native=load('conversation'),commands=load('commands'),triggers=load('triggers')
const react=React,react_jsx_runtime=jsx,SessionInputShell=native.SessionInputShell,InputBar=native.__InputBar,effects=[],handlers=new Map(),sources=[],sessionId='native-'+window.fixtureMode
const session={getSnapshot:()=>({queue:[]}),subscribe:()=>()=>{}},sessions={scopeOf:()=>sessionId,subagentAddress:()=>undefined,list:rt.createSnapshotStore({current:sessionId}),binding:()=>({session})}
let trigger,commandUi,conversationController
const service={registerSource(source){sources.push(source);return()=>{}},sessionOf:()=>trigger},probe=window.probe={events:[],inputTypes:[],submits:[]}
const ctx={get:name=>({sessions,inputTriggers:service,commandUi,conversation:conversationController}[name]),on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name)},bail(_ctx,name,value){probe.events.push({name,span:value.span});return handlers.get(name)?.(value)},effect(fn){const off=fn();if(typeof off==='function')effects.push(off);return off},remote:{commands:{list:async()=>({ok:true,value:[{name:'goal',description:'研究目标',input:{hint:'写下目标'}},{name:'feedback',description:'反馈',input:{hint:'写下反馈'}}]}),execute:async()=>{throw Error('No command may be submitted by this fixture')}},$on(){}}}
commandUi=new commands.CommandUiRuntime(ctx)
trigger=new triggers.InputTriggerController({sessionId,actx:ctx,roster:{all:()=>sources,sources:value=>sources.filter(source=>source.trigger===value)}})
const inputHub=new native.InputHub(ctx,key=>key),ordinary=inputHub.shellFor({sessionId,session,ctx})
conversationController=new native.ConversationController(ctx,{input:inputHub,blocks:{storeFor:()=>rt.createSnapshotStore(undefined)}})
/* NOTES_SOURCE */
const record=eworkNotesInput(sessionId,ordinary,conversationController);native.__setNoteRecord(sessionId,record);record.ready=true
const notes=window.fixtureMode==='notes',shell=notes?record.shell:ordinary,other=notes?ordinary:record.shell
other.setDraft('其它输入原稿📌不能改变');other.insertFilePaths(['/qa/keep-original.txt'])
const status=rt.createSnapshotStore({running:false,promptError:null,subagent:null,removed:false});
const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=use(status)
const t=key=>({'input.commands':'命令','input.send':'发送','suggestions.aria':'命令建议','command.goal.name':'goal','command.feedback.name':'feedback','command':'命令'})[key]||key
const voiceListeners=new Set();let releaseStart;
probe.requests=[];probe.cancels=[];probe.stops=0;probe.delay=false;
window.dshDesktop={researchVoice:{startComposer:async request=>{probe.requests.push(request);if(probe.delay)await new Promise(resolve=>releaseStart=resolve);return {ok:true}},cancel:async request=>{probe.cancels.push(request);return {ok:true}},subscribe:listener=>{voiceListeners.add(listener);return()=>voiceListeners.delete(listener)}}};
ordinary.deps.defaultSink=async(draft,imageIds,mode)=>{probe.submits.push({draft,imageIds,mode})};
document.addEventListener('sherlock:notes-submit',event=>{probe.submits.push({draft:event.detail.prompt,imageIds:event.detail.admission.imageIds});document.dispatchEvent(new CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId,submissionId:event.detail.submissionId}}))});
function Composer(){return <EWorkSharedInputBar sessionId={sessionId} variant={window.fixtureMode==='home'?'hero':'composer'} eworkNotes={notes} keyboard={ordinary} inputActions={ordinary.actions} useInput={use(ordinary.state)} useNotices={use(ordinary.notices)} useSession={useSession} useLexicon={use(trigger.lexicon)} useMenuLauncher={use(trigger.launcher)} useProjection={()=>undefined} resolveSubmitMode={()=> 'queue'} draftImages={ids=>ids.map(id=>({id,file:new File(['image'],'image.png',{type:'image/png'}),previewUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',name:'image.png',mediaType:'image/png'}))} stop={()=>{probe.stops++;status.set({...status.getSnapshot(),running:false})}} renderSlot={()=>null} t={t} toggleCommandMenu={selection=>trigger.toggleSource('command',{trigger:'/',query:'',position:'leading',span:{...selection,draftRev:ordinary.snapshot.draftRev}})}/>}
function Menus(){return <triggers.__Menu menu={trigger.menu} onPick={(source,index)=>trigger.pick(source,index)} onHighlight={highlight=>trigger.reduce({type:'point',highlight})} onDismiss={()=>trigger.dismiss()} t={t}/>}
const root=createRoot(document.querySelector('#composer')),menuRoot=createRoot(document.querySelector('#menus'));root.render(<Composer/>);menuRoot.render(<Menus/>);
Object.assign(probe,{shell,other,trigger,record,ordinary,emit(event,index=-1){const request=probe.requests.at(index);for(const listener of [...voiceListeners])listener({...request,...event})},release(){probe.delay=false;releaseStart?.()},setRunning(value){status.set({...status.getSnapshot(),running:value})},attach(){shell.addImages(['image'])},seedReferences(){shell.setDraft('/尾文📌');shell.insertReference({source:'ework-managed-skill',ref:JSON.stringify({id:'builtin:keep',revision:1,label:'keep',invocationName:'ework-skill-1111111111111111'}),label:'keep',clipboardText:'keep'},{start:1,end:1,draftRev:shell.snapshot.draftRev});shell.insertFilePaths(['/qa/preserve.pdf'])},state:()=>({input:shell.snapshot,other:other.snapshot,menu:trigger.menu.getSnapshot()}),dispose(){root.unmount();menuRoot.unmount();trigger.dispose();for(const off of effects.reverse())off();ordinary.dispose();record.shell.dispose()}})
