import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import {MarkdownText} from '@deepseek-ai/dsh-client-ui-primitives'
import {ImageGallery,AttachmentRail} from '@deepseek-ai/dsh-client-ui-attachment'
import {mountHomePresentationGuide} from '../../src/preload/home-guide-presentation'
import {installSkillCommand} from '../../src/preload/integrations/skill-command'
import {encodeSkillReference,SKILL_REFERENCE_SOURCE} from '../../src/shared/skill-reference'

const win=window as any
let fake:any
fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
const empty=()=>null
const primitives=new Proxy({MarkdownText,Markdown:({text}:any)=><MarkdownText text={text}/>,Tooltip:({children}:any)=>children,useAnchoredMaxHeight:()=>400,writeClipboard:async(text:string)=>{win.probe.copied.push(text);return true}},{get:(target,key)=>Reflect.get(target,key)??empty})
const modules=(id:string):any=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(public ctx:any){}}}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail,ImageGallery}:fake
const rt=win.runtimeDescriptor.factory(modules)
const native=win.conversationDescriptor.factory((id:string)=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id))
const triggers=win.triggersDescriptor.factory((id:string)=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id))
const store=(initial:any)=>{let value=initial;const listeners=new Set<()=>void>();return{getSnapshot:()=>value,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},update:(patch:any)=>{value={...value,...patch};for(const fn of listeners)fn()}}}
const list=store({current:'demo',byId:{demo:{id:'demo',cwd:win.cwd,displayTitle:'新会话',blank:true},ordinary:{id:'ordinary',cwd:win.cwd,displayTitle:'普通对话',blank:true}}})
const observed:any[]=[]
let rpcSequence=0
const connection=win.connectionDescriptor.factory(modules)
class PrivateApiClient extends connection.AbstractApiClient{
 mintRpcId(){return 'user-first-'+(++rpcSequence)}
 async doFetch(_url:any,init:any){const request=JSON.parse(init.body),reply=await win.userMessageBackend({action:request.method==='session.cancel'?'cancel':'send',request});return new Response(JSON.stringify({type:'server-response',...reply}),{status:200,headers:{'content-type':'application/json'}})}
}
const api=new PrivateApiClient()
api.subscribeEnvelopes((batch:any[])=>observed.push(...batch))
const cleanups:Array<()=>void>=[]
const ctx:any={get:(name:string)=>name==='conversation'?conversation:name==='connection'?{api}:name==='sessions'?sessions:undefined,reflect:{provide(){}},effect:(start:()=>unknown)=>{const stop=start();if(typeof stop==='function')cleanups.push(stop as ()=>void);return()=>{}}}
const events=new rt.ConversationEventRegistry(ctx),viewsRegistry=new rt.ConversationViewRegistry(ctx)
native.__register({...ctx,conversationEvents:events,conversationViews:viewsRegistry})
const runtime=new rt.SessionRuntime(ctx,api,{},{events,views:viewsRegistry})
const sessionsById=new Map<string,any>()
for(const id of ['demo','ordinary']){const value=runtime.manager.get(id);value.openState='open';value.installWindow([],false);sessionsById.set(id,value)}
const registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true})
const inputHub=new native.InputHub(ctx,(key:string)=>t(key),registry)
const referenceSources:any[]=[{name:'chat-file',codec:native.chatFileReferenceCodec}]
const inputTriggers={track(){},arbitrate:()=> 'pass',onSpace:()=>false,adjudicate:async()=>undefined,serializeReference:async(source:string,ref:string,signal:AbortSignal)=>triggers.InputTriggerController.prototype.serializeReference.call({deps:{roster:{all:()=>referenceSources}}},source,ref,signal)}
for(const [id,session] of sessionsById){const shell=new native.SessionInputShell({actx:{},inputTriggers:()=>inputTriggers,defaultSink:(text:string,imageIds:string[],mode:string,admission:any)=>inputHub.sink(session,text,imageIds,mode,admission)});inputHub.shells.set(id,shell)}
const conversation=new native.ConversationController(ctx,{input:inputHub,blocks:{}})
const sessions={list,binding:(id:string)=>({session:sessionsById.get(id)}),subagentAddress:()=>undefined}
cleanups.push(native.__watchSubmitted?.({api,sessions,inputHub})??(()=>{}))
let annotationRuntime:any,annotationHandle:any
if(win.annotationEnabled){
 win.sherlockPptAnnotations=Object.fromEntries(['open','mutate','prepare','bindSubmission','complete','lookupOutput','messagePresentation','resolveReference','cancel'].map(method=>[method,(input:any)=>win.annotationBackend(method,input)]))
 annotationRuntime=native.__startAnnotation({sessions,inputHub,api});cleanups.push(()=>annotationRuntime.dispose())
}
const sidebarState={composerHost:null,conversationHost:null},sidebar={storeFor:()=>({getSnapshot:()=>sidebarState,subscribe:()=>()=>{}}),publish(){},enter(){},leave(){},service:{openFile:async()=>{}}}
native.__bind({sessions,inputHub,researchSidebar:sidebar,getHomeGuideSession:(id:string)=>id==='demo'&&win.registered!==false?{kind:win.actorKind,sessionId:id,cwd:win.cwd}:undefined})
const skill=win.actorKind==='report'?{id:'builtin:ework-equity-research',revision:1,label:'ework-equity-research',name:'研报写作',invocationName:'ework-skill-778d85796a6c426b'}:{id:'builtin:efund-ppt-maker',revision:1,label:'efund-ppt-maker',name:'PPT制作助手',invocationName:'ework-skill-180a6a3f86f8942e'}
const skillRequest=(event:Event)=>{
 const detail=(event as CustomEvent).detail
 if(detail.action==='cancel')return
 const result=detail.action==='labels'?{owner:'fixture-owner',skills:[skill],tools:[]}:detail.action==='resolve'?{invocationName:skill.invocationName}:[]
 window.dispatchEvent(new CustomEvent('sherlock:skill-menu-reply',{detail:{requestId:detail.requestId,ok:true,result}}))
}
window.addEventListener('sherlock:skill-menu-request',skillRequest)
cleanups.push(()=>window.removeEventListener('sherlock:skill-menu-request',skillRequest))
cleanups.push(installSkillCommand({document,command:{register:()=>()=>{}},inputTriggers:{registerSource:(source:any)=>{referenceSources.push(source);return()=>referenceSources.splice(referenceSources.indexOf(source),1)}},sessions:{subagentAddress:()=>undefined}}))
const dictionaries:Record<string,string>={'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.commands':'命令','input.placeholder':'描述你的任务…','execution.status.analyzing':'正在思考','execution.status.context':'正在思考','execution.status.working':'处理中','chat.loadingHistory':'正在加载历史'}
function t(key:string){return dictionaries[key]??key}
const viewStores=new Map(['demo','ordinary'].map(id=>[id,store({view:'chat',draft:'',selection:null})]))
const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'notes',label:'笔记'},{id:'research',label:'研究'}]}
const root=createRoot(document.querySelector('#native-root')!)
function App(){
 const current=React.useSyncExternalStore(list.subscribe,list.getSnapshot).current,session=sessionsById.get(current),shell=inputHub.shells.get(current),view=viewStores.get(current)!
 const useSession=(select:any)=>select(React.useSyncExternalStore((fn:any)=>session.subscribe(fn),()=>session.getSnapshot()))
 const useInput=(select:any)=>select(React.useSyncExternalStore(shell.state.subscribe,shell.state.getSnapshot))
 const useSessions=(select:any)=>select(React.useSyncExternalStore(list.subscribe,list.getSnapshot))
 const useStore=(select:any)=>select(React.useSyncExternalStore(view.subscribe,view.getSnapshot))
 const useProjection=()=>null
 const actions={setView:(value:string)=>view.update({view:value}),setDraft:(draft:string)=>view.update({draft}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}}
 const shared={sessionId:current,useSession,useSessions,useStore,actions,views,t}
 const inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,draftImages:(ids:string[])=>conversation.draftImages(ids),useNotices:(select:any)=>select(null),useLexicon:(select:any)=>select(new Map()),useMenuLauncher:(select:any)=>select(null),useProjection,sessionId:current,t}
 const renderSlot=(name:string,props:any={},scope:any={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={renderSlot}/>:name==='conversation.view'?<native.__Chat {...shared} {...props} renderSlot={renderSlot} openFile={async()=>{}} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>[]}/>:name==='conversation.chat.node'&&scope.entryKey==='user'?<native.__User {...props} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='steering'?<native.__Steering {...props} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='assistant-step'?<native.__Assistant {...props} useTurnData={()=>null} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='turn-tail'?<native.__Tail {...props} sessionId={current} useSession={useSession} renderSlot={renderSlot} renderSlotChain={()=>null} t={t}/>:scope.fallback??null
 return <native.ConversationRoot {...shared} useProjection={useProjection} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name:any,_props:any,{fallback}:any)=>fallback} selectWorkspace={async()=>{throw Error('No new workspace in this send test')}} useWorkspaces={(select:any)=>select({phase:'ready',items:[{workspaceId:'w',title:'当前工作区',sessionIds:['demo','ordinary']}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/>
}
root.render(<App/>)
let refreshing=false,historyPaused=false,disposed=false,guide:any,frame=0,sampling=false
const frames:any[]=[]
const refresh=async()=>{
 if(refreshing||historyPaused||disposed)return
 refreshing=true
 try{
  const data=await win.userMessageBackend({action:'history'}),session=sessionsById.get('demo')
  session.handleBlank(data.blank)
  session.handleRunning(data.running)
  session.installWindow(data.events,false)
  win.probe.history=data.events.map((row:any)=>row.event)
 }finally{refreshing=false}
}
const timer=window.setInterval(()=>void refresh(),25)
const nativeRows=()=>[...document.querySelectorAll('[data-chat-flow] .'+native.__userRowClass)] as HTMLElement[]
win.probe={observed,api,frames,copied:[],session:sessionsById.get('demo'),inputHub,history:[],get current(){return list.getSnapshot().current},get shell(){return inputHub.shells.get(list.getSnapshot().current)},refresh,
 async mount(){const root=document.querySelector('.wSkVaW_root') as HTMLElement;root.dataset.homeGuideResident='user-message-run';const center=root.closest('.pI_x6G_centerCol') as HTMLElement;center.dataset.homeGuideActive='user-message-run';center.dataset.homeGuideKind=win.actorKind;document.querySelector<HTMLElement>('[data-home-guide]')!.dataset.kind=win.actorKind;guide=await mountHomePresentationGuide(document,document.querySelector('#guide-host')!,{sessionId:'demo',cwd:win.cwd,runId:'user-message-run',fresh:true,signal:new AbortController().signal,...win.actorKind==='report'?{kind:'report'}:{}});window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'demo',runId:'user-message-run',playing:true}}))},
 seed(){window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail:{owner:'fixture-owner',skills:[skill],tools:[]}}));const shell=inputHub.shells.get('demo');shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref:encodeSkillReference(skill),label:'/'+skill.label,clipboardText:'/'+skill.label},{start:0,end:0,draftRev:shell.snapshot.draftRev});if(win.actorKind==='ppt')shell.insertFilePaths([win.sourcePath]);shell.setDraft(shell.snapshot.draft.trimEnd()+' '+win.brief)},
 async seedAnnotations(){window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail:{owner:'fixture-owner',skills:[skill],tools:[]}}));const shell=inputHub.shells.get('demo');shell.setDraft('整体要求📌保留原件。');if(win.annotationFile)shell.insertFilePaths([win.sourcePath]);annotationHandle=await annotationRuntime.open({sessionId:'demo',source:{kind:'workspace',relativePath:'annotation-source.pptx'}},{viewerKey:'first-message-annotation'});const slides=annotationHandle.getSnapshot().scene.slides;await annotationHandle.add({slideIndex:0,slidePart:slides[0].part,kind:'point',region:{x:.2,y:.3},nodeIds:[],comment:'标题改成真实意见📈'});await annotationHandle.add({slideIndex:2,slidePart:slides[2].part,kind:'rect',region:{x:.3,y:.4,width:.2,height:.2},nodeIds:[],comment:'框选处保留多行\n第二行中文😀'});shell.insertReference({source:SKILL_REFERENCE_SOURCE,ref:encodeSkillReference(skill),label:'/'+skill.label,clipboardText:'/'+skill.label},{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})},
 addImage(){const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;const context=canvas.getContext('2d')!;context.fillStyle='#37b9d8';context.fillRect(0,0,120,80);const data=canvas.toDataURL('image/png').split(',')[1],files=conversation.createDraftImages([new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'实际图像.png',{type:'image/png'})]);inputHub.shells.get('demo').addImages(files.map((file:any)=>file.id))},
 sample(){sampling=true;const tick=()=>{if(!sampling)return;const snapshot=win.probe.snapshot();frames.push({time:performance.now(),page:document.querySelector('[data-odyssey-page]')?.getAttribute('data-odyssey-page'),...snapshot});frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick)},
 send(mode='queue'){inputHub.shells.get('demo').submit(mode)},
 snapshot(){const session=sessionsById.get(list.getSnapshot().current),rows=nativeRows(),thinking=document.querySelector('[data-chat-flow-kind="execution"][data-state="running"]');return{requestRpcs:observed.filter(frame=>frame.type==='client-request'&&frame.method==='session.prompt').map(frame=>frame.rpcId),phase:session.getSnapshot().composerPhase,running:session.getSnapshot().running,rows:rows.map(row=>({text:row.innerText,pins:row.querySelectorAll('[data-pptx-sent-reference]').length,chips:[...row.querySelectorAll('[data-ref-chip]')].map(chip=>chip.textContent),top:row.getBoundingClientRect().top,bottom:row.getBoundingClientRect().bottom})),thinking:thinking?{text:(thinking as HTMLElement).innerText,top:thinking.getBoundingClientRect().top}:null,images:rows.flatMap(row=>[...row.querySelectorAll('img')].map(img=>({src:img.getAttribute('src'),alt:img.getAttribute('alt')}))),historyHumans:win.probe.history.filter((event:any)=>event.type==='user/message'&&event.data.source?.kind==='user').length}},
 mux(envelope:any){api.onEnvelope({type:'server-request',...envelope});if(envelope.payload?.sessionId==='demo'&&envelope.payload.type==='session/queue')sessionsById.get('demo').handleMuxEnvelope(envelope.rpcId,envelope.payload)},
 pauseHistory(value=true){historyPaused=value},status(status:string){sessionsById.get('demo').handleRunning(status==='running')},
 switchOwner(){inputHub.shells.get('ordinary').setDraft('普通会话的新草稿📌');list.update({current:'ordinary'});window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))},
 disposeGuide(){guide?.dispose()},
 unmount(){disposed=true;sampling=false;cancelAnimationFrame(frame);window.clearInterval(timer);guide?.dispose();root.unmount();for(const shell of inputHub.shells.values())shell.dispose();for(const stop of cleanups.reverse())stop()}
}
