const START='/* odyssey:home-guide-presentation:start:v1 */'
const END='/* odyssey:home-guide-presentation:end:v1 */'

function homePresentationSidebarSnapshot(service,sessionId){
 const snapshot=service.getSnapshot?.(),state=snapshot?.state
 if(snapshot?.sessionId!==sessionId||!state)return null
 const leaves=node=>!node?[]:node.kind==='leaf'?[node]:(node.children??[]).flatMap(leaves)
 const panels=[...leaves(state.splits),...leaves(state.bottomSplits)]
 return{open:state.panelOpen,activeTab:panels.find(leaf=>leaf.id===state.activePane)?.active??null,
  signature:JSON.stringify([state.panelOpen,state.activePane,panels.map(leaf=>[leaf.id,leaf.active,leaf.tabs.map(tab=>tab.id)])])}
}

function NativeHomePresentationContent({ticket}){
 const shell=ticket.shell
 const useInput=select=>react.useSyncExternalStore(shell.state.subscribe,()=>select(shell.snapshot),()=>select(shell.snapshot))
 const t=HomePresentationNativeDeps?.t??((key,values)=>key==='todo.progress.total'?`${values.done}/${values.total}`:({'todo.title':'演示文稿制作任务','input.placeholder':'预置需求示例'}[key]??key))
 const labels=['核对品牌与演示目标','安排信息层级与页面结构','完成版式并交付可编辑文件']
 const phase=ticket.stage
 const todos=phase<1?[]:labels.map((content,index)=>({content,status:phase>=3||index<phase-1?'completed':index===phase-1?'in_progress':'pending'}))
 return react.createElement('div',{'data-home-presentation-native':ticket.detail.runId,style:{display:'flex',flexDirection:'column',gap:20,padding:20,minWidth:0,height:'100%',overflow:'auto',boxSizing:'border-box'}},
  react.createElement('p',{style:{margin:0,fontSize:12,color:'var(--dsw-alias-label-secondary,#777)'}},'离线预置示例 · 不调用模型，也不写入你的对话记录'),
  react.createElement(InputBar,{useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),useInput,inputActions:shell.actions,keyboard:shell,renderSlot:()=>null,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_key,select)=>select?.(undefined),sessionId:ticket.privateId,t,variant:'hero',disabled:true}),
  react.createElement(TodoPanel,{todos,objective:'制作一页 EWork Odyssey 产品介绍',running:phase<3,t}),
  phase>=2&&react.createElement('p',{'data-home-presentation-explanation':'',style:{margin:0,lineHeight:1.7,fontSize:14}},phase===2?'采用公司品牌模板，先建立标题与内容层级，再整理左右分区和信息图表。':'预置演示文稿已准备好，可在右侧原生 Office 标签中查看真实文件。'),
  phase>=3&&react.createElement('button',{type:'button','data-home-presentation-file':'',onClick:()=>ticket.open().catch(error=>ticket.report(error)),style:{textAlign:'left',padding:14,borderRadius:8,border:'1px solid var(--dsw-alias-border-standard,#ddd)',background:'var(--dsw-alias-bg-base,#fff)',color:'inherit'}},'efund-ework-onepage.pptx · 打开预置文件'))
}

function NativeHomePresentationPortal({sessionId,subagentPanel=false}){
 const [entry,setEntry]=react.useState(null),owned=react.useRef(null)
 react.useEffect(()=>{
  if(subagentPanel||!sessionId||window.top!==window)return
  let stopped=false
  const requests=new Map(),changed=()=>Error('教程页面或对话已变化。')
  const reply=(detail,ok,message)=>{if(!stopped)window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-presentation-reply',{detail:{requestId:detail.requestId,runId:detail.runId,sessionId,ok,...(message?{message}:{})}}))}
  const hostFor=detail=>{
   const host=document.getElementById(detail.hostId),container=host?.closest('[data-home-guide]'),center=container?.closest('.pI_x6G_centerCol')
   if(!host?.isConnected||!center||container.dataset.homeGuide!==detail.runId||host.closest('[data-odyssey-subagent-panel]'))throw changed()
   const header=[...center.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')].find(el=>!el.closest('[data-odyssey-subagent-panel]'))
   if(header&&header.dataset.eworkNotesSession!==sessionId)throw changed()
   return host
  }
  const check=ticket=>{if(stopped||owned.current!==ticket||ticket.controller.signal.aborted||hostFor(ticket.detail)!==ticket.host)throw changed()}
  const observeSidebar=ticket=>{
   if(ticket.sidebar)return
   const service=ticket.service,before=homePresentationSidebarSnapshot(service,sessionId)
   if(!before||typeof service.subscribeState!=='function')return
   const guard={before,last:before.signature,revision:0,ownedRevision:0,writing:0,lost:false}
   ticket.sidebar=guard
   ticket.offSidebar=service.subscribeState(()=>{
    const next=homePresentationSidebarSnapshot(service,sessionId),signature=next?.signature??null
    if(signature===guard.last)return
    guard.last=signature;guard.revision++
    if(guard.writing)guard.ownedRevision=guard.revision;else guard.lost=true
   })
  }
  const sidebarWrite=(ticket,write)=>{
   const guard=ticket.sidebar;if(guard)guard.writing++
   try{return write()}finally{if(guard)guard.writing--}
  }
  const release=ticket=>{
   ticket.controller.abort();ticket.shell.dispose?.()
   const guard=ticket.sidebar,current=homePresentationSidebarSnapshot(ticket.service??{},sessionId)
   // A changed-away-and-back selection is still a user revision. Never infer
   // ownership only from the final tab ID or undo a user's later panel choice.
   const restore=guard&&!guard.lost&&guard.revision===guard.ownedRevision&&current?.signature===guard.last&&current.activeTab===ticket.tabId
   ticket.offSidebar?.();ticket.offSidebar=null
   if(ticket.tabOpened){ticket.tabOpened=false;try{ticket.service?.closeTab(ticket.tabId,{sessionId})}catch{}}
   if(restore){
    try{if(guard.before.activeTab)ticket.service.activateTab(guard.before.activeTab,{sessionId})}catch{}
    try{if(typeof guard.before.open==='boolean')ticket.service.setPanelState({open:guard.before.open},{sessionId})}catch{}
   }
   ticket.unregister?.();ticket.unregister=null
   void ticket.assets?.request({action:'release',runId:ticket.detail.runId}).catch(()=>{})
  }
  const dispose=(synchronous=true)=>{const ticket=owned.current;if(!ticket)return;owned.current=null;release(ticket);if(synchronous)react_dom.flushSync(()=>setEntry(null));else setEntry(null)}
  const frame=ticket=>new Promise((resolve,reject)=>{
   if(ticket.controller.signal.aborted){reject(changed());return}
   let raf,timer;const finish=error=>{window.cancelAnimationFrame(raf);window.clearTimeout(timer);ticket.controller.signal.removeEventListener('abort',abort);error?reject(error):resolve()},abort=()=>finish(changed())
   ticket.controller.signal.addEventListener('abort',abort,{once:true});raf=window.requestAnimationFrame(()=>finish());timer=window.setTimeout(()=>finish(),64)
  })
  const open=async ticket=>{
   check(ticket);if(ticket.opening)return ticket.opening
   ticket.opening=(async()=>{
    const deps=HomePresentationNativeDeps,service=deps?.researchSidebar.service,office=deps?.researchOfficePreview.service
    if(!service||!office?.supports?.('pptx')||typeof office.Component!=='function'||!ticket.assets?.request)throw Error('原生演示文稿预览尚未就绪，请重试。')
    ticket.service=service;observeSidebar(ticket)
    const grant=ticket.grant??await ticket.assets.request({action:'grant',assetId:'company-presentation',runId:ticket.detail.runId})
    try{
     check(ticket);if(ticket.sidebar?.lost)throw Error('右栏状态已更改，请重新播放。')
     if(!grant?.url||grant.readOnly!==true)throw Error('预置文件授权不可用。');ticket.grant=grant
     if(!ticket.unregister)ticket.unregister=service.registerTab({id:ticket.tabType,title:()=> '演示文稿示例',hidden:true,single:false,component:()=>react.createElement(office.Component,{sourceUrl:grant.url,kind:'pptx',title:grant.name,readOnly:true})})
     ticket.tabOpened=true
     await sidebarWrite(ticket,()=>service.openTab({id:ticket.tabId,type:ticket.tabType,title:grant.name,meta:{sherlockPanel:'right',homeGuideRunId:ticket.detail.runId}},{sessionId}))
     check(ticket);if(ticket.sidebar?.lost)throw Error('右栏状态已更改，请重新播放。')
     sidebarWrite(ticket,()=>service.setPanelState({open:true},{sessionId}))
    }catch(error){
     if(ticket.controller.signal.aborted||owned.current!==ticket){try{service.closeTab(ticket.tabId,{sessionId})}catch{};void ticket.assets.request({action:'release',runId:ticket.detail.runId}).catch(()=>{})}
     throw error
    }
   })().finally(()=>{ticket.opening=null})
   return ticket.opening
  }
  const execute=async detail=>{
   if(detail.command==='dispose'||detail.command==='cancel'){if(owned.current?.detail.runId===detail.runId)dispose();return}
   if(detail.command==='mount'){
    const host=hostFor(detail)
    if(owned.current?.detail.runId===detail.runId&&owned.current.host===host)return
    dispose()
    const shell=new SessionInputShell({actx:{},defaultSink:()=>{throw Error('离线教程不发送消息。')}})
    const ticket={detail,host,shell,privateId:'home-presentation:'+detail.runId,controller:new window.AbortController(),stage:-1,busy:false,tabId:'home-presentation:'+detail.runId,tabType:'home-presentation-view:'+detail.runId,tabOpened:false,assets:window.dshDesktop?.homeGuideAssets,report:error=>reply(detail,false,error?.message)}
    ticket.open=()=>open(ticket);owned.current=ticket;react_dom.flushSync(()=>setEntry({...ticket}));await frame(ticket);check(ticket)
    if(!host.querySelector('textarea'))throw Error('原生输入示例尚未就绪。')
    return
   }
   const ticket=owned.current
   if(!ticket||ticket.detail.runId!==detail.runId||ticket.detail.hostId!==detail.hostId)throw changed()
   check(ticket);const index=['brief','plan','layout','deliver','open'].indexOf(detail.command)
   if(index<0||index!==ticket.stage+1||ticket.busy)throw Error('演示步骤顺序已变化，请重新播放。')
   ticket.busy=true
   try{
    if(index===0){
     ticket.shell.setDraft('请制作一页 EWork Odyssey 产品介绍，沿用公司品牌模板，突出产品定位、关键能力与使用价值。')
     ticket.shell.insertReference({source:'ework-managed-skill',ref:JSON.stringify({id:'builtin:efund-ppt-maker',revision:1,invocationName:'ework-skill-0123456789abcdef',label:'efund-ppt-maker'}),label:'/efund-ppt-maker',clipboardText:'/efund-ppt-maker'},{start:0,end:0,draftRev:ticket.shell.snapshot.draftRev})
    }
    if(index===4)await open(ticket)
    check(ticket);ticket.stage=index;react_dom.flushSync(()=>setEntry({...ticket}));await frame(ticket);check(ticket)
   }finally{ticket.busy=false}
  }
  const receive=event=>{
   const detail=event.detail
   if(!detail||detail.sessionId!==sessionId||!['requestId','runId','sessionId','hostId'].every(key=>typeof detail[key]==='string'&&/^[\w:-]{1,128}$/.test(detail[key]))||typeof detail.command!=='string')return
   const key=JSON.stringify([detail.runId,detail.sessionId,detail.hostId,detail.command]),prior=requests.get(detail.requestId)
   if(prior){if(prior.key!==key){reply(detail,false,'教程请求标识已使用。');return}prior.promise.then(()=>reply(detail,true),error=>reply(detail,false,error?.message));return}
   const promise=execute(detail);requests.set(detail.requestId,{key,promise});if(requests.size>128)requests.delete(requests.keys().next().value)
   promise.then(()=>reply(detail,true),error=>{if(owned.current?.detail.runId===detail.runId)dispose();reply(detail,false,error?.message||'演示未完成，请重试。')})
  }
  const reset=()=>dispose(false),observer=new MutationObserver(()=>{if(owned.current&&!owned.current.host.isConnected)dispose()})
  observer.observe(document.body,{childList:true,subtree:true})
  window.addEventListener('sherlock:home-guide-presentation-request',receive);window.addEventListener('sherlock:home-action-context-changed',reset);window.addEventListener('sherlock:skill-menu-reset',reset);document.addEventListener('sherlock:notes-reset',reset)
  return()=>{stopped=true;observer.disconnect();window.removeEventListener('sherlock:home-guide-presentation-request',receive);window.removeEventListener('sherlock:home-action-context-changed',reset);window.removeEventListener('sherlock:skill-menu-reset',reset);document.removeEventListener('sherlock:notes-reset',reset);const ticket=owned.current;owned.current=null;if(ticket)release(ticket)}
 },[sessionId,subagentPanel])
 if(!entry||entry.controller.signal.aborted||entry.detail.sessionId!==sessionId||subagentPanel)return null
 return react_dom.createPortal(react.createElement(NativeHomePresentationContent,{ticket:entry}),entry.host)
}

function NativePresentationConversationRoot(props){
 return react.createElement(react.Fragment,null,react.createElement(HomePresentationOriginalConversationRoot,props),react.createElement(NativeHomePresentationPortal,{sessionId:props.sessionId,subagentPanel:props.subagentPanel}))
}
function one(source,before,after){if(source.split(before).length!==2)throw Error('Home presentation native anchor drifted: '+before.slice(0,80));return source.replace(before,after)}
const PRESENTATION_BINDING='/* odyssey:home-presentation-binding:v1 */'
const PRESENTATION_EFFECT='ctx.effect(()=>{const deps={researchSidebar,researchOfficePreview,t};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},"Home presentation native dependencies");'
const PRESENTATION_EXPORT='exports.NativeHomePresentationPortal = NativeHomePresentationPortal;'

/** Restore the prior (possibly board-wrapped) Root before exact legacy transforms. */
export function stripHomeGuidePresentationNative(source){
 const ownedNames=['HomePresentationNativeDeps','HomePresentationOriginalConversationRoot','NativeHomePresentationContent','NativeHomePresentationPortal','NativePresentationConversationRoot','homePresentationSidebarSnapshot']
 const traces=[START,END,PRESENTATION_BINDING,...ownedNames]
 const drift=()=>{throw Error('Home presentation native strip anchor drifted')}
 if(!source.includes(START)){if(traces.some(value=>source.includes(value)))drift();return source}
 if(source.split(START).length!==2||source.split(END).length!==2||source.split(PRESENTATION_BINDING).length!==2||source.split(PRESENTATION_EXPORT).length!==2)drift()
 const start=source.indexOf(START),end=source.indexOf(END,start)
 if(end<start)drift()
 const block=source.slice(start,end+END.length)
 if(!block.startsWith(START+'\nlet HomePresentationNativeDeps=null;\n')||!block.endsWith('\nconst HomePresentationOriginalConversationRoot=ConversationRoot;\nConversationRoot=NativePresentationConversationRoot;\n'+END))drift()
 for(const name of ['NativeHomePresentationContent','NativeHomePresentationPortal','NativePresentationConversationRoot'])if(block.split('function '+name+'(').length!==2)drift()
 if(block.includes('homePresentationSidebarSnapshot')&&block.split('function homePresentationSidebarSnapshot(').length!==2)drift()
 const effects=[PRESENTATION_EFFECT,PRESENTATION_EFFECT.replace('researchOfficePreview,t','researchOfficePreview')]
 const bindings=effects.map(effect=>'\n'+PRESENTATION_BINDING+'\n'+effect).filter(binding=>source.includes(binding))
 if(bindings.length!==1||source.split('const composerBlocks = new ComposerBlockRegistry();'+bindings[0]).length!==2||!source.includes('\n'+PRESENTATION_EXPORT))drift()
 let restored=source.slice(0,start)+source.slice(end+END.length+(source[end+END.length]==='\n'?1:0))
 restored=restored.replace(bindings[0],'').replace('\n'+PRESENTATION_EXPORT,'')
 if(traces.some(value=>restored.includes(value)))drift()
 return restored
}

export function patchHomeGuidePresentationNative(source){
 const definitions=START+'\nlet HomePresentationNativeDeps=null;\n'+[homePresentationSidebarSnapshot,NativeHomePresentationContent,NativeHomePresentationPortal,NativePresentationConversationRoot].map(fn=>fn.toString()).join('\n')+'\nconst HomePresentationOriginalConversationRoot=ConversationRoot;\nConversationRoot=NativePresentationConversationRoot;\n'+END
 if(source.includes(START)){
  const start=source.indexOf(START),end=source.indexOf(END,start)
  if(end<0||source.indexOf(START,start+START.length)>=0||!source.includes('function NativePresentationConversationRoot('))throw Error('Home presentation native refresh anchor drifted')
  source=source.slice(0,start)+definitions+source.slice(end+END.length)
 }else source=one(source,'exports.ConversationRoot = ConversationRoot;',definitions+'\nexports.ConversationRoot = ConversationRoot;')
 if(!source.includes(PRESENTATION_BINDING))source=one(source,'const composerBlocks = new ComposerBlockRegistry();','const composerBlocks = new ComposerBlockRegistry();\n'+PRESENTATION_BINDING+'\n'+PRESENTATION_EFFECT)
 if(!source.includes(PRESENTATION_EXPORT))source=one(source,'exports.ConversationRoot = ConversationRoot;','exports.ConversationRoot = ConversationRoot;\n'+PRESENTATION_EXPORT)
 return source
}

const OFFICE_ORIGINAL='const Component = kind === "docx" ? DocxView : kind === "xlsx" ? XlsxView : PptxView;'
const OFFICE_READONLY='/* odyssey:home-presentation-office-readonly:v1 */\nconst Component = kind === "docx" ? DocxView : kind === "xlsx" ? XlsxView : props?.readOnly === true ? PptxPreview : PptxView;'
/** Run after the standard Office and PPT editor patches; strip before fingerprint validation. */
export function patchHomeGuidePresentationOffice(source){
 if(source.includes(OFFICE_READONLY))return source
 if(!source.includes('function PptxPreview(props) {'))throw Error('Home presentation readonly Office renderer anchor drifted')
 return one(source,OFFICE_ORIGINAL,OFFICE_READONLY)
}
export function stripHomeGuidePresentationOffice(source){return source.replace(OFFICE_READONLY,OFFICE_ORIGINAL)}
