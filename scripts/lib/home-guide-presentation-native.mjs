const START='/* odyssey:home-guide-presentation:start:v1 */'
const END='/* odyssey:home-guide-presentation:end:v1 */'

/** Present only a request actually sent by the active native demo input. */
function createHomePresentationSubmissionStore(){
 const entries=new Map(),listeners=new Set();let revision=0
 const notify=()=>{revision++;for(const listener of listeners)listener()}
 const clear=entry=>{if(entries.get(entry.sessionId)===entry){entries.delete(entry.sessionId);notify()}}
 return{
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},version:()=>revision,
  read:sessionId=>{const entry=entries.get(sessionId);if(!entry)return null;try{entry.current();return entry}catch{return null}},
  consume:clear,
  watch({sessionId,session,signal,current}){
   const api=session?.api
   if(typeof api?.subscribeEnvelopes!=='function')return()=>{}
   let closed=false,entry=null,off=()=>{},offState=()=>{}
   const valid=()=>{if(closed||signal.aborted)return false;try{current();return true}catch{return false}}
   const stop=()=>{if(closed)return;closed=true;signal.removeEventListener('abort',stop);off();offState();if(entry)clear(entry)}
   off=api.subscribeEnvelopes(batch=>{
    if(!valid()){stop();return}
    for(const envelope of batch){
     if(envelope.type==='client-request'&&envelope.method==='session.prompt'&&envelope.payload?.sessionId===sessionId){
      const content=envelope.payload.content
      if(entry||typeof envelope.rpcId!=='string'||!envelope.rpcId||!Array.isArray(content)||!content.length||content.some(part=>part?.type!=='text'||typeof part.text!=='string'))continue
      entry={sessionId,rpcId:envelope.rpcId,content:structuredClone(content),current:()=>{if(!valid())throw Error('示例输入已变化。')}}
      entries.set(sessionId,entry);notify()
     }else if(entry&&envelope.type==='server-response'&&envelope.rpcId===entry.rpcId&&(envelope.result?.ok!==true||envelope.result.value?.accepted!==true))clear(entry)
    }
   })
   if(closed){off();return stop}
   offState=session.subscribe(()=>{if(!valid()){stop();return}if(entry&&session.getSnapshot().promptError?.op==='send')clear(entry)})
   signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop()
   return stop
  }
 }
}

function useHomePresentationSubmission(sessionId,order,nodeStore){
 react.useSyncExternalStore(HomePresentationSubmissions.subscribe,HomePresentationSubmissions.version,HomePresentationSubmissions.version)
 const entry=HomePresentationSubmissions.read(sessionId),received=!!entry&&order.some(key=>{const node=nodeStore.get(key);return node?.kind==='user'&&node.data?.source?.kind==='user'&&node.data.source.rpcId===entry.rpcId})
 react.useLayoutEffect(()=>{if(entry&&received)HomePresentationSubmissions.consume(entry)},[entry,received])
 return received?null:entry
}

function HomePresentationSubmittedUser({entry,loadImage,openFile,t}){
 return react.createElement('div',{className:ChatView_module_css_default.flowItem,'data-chat-flow-key':'submitted:'+entry.rpcId,'data-chat-flow-kind':'user','data-home-guide-user-submission':entry.rpcId},react.createElement(UserStyleBubble,{content:entry.content,imageLoader:loadImage,openFile,t}))
}

/** Wait until the real right panel and its next control have settled inside the viewport. */
export async function openHomePresentationReference(document,fileId,{waitFor,cue}){
 const win=document.defaultView,sidebar='#odyssey-right-workspace-panel'
 const target=async(read,message)=>{
  let last,node,stable=0
  await waitFor(()=>{
   node=read()
   if(!node?.isConnected||node.matches(':disabled,[aria-disabled=true]')||node.closest('[hidden],[inert],[aria-hidden=true]')||
      !node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})){last=undefined;stable=0;return false}
   const panel=node.closest(sidebar)
   if(panel?.getAnimations().some(animation=>animation.playState==='running'&&['transform','width'].includes(animation.transitionProperty))){last=undefined;stable=0;return false}
   const {left,top,right,bottom,width,height}=node.getBoundingClientRect()
   const hit=document.elementFromPoint(left+width/2,top+height/2)
   if(!width||!height||left<0||top<0||right>win.innerWidth||bottom>win.innerHeight||!hit||!node.contains(hit)){
    last=undefined;stable=0;return false
   }
   const next=[left,top,right,bottom]
   stable=last?.node===node&&next.every((value,index)=>Math.abs(value-last.bounds[index])<.5)?stable+1:0
   last={node,bounds:next}
   return stable>=2
  },message)
  return node
 }
 const click=async(read,label)=>{
  const control=await target(read,'未能'+label+'，请重试。')
  await cue(control,label)
  control.click()
 }
 const right=()=>document.querySelector('[data-odyssey-panel-entry="right"]')
 if(right()?.getAttribute('aria-expanded')!=='true')await click(right,'展开右侧栏')
 const panel=()=>document.querySelector(sidebar+':not([aria-hidden=true])')
 const library=()=>[...(panel()?.querySelectorAll('[data-knowledge-panel-host]:not([data-knowledge-panel-file])')??[])]
  .find(host=>host.checkVisibility({checkVisibilityCSS:true})&&!host.closest('[hidden],[inert],[aria-hidden=true]'))
 if(!library()){
  await click(()=>panel()?.querySelector('button.t8lSSG_tabBarPlus'),'打开右侧栏页签菜单')
  const item=()=>[...document.querySelectorAll('[role="menu"] [data-odyssey-file-menu-label]')]
   .find(node=>['知识库','Knowledge Base'].includes(node.textContent?.trim()))?.closest('[role="menuitem"]')
  await click(item,'打开知识库')
 }
 const row=()=>library()?.querySelector('.knowledge-panel-rows[data-ready=true] > [draggable=true]:first-child[data-knowledge-file-id="'+fileId+'"]')
 return {file: await target(row,'知识库首位的参考 PDF 尚未就绪，请重试。'),row}
}

/** Disable only this demo's composer action tips; keep the real buttons intact. */
function useHomePresentationTooltipSuppressed(sessionId){
 const active=()=>[...document.querySelectorAll('[data-home-guide-active][data-home-guide-kind]')].some(center=>['ppt','report'].includes(center.dataset.homeGuideKind)&&[...center.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')].some(header=>header.dataset.eworkNotesSession===sessionId))
 const [suppressed,setSuppressed]=react.useState(active)
 react.useLayoutEffect(()=>{
  setSuppressed(active())
  const receive=event=>{if(event.detail?.sessionId===sessionId)setSuppressed(event.detail.ending!==true&&active())}
  window.addEventListener('sherlock:home-guide-playback',receive)
  return()=>window.removeEventListener('sherlock:home-guide-playback',receive)
 },[sessionId])
 return suppressed
}

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
   if(!entry||!['ppt','report'].includes(detail.kind??'ppt')||entry.kind!==(detail.kind??'ppt')||entry.cwd!==detail.cwd)throw Error('请从首页重新创建独立的演示示例会话。')
   return host
  }
  const check=ticket=>{if(stopped||owned!==ticket||ticket.controller.signal.aborted||hostFor(ticket.detail)!==ticket.host)throw changed()}
  const rpc=async(ticket,action,extra={})=>{
   const response=await window.fetch(ticket.kind==='report'?'/sherlock/home-guide/report':'/sherlock/home-guide/presentation',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,sessionId,runId:ticket.detail.runId,...extra}),signal:ticket.controller.signal})
   const result=await response.json();check(ticket);if(!response.ok||!result?.ok)throw Error(result?.message||'离线预置执行器尚未就绪。');return result
  }
  const skillRequest=(ticket,action,args={})=>new Promise((resolve,reject)=>{
   const requestId=window.crypto.randomUUID(),signal=ticket.controller.signal
   const clean=()=>{window.clearInterval(timer);window.removeEventListener('sherlock:skill-menu-reply',receive);signal.removeEventListener('abort',abort)}
   const abort=()=>{clean();window.dispatchEvent(new window.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action:'cancel'}}));reject(changed())}
   const receive=event=>{const result=event.detail;if(result?.requestId!==requestId)return;clean();try{check(ticket);if(!result.ok)throw Error(result.error||'公司PPT技能尚未就绪。');resolve(result.result)}catch(error){reject(error)}}
   let remaining=5000,last=window.performance.now()
   const timer=window.setInterval(()=>{const now=window.performance.now();if(ticket.playing&&!document.hidden)remaining-=now-last;last=now;if(remaining<=0)abort()},100)
   signal.addEventListener('abort',abort,{once:true});window.addEventListener('sherlock:skill-menu-reply',receive)
   window.dispatchEvent(new window.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action,...args}}))
  })
  const delay=(ticket,ms)=>new Promise((resolve,reject)=>{
   const abort=()=>{window.clearTimeout(timer);ticket.controller.signal.removeEventListener('abort',abort);reject(changed())},timer=window.setTimeout(()=>{ticket.controller.signal.removeEventListener('abort',abort);resolve()},ms)
   ticket.controller.signal.addEventListener('abort',abort,{once:true})
  })
  const playing=async ticket=>{for(;;){check(ticket);if(ticket.playing&&!document.hidden)return;await delay(ticket,35)}}
  const waitFor=async(ticket,predicate,requiresPlayback=true,message='原生会话暂未就绪，请重试。')=>{for(let i=0;i<200;i++){if(requiresPlayback)await playing(ticket);check(ticket);if(predicate())return;await delay(ticket,25)}throw Error(message)}
  const dispose=()=>{const ticket=owned;if(!ticket)return;owned=null;delete ticket.host.dataset.homePresentationReferenceFile;delete ticket.host.dataset.homePresentationReferenceSession;ticket.controller.abort();if(ticket.detail.fresh)void window.fetch(ticket.kind==='report'?'/sherlock/home-guide/report':'/sherlock/home-guide/presentation',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'dispose',sessionId,runId:ticket.detail.runId}),keepalive:true}).catch(()=>{})}
  const inputFor=ticket=>[...ticket.host.closest('.pI_x6G_centerCol').querySelectorAll('textarea[data-odyssey-file-reference-session]')].find(input=>input.dataset.odysseyFileReferenceSession===sessionId&&!input.closest('[data-odyssey-subagent-panel]'))
  const cue=async(ticket,target,label,action='click',fromTarget,scroll=true)=>{
   await playing(ticket)
   const valid=(visible=false)=>{check(ticket);for(const node of [target,...fromTarget?[fromTarget]:[]]){if(!node?.isConnected||node.ownerDocument!==document||node.disabled||node.readOnly||node.getAttribute('aria-disabled')==='true'||node.closest('[inert]'))throw changed();if(visible){const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.right<=0||rect.bottom<=0||rect.left>=window.innerWidth||rect.top>=window.innerHeight)throw changed()}}}
   valid()
   const marker=document.documentElement.dataset.homeGuidePointerRun,requestId=window.crypto.randomUUID(),detail={runId:ticket.detail.runId,requestId,label,action}
   if(marker&&marker!==ticket.detail.runId)throw changed()
   if(scroll)target.scrollIntoView?.({block:'nearest',inline:'nearest'})
   if(marker){
    const targetToken=detail.runId+':'+requestId+':target',fromToken=fromTarget?detail.runId+':'+requestId+':from':undefined;detail.targetToken=targetToken;if(fromToken)detail.fromTargetToken=fromToken
    const markers=[[target,targetToken],...fromTarget?[[fromTarget,fromToken]]:[]]
    await new Promise((resolve,reject)=>{
     let remaining=10000,last=window.performance.now()
     const clean=()=>{window.clearInterval(timer);window.removeEventListener('sherlock:home-guide-cue-reply',receive);ticket.controller.signal.removeEventListener('abort',abort);for(const[node,token]of markers)if(node.getAttribute('data-home-guide-cue-target')===token)node.removeAttribute('data-home-guide-cue-target')}
     const abort=()=>{clean();reject(changed())},receive=event=>{const reply=event.detail;if(reply?.runId!==detail.runId||reply.requestId!==requestId)return;clean();reply.ok?resolve():reject(Error(reply.message||'操作目标暂不可用。'))}
     const timer=window.setInterval(()=>{const now=window.performance.now();if(ticket.playing&&!document.hidden)remaining-=now-last;last=now;if(remaining<=0){clean();reject(Error('操作提示暂未就绪，请重试。'))}},100)
     window.addEventListener('sherlock:home-guide-cue-reply',receive);ticket.controller.signal.addEventListener('abort',abort,{once:true})
     try{for(const[node,token]of markers)node.setAttribute('data-home-guide-cue-target',token);window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-cue',{detail}))}catch(error){clean();reject(error)}
    })
   }else{
    window.dispatchEvent(new window.CustomEvent('sherlock:home-guide-cue',{detail:{...detail,target,...fromTarget?{fromTarget}:{} }}))
    for(let ms=0;ms<650;ms+=50){await playing(ticket);await delay(ticket,50)}
   }
   await playing(ticket);valid(true);if(marker&&document.documentElement.dataset.homeGuidePointerRun!==marker)throw changed()
  }
  const execute=async detail=>{
   if(detail.command==='dispose'||detail.command==='cancel'){if(owned?.detail.runId===detail.runId)dispose();return}
   if(detail.command==='mount'){
    const host=hostFor(detail)
    if(owned?.detail.runId===detail.runId&&owned.host===host)return
    dispose()
    const deps=HomePresentationNativeDeps,shell=deps?.inputHub.shell(sessionId)
    if(!shell||shell.disposed)throw Error('原生输入框尚未就绪。')
    const kind=detail.kind??'ppt',skillId=kind==='report'?'builtin:ework-equity-research':'builtin:efund-ppt-maker'
    const ticket={detail,kind,skillId,host,shell,controller:new window.AbortController(),stage:-1,busy:false,playing:false};owned=ticket
    if(detail.fresh)HomePresentationSubmissions.watch({sessionId,session:deps.sessions?.binding?.(sessionId)?.session,signal:ticket.controller.signal,current:()=>check(ticket)})
    if(detail.fresh){if(shell.snapshot.draft.trim()||shell.snapshot.imageIds?.length||shell.snapshot.occurrences?.length)throw Error('示例会话中已有草稿，未替换。');ticket.prepared=await rpc(ticket,'prepare',{fresh:true,cwd:detail.cwd});if(typeof ticket.prepared.brief!=='string'||!ticket.prepared.brief||(kind==='report'?typeof ticket.prepared.htmlPath!=='string'||typeof ticket.prepared.pdfPath!=='string':typeof ticket.prepared.sourcePath!=='string'||typeof ticket.prepared.presentationPath!=='string'))throw Error('预制研究示例尚未就绪。')}
    await waitFor(ticket,()=>!!inputFor(ticket),false);return
   }
   const ticket=owned
   if(!ticket||ticket.detail.runId!==detail.runId||ticket.detail.hostId!==detail.hostId)throw changed()
   check(ticket);const index=['brief','send','plan','layout','deliver','open'].indexOf(detail.command)
   if(index<0||index!==ticket.stage+1||ticket.busy||!ticket.detail.fresh)throw Error('示例步骤顺序已变化，请重新播放。')
   ticket.busy=true
   try{
    await playing(ticket)
    if(index===0){
     const input=inputFor(ticket),initialDraft=ticket.shell.snapshot.draft,initialRevision=ticket.shell.snapshot.draftRev
     if(initialDraft.trim()||ticket.shell.snapshot.occurrences?.length||ticket.shell.snapshot.imageIds?.length)throw Error('输入框已有内容，已停止自动填写。')
     const initialUnchanged=()=>{if(ticket.shell.snapshot.draft!==initialDraft||ticket.shell.snapshot.draftRev!==initialRevision||ticket.shell.snapshot.imageIds?.length)throw Error('输入内容已更改，已停止自动填写。')}
     await cue(ticket,input,'选择技能位置')
     initialUnchanged()
     const rows=await skillRequest(ticket,'list'),skill=Array.isArray(rows)&&rows.find(row=>row.id===ticket.skillId)
     if(!skill)throw Error(ticket.kind==='report'?'请先启用“研报写作”，再打开演示教程。':'请先启用“PPT制作助手”，再打开演示教程。')
     await playing(ticket)
     initialUnchanged()
     input.focus({preventScroll:true});input.setSelectionRange(0,0)
     const launcher=input.closest('.uV2eYG_root')?.querySelector('button[aria-haspopup="listbox"]')
     await cue(ticket,launcher,'打开技能菜单');initialUnchanged();launcher.click()
     // A mounted popover still starts its opening animation at zero opacity.
     const visible=node=>node?.isConnected&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&
       !node.closest('[hidden],[inert], [popover]:not(:popover-open)')
     const command=()=>[...document.querySelectorAll('[data-ework-command-menu-selection] [role="option"]')].find(row=>
       visible(row)&&[...row.querySelectorAll('span')].some(span=>['技能','Skills'].includes(span.textContent?.trim())))
     const popup=()=>[...document.querySelectorAll('[data-ework-command="skills"]')].find(visible)
     await waitFor(ticket,()=>!!command())
     await cue(ticket,command(),'选择技能','move')
     initialUnchanged()
     if(!command()?.matches('[aria-expanded="true"]')&&!popup()){
      // Reduced motion and a stationary pointer may not have opened the submenu yet.
      const row=command()
      if(!row)throw changed()
      row.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}))
     }
     const option=()=>[...(popup()?.querySelectorAll('[role="option"]')??[])].find(row=>
       visible(row)&&[...row.querySelectorAll('span')].some(span=>span.textContent?.trim()===skill.label))
     await waitFor(ticket,()=>!!option());const choice=option();await cue(ticket,choice,ticket.kind==='report'?'选择研究报告写作技能':'选择公司 PPT 制作技能');initialUnchanged();choice.click()
     await waitFor(ticket,()=>(ticket.shell.snapshot.occurrences??[]).some(ref=>ref.source==='ework-managed-skill'&&JSON.parse(ref.ref).id===ticket.skillId))
     if(!(ticket.shell.snapshot.occurrences??[]).some(ref=>ref.source==='ework-managed-skill'&&JSON.parse(ref.ref).id===ticket.skillId))throw Error('制作技能未能加入原生输入框。')
     if(ticket.shell.snapshot.imageIds?.length||ticket.shell.snapshot.occurrences?.length!==1||ticket.shell.snapshot.draft.replaceAll('\uFFFC','').trim())throw Error('输入内容已更改，已停止自动填写。')
     if(ticket.kind==='ppt'){
     const skillDraft=ticket.shell.snapshot.draft,skillRevision=ticket.shell.snapshot.draftRev,skillOccurrences=JSON.stringify(ticket.shell.snapshot.occurrences??[])
     const source=ticket.detail.librarySource
     if(typeof source?.fileId!=='string'||!/^[a-f0-9-]{36}$/.test(source.fileId))throw Error('演示参考资料尚未放入知识库。')
     ticket.host.dataset.homePresentationReferenceSession=sessionId
     ticket.host.dataset.homePresentationReferenceFile=source.fileId
     const {file,row}=await openHomePresentationReference(document,source.fileId,{
      waitFor:(predicate,message)=>waitFor(ticket,predicate,true,message),
      cue:(node,label)=>cue(ticket,node,label,'click',undefined,false)
     })
     const transfer=new window.DataTransfer(),format='application/x-ework-knowledge-file'
     const expectedName=ticket.prepared.sourcePath.split(/[\\/]/).pop()
     const unchanged=()=>ticket.shell.snapshot.draft===skillDraft&&ticket.shell.snapshot.draftRev===skillRevision&&!ticket.shell.snapshot.imageIds?.length&&JSON.stringify(ticket.shell.snapshot.occurrences??[])===skillOccurrences
     const drag=type=>new window.DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer})
     file.dispatchEvent(drag('dragstart'))
     const selected=JSON.parse(transfer.getData(format)||'null')
     if(selected?.id!==source.fileId||selected.label!==expectedName)throw Error('演示参考资料已变化，请重试。')
     file.dataset.homeGuideFileSource=ticket.detail.runId
     const drop=event=>{
      if(event.dataTransfer!==transfer)return
      event.preventDefault();event.stopImmediatePropagation()
      if(!unchanged()||row()!==file||inputFor(ticket)!==input)return
      input.focus({preventScroll:true});ticket.shell.insertFilePaths([ticket.prepared.sourcePath])
     }
     input.addEventListener('drop',drop,true)
     try{
      await cue(ticket,input,'把知识库里的参考 PDF 拖入输入框','drag',file)
      if(!unchanged()||row()!==file||inputFor(ticket)!==input)throw changed()
      input.dispatchEvent(drag('drop'))
     }finally{
      input.removeEventListener('drop',drop,true);delete file.dataset.homeGuideFileSource;file.dispatchEvent(drag('dragend'))
     }
     if(!(ticket.shell.snapshot.occurrences??[]).some(ref=>ref.source==='chat-file'&&JSON.parse(ref.ref).path===ticket.prepared.sourcePath))throw Error('研报附件未能加入原生输入框。')
     }
     const preparedDraft=ticket.shell.snapshot.draft,preparedRevision=ticket.shell.snapshot.draftRev,preparedOccurrences=JSON.stringify(ticket.shell.snapshot.occurrences??[])
     if(ticket.kind==='ppt'){
     await waitFor(ticket,()=>!!input.closest('.uV2eYG_root')?.querySelector('[data-reference-source="chat-file"]'))
     await cue(ticket,input.closest('.uV2eYG_root').querySelector('[data-reference-source="chat-file"]'),'原始研报 PDF','move')
     }
     const caretBounds=()=>{
      check(ticket);if(inputFor(ticket)!==input||input.disabled||input.readOnly||input.getAttribute('aria-disabled')==='true')throw changed()
      const segments=[...input.closest('.uV2eYG_root').querySelectorAll('.uV2eYG_backdrop [data-draft-end]')],segment=segments.filter(node=>Number(node.dataset.draftEnd)===preparedDraft.length).at(-1)
      if(!segment)throw changed()
      const range=document.createRange();range.selectNodeContents(segment)
      const rect=segment.hasAttribute('data-occurrence')?segment.getBoundingClientRect():[...range.getClientRects()].at(-1),box=input.getBoundingClientRect()
      if(!rect||rect.height<=0)throw changed()
      const x=rect.right,y=rect.top+rect.height/2
      let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(window.innerWidth,box.right),bottom=Math.min(window.innerHeight,box.bottom)
      for(let node=input;node;node=node.parentElement){const style=window.getComputedStyle(node);if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')throw changed();if(node!==input){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}}
      if(x<=left||x>=right||y<=top||y>=bottom)throw changed()
      return[x,y,box.left,box.top,box.right,box.bottom]
     }
     let previousCaret,stableCaret
     await waitFor(ticket,()=>{const next=caretBounds(),stable=previousCaret&&next.every((value,index)=>Math.abs(value-previousCaret[index])<.5);previousCaret=next;if(stable)stableCaret=next;return stable})
     const caretTarget=document.createElement('span');caretTarget.dataset.homeGuideInputCaret=ticket.detail.runId;caretTarget.setAttribute('aria-hidden','true');caretTarget.style.cssText='position:fixed;pointer-events:none;width:2px;height:2px;left:'+(stableCaret[0]-1)+'px;top:'+(stableCaret[1]-1)+'px';document.body.append(caretTarget)
     try{
      await cue(ticket,caretTarget,ticket.kind==='report'?'填写研究问题':'填写研报转换要求')
      if(caretBounds().some((value,index)=>Math.abs(value-stableCaret[index])>2))throw changed()
      if(ticket.shell.snapshot.draft!==preparedDraft||ticket.shell.snapshot.draftRev!==preparedRevision||ticket.shell.snapshot.imageIds?.length||JSON.stringify(ticket.shell.snapshot.occurrences??[])!==preparedOccurrences)throw Error('输入内容已更改，已停止自动填写。')
      input.focus({preventScroll:true});input.click();input.setSelectionRange(input.value.length,input.value.length);ticket.shell.track(preparedDraft,preparedDraft.length)
     }finally{caretTarget.remove()}
     if(ticket.shell.snapshot.draft!==preparedDraft||ticket.shell.snapshot.draftRev!==preparedRevision||ticket.shell.snapshot.imageIds?.length||JSON.stringify(ticket.shell.snapshot.occurrences??[])!==preparedOccurrences)throw Error('输入内容已更改，已停止自动填写。')
     if(ticket.shell.snapshot.imageIds?.length)throw Error('输入附件已更改，已停止自动填写。')
     const unchanged=()=>ticket.shell.snapshot.draft===prior&&ticket.shell.snapshot.draftRev===revision&&!ticket.shell.snapshot.imageIds?.length&&JSON.stringify(ticket.shell.snapshot.occurrences??[])===preparedOccurrences
     const prefix=ticket.shell.snapshot.draft.trimEnd()+' ',brief=ticket.prepared.brief
     ticket.shell.setDraft(prefix);let prior=prefix,revision=ticket.shell.snapshot.draftRev
     await waitFor(ticket,()=>input.value.length===prior.length)
     const backdrop=input.closest('.uV2eYG_root').querySelector('[data-input-backdrop]')
     if(!backdrop||typeof createAssistantTextPaint!=='function')throw Error('输入文字显示尚未就绪，请重试。')
     const reveal=createAssistantTextPaint(backdrop,{epoch:1,live:true},'composer'),paintObserver=new MutationObserver(()=>{if(owned===ticket&&!ticket.controller.signal.aborted)reveal.update()})
     reveal.update();paintObserver.observe(backdrop,{childList:true,subtree:true,characterData:true})
     try{
      for(const{segment}of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(brief)){
       await playing(ticket);if(!unchanged())throw Error('输入内容已更改，已停止自动填写。')
       prior+=segment;ticket.shell.setDraft(prior);revision=ticket.shell.snapshot.draftRev
       await waitFor(ticket,()=>input.value.length===prior.length)
       if(inputFor(ticket)!==input||!input.isConnected)throw changed()
       if(!unchanged())throw Error('输入内容已更改，已停止自动填写。')
       input.setSelectionRange(input.value.length,input.value.length);ticket.shell.track(prior,prior.length);reveal.update()
       await delay(ticket,/[，。；！？]$/.test(segment)?240:50)
      }
     }finally{paintObserver.disconnect();reveal.dispose()}
     if(!unchanged())throw Error('输入内容已更改，已停止自动填写。')
     ticket.typedInput={draft:prior,revision,occurrences:preparedOccurrences}
    }else if(index===1){
     const admission=ticket.typedInput,unchanged=()=>admission&&ticket.shell.snapshot.draft===admission.draft&&ticket.shell.snapshot.draftRev===admission.revision&&!ticket.shell.snapshot.imageIds?.length&&JSON.stringify(ticket.shell.snapshot.occurrences??[])===admission.occurrences
     if(!unchanged())throw Error('输入内容已更改，演示已停止，草稿已保留。')
     const input=inputFor(ticket),button=input?.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary')
     if(!button||button.disabled)throw Error('原生发送按钮暂不可用。')
     await cue(ticket,button,'发送演示需求');if(!unchanged())throw Error('输入内容已更改，演示已停止，草稿已保留。');button.click()
     await waitFor(ticket,()=>ticket.shell.snapshot.draft==='')
     // Native commit clears the composer before session.prompt acknowledges.
     // Only the preset Host's admitted human request proves this send succeeded.
     await rpc(ticket,'checkpoint',{stage:'accepted'})
     await playing(ticket)
    }else if(index<=4){await rpc(ticket,'checkpoint',{stage:detail.command})}
    else{
     const root=ticket.host.closest('.pI_x6G_centerCol'),file=()=>[...root.querySelectorAll('.ew-delivery-card[data-file-path]')].find(node=>node.dataset.filePath===(ticket.kind==='report'?ticket.prepared.pdfPath:ticket.prepared.presentationPath))?.querySelector('button.ew-delivery-open')
     await waitFor(ticket,()=>!!file());const target=file()
     await cue(ticket,target,ticket.kind==='report'?'打开研究报告 PDF':'打开可编辑文件');target.click()
     await delay(ticket,80);await playing(ticket);await waitFor(ticket,()=>!target.isConnected||target.getAttribute('aria-busy')!=='true')
     const error=target.closest('.ew-delivery-item')?.querySelector('.ew-delivery-status[data-error="true"]')
     if(error)throw Error(error.textContent||'演示文稿未能打开。')
    }
    check(ticket);ticket.stage=index
   }finally{ticket.busy=false}
  }
  const receive=event=>{
   const detail=event.detail
   if(!detail||detail.sessionId!==sessionId||!['requestId','runId','sessionId','hostId'].every(key=>typeof detail[key]==='string'&&/^[\w:-]{1,128}$/.test(detail[key]))||typeof detail.command!=='string')return
   const key=JSON.stringify([detail.runId,detail.sessionId,detail.hostId,detail.command,detail.cwd,detail.fresh,detail.kind,detail.librarySource]),prior=requests.get(detail.requestId)
   if(prior){if(prior.key!==key){reply(detail,false,'教程请求标识已使用。');return}prior.promise.then(()=>reply(detail,true),error=>reply(detail,false,error?.message));return}
   const promise=execute(detail);requests.set(detail.requestId,{key,promise});if(requests.size>128)requests.delete(requests.keys().next().value)
   promise.then(()=>reply(detail,true),error=>{if(detail.command!=='open'&&owned?.detail.runId===detail.runId)dispose();reply(detail,false,error?.message||'演示未完成，请重试。')})
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
const PRESENTATION_EFFECT='ctx.effect(()=>{const deps={sessions,inputHub,researchSidebar,getHomeGuideSession:id=>sherlockBoardsAdapter?.getHomeGuideSession?.(id)};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},"Home presentation native dependencies");'
const LEGACY_PAGE_EFFECT='ctx.effect(()=>{const deps={sessions,inputHub,researchSidebar,getHomeGuideSession:id=>sherlockBoardsPage.getHomeGuideSession(id)};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},"Home presentation native dependencies");'
const PRESENTATION_EXPORT='exports.NativeHomePresentationPortal = NativeHomePresentationPortal;'
const SUBMISSION_HOOK='\n/* odyssey:home-presentation-submitted-user:v1 */\nconst homePresentationSubmission=useHomePresentationSubmission(sessionId,order,nodeStore);\n'
const INPUT_TIP_HOOK='\n/* odyssey:home-presentation-composer-tips:v1 */\nconst homePresentationTipsSuppressed=useHomePresentationTooltipSuppressed(sessionId);\n'
const INPUT_TIP_LABELS=['label: t("input.stop"),','label: primaryLabel,']
const SUBMISSION_RENDER='homePresentationSubmission&&react.createElement(HomePresentationSubmittedUser,{entry:homePresentationSubmission,loadImage,openFile,t}),\n'

/** Restore the prior (possibly board-wrapped) Root before exact legacy transforms. */
export function stripHomeGuidePresentationNative(source){
 const ownedNames=['HomePresentationNativeDeps','HomePresentationOriginalConversationRoot','NativeHomePresentationContent','NativeHomePresentationPortal','NativePresentationConversationRoot','homePresentationSidebarSnapshot','createHomePresentationSubmissionStore','HomePresentationSubmissions','useHomePresentationSubmission','HomePresentationSubmittedUser','homePresentationSubmission','odyssey:home-presentation-submitted-user:','useHomePresentationTooltipSuppressed','homePresentationTipsSuppressed','odyssey:home-presentation-composer-tips:']
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
 const effects=[PRESENTATION_EFFECT,LEGACY_PAGE_EFFECT,...['researchSidebar,researchOfficePreview,t','researchSidebar,researchOfficePreview'].map(fields=>'ctx.effect(()=>{const deps={'+fields+'};HomePresentationNativeDeps=deps;return()=>{if(HomePresentationNativeDeps===deps)HomePresentationNativeDeps=null}},\"Home presentation native dependencies\");'.replaceAll('\\"','"'))]
 const bindings=effects.map(effect=>'\n'+PRESENTATION_BINDING+'\n'+effect).filter(binding=>source.includes(binding))
 if(bindings.length!==1||source.split('const composerBlocks = new ComposerBlockRegistry();'+bindings[0]).length!==2||!source.includes('\n'+PRESENTATION_EXPORT))drift()
 let restored=source.slice(0,start)+source.slice(end+END.length+(source[end+END.length]==='\n'?1:0))
 if(block.includes('createHomePresentationSubmissionStore')){
  for(const name of ['createHomePresentationSubmissionStore','useHomePresentationSubmission','HomePresentationSubmittedUser'])if(block.split('function '+name+'(').length!==2)drift()
  if(block.split('const HomePresentationSubmissions=createHomePresentationSubmissionStore();').length!==2)drift()
  if(restored.split(SUBMISSION_HOOK).length!==2||restored.split(SUBMISSION_RENDER).length!==2)drift()
  restored=restored.replace(SUBMISSION_HOOK,'').replace(SUBMISSION_RENDER,'')
 }
 if(block.includes('function useHomePresentationTooltipSuppressed(')){
  if(restored.split(INPUT_TIP_HOOK).length!==2)drift()
  restored=restored.replace(INPUT_TIP_HOOK,'')
  for(const label of INPUT_TIP_LABELS){const patched=label+'disabled:homePresentationTipsSuppressed,';if(restored.split(patched).length!==2)drift();restored=restored.replace(patched,label)}
 }
 restored=restored.replace(bindings[0],'').replace('\n'+PRESENTATION_EXPORT,'')
 if(traces.some(value=>restored.includes(value)))drift()
 return restored
}

export function patchHomeGuidePresentationNative(source){
 source=stripHomeGuidePresentationNative(source)
 const definitions=START+'\nlet HomePresentationNativeDeps=null;\n'+[createHomePresentationSubmissionStore,useHomePresentationSubmission,HomePresentationSubmittedUser,useHomePresentationTooltipSuppressed,openHomePresentationReference,NativeHomePresentationPortal,NativePresentationConversationRoot].map(fn=>fn.toString()).join('\n')+'\nconst HomePresentationSubmissions=createHomePresentationSubmissionStore();\nconst HomePresentationOriginalConversationRoot=ConversationRoot;\nConversationRoot=NativePresentationConversationRoot;\n'+END
 const inputBar=source.match(/function InputBar\([^\n]+\) \{/g)
 if(inputBar?.length!==1)throw Error('Home presentation composer hook anchor drifted')
 source=one(source,inputBar[0],inputBar[0]+INPUT_TIP_HOOK)
 for(const label of INPUT_TIP_LABELS)source=one(source,label,label+'disabled:homePresentationTipsSuppressed,')
 source=one(source,'const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);'+SUBMISSION_HOOK)
 const flow=['conversationComponentFlow.flatMap((entry) => {','renderFlow.flatMap((entry) => {'].filter(anchor=>source.includes(anchor))
 if(flow.length!==1)throw Error('Home presentation submitted-user flow anchor drifted')
 source=one(source,flow[0],SUBMISSION_RENDER+flow[0])
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
