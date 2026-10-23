const START='/* odyssey:home-guide-presentation:start:v1 */'
const END='/* odyssey:home-guide-presentation:end:v1 */'

function NativeHomePresentationPortal({sessionId,subagentPanel=false}){
 react.useEffect(()=>{
  if(subagentPanel||!sessionId||window.top!==window)return
  let stopped=false,owned=null
  const requests=new Map(),changed=()=>new DOMException('教程页面或对话已变化。','AbortError')
  const reply=(detail,ok,message)=>{if(!stopped)window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-presentation-reply',{detail:{requestId:detail.requestId,runId:detail.runId,sessionId,ok,...(message?{message}:{})}}))}
  const hostFor=detail=>{
   const host=document.getElementById(detail.hostId),container=host?.closest('[data-home-guide]'),center=container?.closest('.pI_x6G_centerCol')
   if(!host?.isConnected||!center||container.dataset.homeGuide!==detail.runId||host.closest('[data-odyssey-subagent-panel]'))throw changed()
   const header=[...center.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')].find(el=>!el.closest('[data-odyssey-subagent-panel]'))
   if(!header||header.dataset.eworkNotesSession!==sessionId)throw changed()
   const entry=HomePresentationNativeDeps?.getHomeGuideSession?.(sessionId)
   if(!entry||entry.kind!=='ppt'||entry.cwd!==detail.cwd)throw Error('请从首页重新创建独立的演示示例会话。')
   return host
  }
  const check=ticket=>{if(stopped||owned!==ticket||ticket.controller.signal.aborted||hostFor(ticket.detail)!==ticket.host)throw changed()}
  const rpc=async(ticket,action,extra={})=>{
   const response=await window.fetch('/sherlock/home-guide/presentation',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,sessionId,runId:ticket.detail.runId,...extra}),signal:ticket.controller.signal})
   const result=await response.json();check(ticket);if(!response.ok||!result?.ok)throw Error(result?.message||'离线预置执行器尚未就绪。');return result
  }
  const delay=(ticket,ms)=>new Promise((resolve,reject)=>{
   const abort=()=>{window.clearTimeout(timer);ticket.controller.signal.removeEventListener('abort',abort);reject(changed())},timer=window.setTimeout(()=>{ticket.controller.signal.removeEventListener('abort',abort);resolve()},ms)
   ticket.controller.signal.addEventListener('abort',abort,{once:true})
  })
  const playing=async ticket=>{for(;;){check(ticket);if(ticket.playing&&!document.hidden)return;await delay(ticket,35)}}
  const waitFor=async(ticket,predicate)=>{for(let i=0;i<200;i++){check(ticket);if(predicate())return;await delay(ticket,25)}throw Error('原生会话暂未就绪，请重试。')}
  const dispose=()=>{const ticket=owned;if(!ticket)return;owned=null;ticket.controller.abort();if(ticket.detail.fresh)void window.fetch('/sherlock/home-guide/presentation',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'dispose',sessionId,runId:ticket.detail.runId}),keepalive:true}).catch(()=>{})}
  const inputFor=ticket=>[...ticket.host.closest('.pI_x6G_centerCol').querySelectorAll('textarea[data-odyssey-file-reference-session]')].find(input=>input.dataset.odysseyFileReferenceSession===sessionId&&!input.closest('[data-odyssey-subagent-panel]'))
  const cue=async(ticket,target,label)=>{await playing(ticket);window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-cue',{detail:{runId:ticket.detail.runId,target,label}}));await delay(ticket,180);await playing(ticket);if(!target.isConnected)throw changed()}
  const execute=async detail=>{
   if(detail.command==='dispose'||detail.command==='cancel'){if(owned?.detail.runId===detail.runId)dispose();return}
   if(detail.command==='mount'){
    const host=hostFor(detail)
    if(owned?.detail.runId===detail.runId&&owned.host===host)return
    dispose()
    const deps=HomePresentationNativeDeps,shell=deps?.inputHub.shell(sessionId)
    if(!shell||shell.disposed)throw Error('原生输入框尚未就绪。')
    const ticket={detail,host,shell,controller:new window.AbortController(),stage:-1,busy:false,playing:false};owned=ticket
    if(detail.fresh){if(shell.snapshot.draft.trim()||shell.snapshot.attachments?.length)throw Error('示例会话中已有草稿，未替换。');await rpc(ticket,'prepare',{fresh:true,cwd:detail.cwd})}
    await waitFor(ticket,()=>!!inputFor(ticket));return
   }
   const ticket=owned
   if(!ticket||ticket.detail.runId!==detail.runId||ticket.detail.hostId!==detail.hostId)throw changed()
   check(ticket);const index=['brief','send','plan','layout','deliver','open'].indexOf(detail.command)
   if(index<0||index!==ticket.stage+1||ticket.busy||!ticket.detail.fresh)throw Error('示例步骤顺序已变化，请重新播放。')
   ticket.busy=true
   try{
    await playing(ticket)
    if(index===0){
     const input=inputFor(ticket);await cue(ticket,input,'输入演示目标');input.focus({preventScroll:true})
     const brief='请制作一页 EWork Odyssey 产品介绍，沿用公司品牌模板，突出产品定位、关键能力与使用价值。\n\n这是离线预置操作示例，不调用模型。'
     let prior=''
     for(let i=1;i<=brief.length;i+=2){await playing(ticket);if(ticket.shell.snapshot.draft!==prior)throw Error('输入内容已更改，示例已暂停。');prior=brief.slice(0,Math.min(i+1,brief.length));ticket.shell.setDraft(prior);await delay(ticket,26)}
     if(prior!==brief)ticket.shell.setDraft(brief)
    }else if(index===1){
     const input=inputFor(ticket),button=input?.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary')
     if(!button||button.disabled)throw Error('原生发送按钮暂不可用。')
     await cue(ticket,button,'发送演示需求');button.click()
     await waitFor(ticket,()=>ticket.shell.snapshot.draft==='')
    }else if(index<=4){await rpc(ticket,'checkpoint',{stage:detail.command})}
    else{
     const service=HomePresentationNativeDeps?.researchSidebar.service
     if(typeof service?.openFile!=='function')throw Error('原生文件预览尚未就绪。')
     const root=ticket.host.closest('.pI_x6G_centerCol'),file=[...root.querySelectorAll('a,button,[role="button"]')].find(node=>node.textContent?.includes('打开可编辑演示文稿')||node.textContent?.includes('公司风格演示示例.pptx'))
     const target=file??[...root.querySelectorAll('[data-assistant-message-id]')].at(-1)
     if(!target)throw Error('交付消息尚未显示，请重试。')
     await cue(ticket,target,'打开可编辑文件')
     await service.openFile({sessionId,cwd:ticket.detail.cwd},(0,_deepseek_ai_dsh_client_runtime_client.resolveWorkspacePath)(ticket.detail.cwd,'公司风格演示示例.pptx'))
    }
    check(ticket);ticket.stage=index
   }finally{ticket.busy=false}
  }
  const receive=event=>{
   const detail=event.detail
   if(!detail||detail.sessionId!==sessionId||!['requestId','runId','sessionId','hostId'].every(key=>typeof detail[key]==='string'&&/^[\w:-]{1,128}$/.test(detail[key]))||typeof detail.command!=='string')return
   const key=JSON.stringify([detail.runId,detail.sessionId,detail.hostId,detail.command,detail.cwd,detail.fresh]),prior=requests.get(detail.requestId)
   if(prior){if(prior.key!==key){reply(detail,false,'教程请求标识已使用。');return}prior.promise.then(()=>reply(detail,true),error=>reply(detail,false,error?.message));return}
   const promise=execute(detail);requests.set(detail.requestId,{key,promise});if(requests.size>128)requests.delete(requests.keys().next().value)
   promise.then(()=>reply(detail,true),error=>{if(owned?.detail.runId===detail.runId)dispose();reply(detail,false,error?.message||'演示未完成，请重试。')})
  }
  const playback=event=>{const ticket=owned,detail=event.detail;if(!ticket||detail?.sessionId!==sessionId||detail.runId!==ticket.detail.runId)return;ticket.playing=detail.playing===true;if(ticket.detail.fresh){ticket.playbackTask=(ticket.playbackTask??Promise.resolve()).catch(()=>{}).then(()=>{check(ticket);return rpc(ticket,'playback',{playing:ticket.playing&&!document.hidden})});void ticket.playbackTask.catch(error=>{if(error?.name!=='AbortError'&&owned===ticket){dispose();reply(ticket.detail,false,error?.message)}})}}
  const visibility=()=>{if(owned)playback({detail:{sessionId,runId:owned.detail.runId,playing:owned.playing}})}
  const reset=()=>dispose(),observer=new MutationObserver(()=>{if(owned){try{check(owned)}catch{dispose()}}})
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-home-guide']})
  window.addEventListener('sherlock:home-guide-presentation-request',receive);window.addEventListener('sherlock:home-guide-playback',playback);document.addEventListener('visibilitychange',visibility);window.addEventListener('sherlock:home-action-context-changed',reset);window.addEventListener('sherlock:skill-menu-reset',reset);document.addEventListener('sherlock:notes-reset',reset)
  return()=>{dispose();stopped=true;observer.disconnect();window.removeEventListener('sherlock:home-guide-presentation-request',receive);window.removeEventListener('sherlock:home-guide-playback',playback);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('sherlock:home-action-context-changed',reset);window.removeEventListener('sherlock:skill-menu-reset',reset);document.removeEventListener('sherlock:notes-reset',reset)}
 },[sessionId,subagentPanel])
 return null
}

function NativePresentationConversationRoot(props){
 return react.createElement(react.Fragment,null,react.createElement(HomePresentationOriginalConversationRoot,props),react.createElement(NativeHomePresentationPortal,{sessionId:props.sessionId,subagentPanel:props.subagentPanel}))
}
function one(source,before,after){if(source.split(before).length!==2)throw Error('Home presentation native anchor drifted: '+before.slice(0,80));return source.replace(before,after)}
const PRESENTATION_BINDING='/* odyssey:home-presentation-binding:v1 */'
const PRESENTATION_EFFECT='ctx.effect(()=>{const deps={sessions,inputHub,researchSidebar,getHomeGuideSession:id=>sherlockBoardsPage.getHomeGuideSession(id)};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},"Home presentation native dependencies");'
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
 for(const name of ['NativeHomePresentationPortal','NativePresentationConversationRoot'])if(block.split('function '+name+'(').length!==2)drift()
 if(block.includes('homePresentationSidebarSnapshot')&&block.split('function homePresentationSidebarSnapshot(').length!==2)drift()
 const effects=[PRESENTATION_EFFECT,...['researchSidebar,researchOfficePreview,t','researchSidebar,researchOfficePreview'].map(fields=>'ctx.effect(()=>{const deps={'+fields+'};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},\"Home presentation native dependencies\");'.replaceAll('\\"','"'))]
 const bindings=effects.map(effect=>'\n'+PRESENTATION_BINDING+'\n'+effect).filter(binding=>source.includes(binding))
 if(bindings.length!==1||source.split('const composerBlocks = new ComposerBlockRegistry();'+bindings[0]).length!==2||!source.includes('\n'+PRESENTATION_EXPORT))drift()
 let restored=source.slice(0,start)+source.slice(end+END.length+(source[end+END.length]==='\n'?1:0))
 restored=restored.replace(bindings[0],'').replace('\n'+PRESENTATION_EXPORT,'')
 if(traces.some(value=>restored.includes(value)))drift()
 return restored
}

export function patchHomeGuidePresentationNative(source){
 source=stripHomeGuidePresentationNative(source)
 const definitions=START+'\nlet HomePresentationNativeDeps=null;\n'+[NativeHomePresentationPortal,NativePresentationConversationRoot].map(fn=>fn.toString()).join('\n')+'\nconst HomePresentationOriginalConversationRoot=ConversationRoot;\nConversationRoot=NativePresentationConversationRoot;\n'+END
 source=one(source,'exports.ConversationRoot = ConversationRoot;',definitions+'\nexports.ConversationRoot = ConversationRoot;')
 source=one(source,'const composerBlocks = new ComposerBlockRegistry();','const composerBlocks = new ComposerBlockRegistry();\n'+PRESENTATION_BINDING+'\n'+PRESENTATION_EFFECT)
 return one(source,'exports.ConversationRoot = ConversationRoot;','exports.ConversationRoot = ConversationRoot;\n'+PRESENTATION_EXPORT)
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
