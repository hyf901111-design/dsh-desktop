/** Serialized into the native conversation module; dependencies stay in that module. */
export function NativeHomeNotesGuidePortal({sessionId,subagentPanel=false,researchSidebar}){
 react.useEffect(()=>{
  if(!sessionId||subagentPanel||window.top!==window)return
  let owned=null,closed=false
  const requests=new Map(),changed=()=>new DOMException('笔记示例页面已变化。','AbortError')
  const hostFor=detail=>{
   const host=document.getElementById(detail.hostId),guide=host?.closest('[data-home-guide]'),center=guide?.closest('.pI_x6G_centerCol')
   const header=center?.querySelector('[data-srb-session-header][data-ework-notes-session]'),entry=sherlockBoardsAdapter?.getHomeGuideSession?.(sessionId)
   if(!host?.isConnected||guide?.dataset.kind!=='note'||guide.dataset.homeGuide!==detail.runId||header?.dataset.eworkNotesSession!==sessionId||entry?.kind!=='note'||entry.cwd!==detail.cwd||host.closest('[data-odyssey-subagent-panel]'))throw changed()
   return host
  }
  const check=ticket=>{if(closed||owned!==ticket||ticket.abort.signal.aborted||document.documentElement.dataset.homeGuidePointerRun!==ticket.detail.runId||hostFor(ticket.detail)!==ticket.host)throw changed()}
  const recordFor=ticket=>{check(ticket);return typeof eworkNotesInputs==='undefined'?undefined:eworkNotesInputs.get(sessionId)}
  const inputFor=ticket=>{
   check(ticket)
   const inputs=[...new Set(document.querySelectorAll('[data-ework-notes-composer-host] textarea'))].filter(input=>input.closest('[data-ework-notes-composer-host]')?.dataset.eworkNotesComposerHost===sessionId&&!input.closest('[data-odyssey-subagent-panel]'))
   return inputs.length===1?inputs[0]:undefined
  }
  const delay=(ticket,ms)=>new Promise((resolve,reject)=>{const clean=()=>{clearTimeout(timer);ticket.abort.signal.removeEventListener('abort',stop)},stop=()=>{clean();reject(changed())},timer=setTimeout(()=>{clean();resolve()},ms);ticket.abort.signal.addEventListener('abort',stop,{once:true});if(ticket.abort.signal.aborted)stop()})
  const playing=async ticket=>{for(;;){check(ticket);if(ticket.playing&&!document.hidden)return;await delay(ticket,35)}}
  const until=async(ticket,read,play=true)=>{let budget=8000,last=performance.now();for(;;){if(play)await playing(ticket);check(ticket);const value=read();if(value)return value;await delay(ticket,30);const now=performance.now();if(!play||ticket.playing&&!document.hidden)budget-=Math.min(80,now-last);last=now;if(budget<=0)throw Error('原生笔记输入框尚未就绪。')}}
  const valid=(ticket,target)=>{
   check(ticket);if(!target?.isConnected||target.ownerDocument!==document||target.disabled||target.readOnly||target.closest('[hidden],[inert],[data-odyssey-subagent-panel]'))throw changed()
   const box=target.getBoundingClientRect();let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(innerWidth,box.right),bottom=Math.min(innerHeight,box.bottom)
   for(let node=target;node;node=node.parentElement){const style=window.getComputedStyle(node);if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')throw changed();if(node!==target){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}}
   if(right<=left||bottom<=top)throw changed()
  }
  const cue=async(ticket,target,label)=>{
   await playing(ticket);valid(ticket,target);target.scrollIntoView?.({block:'nearest',inline:'nearest'})
   if(document.documentElement.dataset.homeGuidePointerRun!==ticket.detail.runId)throw changed()
   const requestId=crypto.randomUUID(),targetToken=ticket.detail.runId+':'+requestId+':target'
   await new Promise((resolve,reject)=>{
    let budget=10000,last=performance.now()
    const clean=()=>{clearInterval(timer);window.removeEventListener('sherlock:home-guide-cue-reply',receive);ticket.abort.signal.removeEventListener('abort',stop);if(target.getAttribute('data-home-guide-cue-target')===targetToken)target.removeAttribute('data-home-guide-cue-target')}
    const stop=()=>{clean();reject(changed())},receive=event=>{const value=event.detail;if(value?.runId!==ticket.detail.runId||value.requestId!==requestId)return;clean();value.ok===true?resolve():reject(Error(value.message||'操作目标不可用。'))}
    const timer=setInterval(()=>{const now=performance.now();if(ticket.playing&&!document.hidden)budget-=now-last;last=now;if(budget<=0){clean();reject(Error('笔记示例指针未及时确认。'))}},100)
    window.addEventListener('sherlock:home-guide-cue-reply',receive);ticket.abort.signal.addEventListener('abort',stop,{once:true})
    try{target.setAttribute('data-home-guide-cue-target',targetToken);window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId:ticket.detail.runId,requestId,label,action:'click',targetToken}}))}catch(error){clean();reject(error)}
   })
   await playing(ticket);valid(ticket,target);if(document.documentElement.dataset.homeGuidePointerRun!==ticket.detail.runId)throw changed()
  }
  const rpc=async(ticket,action,extra={},signal=ticket.abort.signal)=>{
   const response=await fetch('/sherlock/home-guide/notes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},signal,body:JSON.stringify({action,sessionId,runId:ticket.detail.runId,...extra})})
   const result=await response.json();check(ticket);if(!response.ok||!result.ok)throw Error(result.message||'笔记示例任务未完成。');return result
  }
  const dispose=()=>{const ticket=owned;if(!ticket)return;owned=null;ticket.abort.abort();if(ticket.detail.fresh)void fetch('/sherlock/home-guide/notes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({action:'dispose',sessionId,runId:ticket.detail.runId})}).catch(()=>{})}
  const type=async(ticket,stage)=>{
   if(ticket.typing||!ticket.detail.fresh||!['note','selection'].includes(stage)||ticket.sent.has(stage)||stage==='selection'&&!ticket.sent.has('note'))throw Error('笔记示例步骤顺序已变化。')
   ticket.typing=true
   try{
    await playing(ticket)
    // Viewing challenge evidence selects another real sidebar tab. Return to
    // this session's existing conversation pane before targeting its input.
    const currentInput=inputFor(ticket)
    let visible=false
    if(currentInput)try{valid(ticket,currentInput);visible=true}catch{check(ticket)}
    if(!visible){
     const service=researchSidebar?.service
     if(service?.getSnapshot?.().sessionId!==sessionId||typeof service.activateTab!=='function'||typeof service.setPanelState!=='function')throw changed()
     service.activateTab('sherlock-research-conversation',{sessionId});service.setPanelState({open:true},{sessionId})
     await until(ticket,()=>{const target=inputFor(ticket);if(target)try{valid(ticket,target);return target}catch{check(ticket)}})
    }
    const record=await until(ticket,()=>{const value=recordFor(ticket);return value?.active&&value.ready&&!value.running&&!value.preparing&&inputFor(ticket)&&value}),input=inputFor(ticket),shell=record.shell,prompt=ticket.prepared.prompts[stage]
    let draft=shell.snapshot.draft,revision=shell.snapshot.draftRev
    const cas=()=>{check(ticket);if(recordFor(ticket)!==record||shell.snapshot.draft!==draft||shell.snapshot.draftRev!==revision||shell.snapshot.imageIds.length||shell.snapshot.occurrences?.length)throw Error('输入内容已变化，已保留用户草稿。')}
    if(draft!==''&&!(stage==='selection'&&draft===prompt))throw Error('输入框已有草稿，已停止示例输入。')
    await cue(ticket,input,stage==='note'?'输入当前笔记优化任务':'查看选区改写需求');cas();input.focus({preventScroll:true})
    if(!draft)for(const character of Array.from(prompt)){await playing(ticket);cas();shell.setDraft(draft+character);draft=shell.snapshot.draft;revision=shell.snapshot.draftRev;await delay(ticket,65)}
    const button=input.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary')
    await cue(ticket,button,'发送笔记优化需求');cas()
    const submission=record.submission+1;let accepted=false
    const receive=event=>{if(event.detail?.sessionId===sessionId&&event.detail.submissionId===submission)accepted=true}
    document.addEventListener('sherlock:notes-submit-accepted',receive)
    try{button.click();await until(ticket,()=>accepted);ticket.sent.add(stage)}finally{document.removeEventListener('sherlock:notes-submit-accepted',receive)}
   }finally{ticket.typing=false}
  }
  const generate=async(ticket,input)=>{
   check(ticket);if(!ticket.detail.fresh||input?.sessionId!==sessionId||typeof input.requestId!=='string'||ticket.jobs.has(input.requestId))throw Error('笔记生成请求无效。')
   const controller=new AbortController(),stop=()=>controller.abort();ticket.jobs.set(input.requestId,controller);ticket.abort.signal.addEventListener('abort',stop,{once:true})
   try{
    const response=await fetch('/sherlock/home-guide/notes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'generate',sessionId,runId:ticket.detail.runId,input})})
    if(!response.ok){const error=await response.json();throw Error(error.message||'笔记示例生成失败。')}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result
    const consume=line=>{if(!line.trim())return;const value=JSON.parse(line);check(ticket);if(value.type==='error')throw Error(value.message);if(value.type==='result')result=value.result;else if(value.type==='progress')document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:{sessionId,requestId:input.requestId,...value.progress}}))}
    for(;;){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1)}}
    buffer+=decoder.decode();consume(buffer);check(ticket);if(result?.kind!=='text'||typeof result.markdown!=='string')throw Error('笔记示例结果未完成。');return result
   }finally{controller.abort();ticket.abort.signal.removeEventListener('abort',stop);ticket.jobs.delete(input.requestId)}
  }
  const execute=async detail=>{
   if(detail.command==='dispose'){if(owned?.detail.runId===detail.runId)dispose();return}
   if(detail.command==='mount'){
    const host=hostFor(detail);if(owned?.detail.runId===detail.runId&&owned.host===host)return
    dispose();const ticket={detail,host,abort:new AbortController(),playing:false,sent:new Set(),jobs:new Map(),typing:false};owned=ticket
    if(detail.fresh)ticket.prepared=await rpc(ticket,'prepare',{cwd:detail.cwd,fresh:true})
    await until(ticket,()=>recordFor(ticket)?.ready&&inputFor(ticket),false);return
   }
   const ticket=owned;if(!ticket||ticket.detail.runId!==detail.runId||ticket.detail.hostId!==detail.hostId)throw changed();check(ticket)
   if(detail.command==='type')return type(ticket,detail.stage)
   if(detail.command==='generate')return generate(ticket,detail.input)
   if(detail.command==='stop'){ticket.jobs.get(detail.generationRequestId)?.abort();return}
   throw Error('不支持的笔记示例命令。')
  }
  const receive=event=>{
   const detail=event.detail
   if(detail?.sessionId!==sessionId||!['requestId','sessionId','runId','hostId'].every(key=>typeof detail[key]==='string'&&/^[\w:-]{1,128}$/.test(detail[key])))return
   const signature=JSON.stringify(detail),old=requests.get(detail.requestId)
   const reply=(ok,result,message)=>{if(!closed)window.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-native-reply',{detail:{requestId:detail.requestId,sessionId,runId:detail.runId,ok,result,message}}))}
   if(old&&old.signature!==signature){reply(false,undefined,'请求标识已用于其他操作。');return}
   const promise=old?.promise||execute(detail);requests.set(detail.requestId,{signature,promise});if(requests.size>128)requests.delete(requests.keys().next().value)
   void promise.then(result=>reply(true,result),error=>reply(false,undefined,error.message||'笔记示例已停止。'))
  }
  const playback=event=>{const value=event.detail,ticket=owned;if(ticket&&value?.sessionId===sessionId&&value.runId===ticket.detail.runId){ticket.playing=value.playing===true;if(ticket.detail.fresh)void rpc(ticket,'playback',{playing:ticket.playing}).catch(()=>{})}}
  const reset=()=>dispose(),observer=new MutationObserver(()=>{if(owned)try{check(owned)}catch{dispose()}})
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-home-guide']})
  window.addEventListener('sherlock:home-guide-notes-native-request',receive);window.addEventListener('sherlock:home-guide-playback',playback);window.addEventListener('sherlock:home-action-context-changed',reset);document.addEventListener('sherlock:notes-reset',reset)
  return()=>{dispose();closed=true;observer.disconnect();window.removeEventListener('sherlock:home-guide-notes-native-request',receive);window.removeEventListener('sherlock:home-guide-playback',playback);window.removeEventListener('sherlock:home-action-context-changed',reset);document.removeEventListener('sherlock:notes-reset',reset)}
 },[sessionId,subagentPanel,researchSidebar])
 return null
}
