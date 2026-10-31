/** Reveal only within the same real conversation pane; keep document and composer still. */
export async function revealHomeNotesGuideSummary({document,window,button,input,check,until,valid}){
 check()
 const panel=button.closest('[data-research-conversation-panel]'),scroll=button.closest('.sRp_messages')||button.closest('[data-conversation-scroll]'),composer=panel?.querySelector('[data-research-composer-host]')
 if(!panel||panel.dataset.researchActive==='false'||!scroll||!panel.contains(scroll)||!composer?.contains(input))throw Error('笔记总结所在的对话面板已变化。')
 const clip=()=>{const area=scroll.getBoundingClientRect(),dock=composer.getBoundingClientRect();return{top:Math.max(0,area.top),bottom:Math.min(window.innerHeight,area.bottom,dock.height>0?dock.top:area.bottom)}}
 // Aim for breathing room, but a fully visible final row may reach scrollMax.
 const preview=button.closest('[data-note-result-preview]'),area=clip(),card=preview?.getBoundingClientRect(),box=card&&card.height<=area.bottom-area.top?card:button.getBoundingClientRect(),shift=box.bottom>area.bottom-8?box.bottom-area.bottom+8:box.top<area.top+8?box.top-area.top-8:0
 if(shift)scroll.scrollTo({top:scroll.scrollTop+shift,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
 let last,stable=0
 await until(()=>{check();if(button.closest('.sRp_messages')!==scroll&&button.closest('[data-conversation-scroll]')!==scroll||composer!==panel.querySelector('[data-research-composer-host]')||!composer.contains(input)||button.closest('[data-note-result-preview]')!==preview)throw Error('笔记总结所在的对话面板已变化。');const area=clip(),card=preview?.getBoundingClientRect(),box=card&&card.height<=area.bottom-area.top?card:button.getBoundingClientRect();if(box.top<area.top-1||box.bottom>area.bottom+1){stable=0;return}stable=last&&Math.abs(last.top-box.top)<1?stable+1:0;last=box;if(stable<2)return;valid(button);return true})
 return button
}

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
  const until=async(ticket,read,play=true,timeout=8000)=>{let budget=timeout,last=performance.now();for(;;){if(play)await playing(ticket);check(ticket);const value=read();if(value)return value;await delay(ticket,30);const now=performance.now();if(!play||ticket.playing&&!document.hidden)budget-=Math.min(80,now-last);last=now;if(budget<=0)throw Error('原生笔记输入框尚未就绪。')}}
  const valid=(ticket,target)=>{
   check(ticket);if(!target?.isConnected||target.ownerDocument!==document||target.disabled||target.readOnly||target.closest('[hidden],[inert],[data-odyssey-subagent-panel]'))throw changed()
   const box=target.getBoundingClientRect();let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(innerWidth,box.right),bottom=Math.min(innerHeight,box.bottom)
   for(let node=target;node;node=node.parentElement){const style=window.getComputedStyle(node);if(node.hidden||node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')throw changed();if(node!==target){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}}
   if(right<=left||bottom<=top)throw changed()
  }
  const cue=async(ticket,target,label)=>{
   await playing(ticket);check(ticket);if(!target?.isConnected||target.ownerDocument!==document)throw changed();target.scrollIntoView?.({block:'nearest',inline:'nearest'})
   let previous,stable=0
   await until(ticket,()=>{check(ticket);if(!target.isConnected)throw changed();try{valid(ticket,target)}catch{stable=0;previous=undefined;return}const box=target.getBoundingClientRect();stable=previous&&Math.abs(previous.top-box.top)<.5&&Math.abs(previous.left-box.left)<.5?stable+1:0;previous=box;return stable>=2})
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
  const dispose=()=>{const ticket=owned;if(!ticket||ticket.disposing)return;ticket.disposing=true;for(const requestId of [...ticket.pendingRequests]){document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId,requestId}}))}ticket.pendingRequests.clear();owned=null;ticket.abort.abort();if(ticket.detail.fresh)void fetch('/sherlock/home-guide/notes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({action:'dispose',sessionId,runId:ticket.detail.runId})}).catch(()=>{})}
  const type=async(ticket,stage)=>{
   if(ticket.typing||!ticket.detail.fresh||!['note','selection'].includes(stage)||ticket.sent.has(stage)||stage==='selection'&&(!ticket.chartReady||!ticket.quoteConfigured)||stage==='note'&&!ticket.sent.has('selection'))throw Error('笔记示例步骤顺序已变化。')
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
    const cas=()=>{check(ticket);const reason=recordFor(ticket)!==record?'composer-record-changed':shell.snapshot.draft!==draft?'composer-draft-changed':shell.snapshot.draftRev!==revision?'composer-revision-changed':shell.snapshot.imageIds.length?'composer-images-present':shell.snapshot.occurrences?.length?'composer-occurrences-present':undefined;if(reason){
     // Closed metadata only; retain exactly the original CAS rejection and message.
     try{console.info('[notes-guide-step] '+JSON.stringify({version:1,at:Date.now(),runId:ticket.detail.runId,sessionId,step:stage==='selection'?'note-rewrite':'note-task-compose',phase:'guard-rejected',reason,imageCount:Math.min(1000,shell.snapshot.imageIds.length),occurrenceCount:Math.min(1000,shell.snapshot.occurrences?.length||0)}))}catch{}
     throw Error('输入内容已变化，已保留用户草稿。')
    }}
    if(draft!==''&&!(stage==='selection'&&draft===prompt))throw Error('输入框已有草稿，已停止示例输入。')
    await cue(ticket,input,stage==='note'?'输入当前笔记优化任务':'查看选区改写需求');cas();input.focus({preventScroll:true})
    if(!draft)for(const character of Array.from(prompt)){await playing(ticket);cas();shell.setDraft(draft+character);draft=shell.snapshot.draft;revision=shell.snapshot.draftRev;await delay(ticket,65)}
    const button=await until(ticket,()=>{cas();const target=input.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary');return target?.isConnected&&!target.disabled?target:undefined})
    await cue(ticket,button,'发送笔记优化需求');cas()
    const submission=record.submission+1;let accepted=false
    const receive=event=>{if(event.detail?.sessionId===sessionId&&event.detail.submissionId===submission)accepted=true}
    document.addEventListener('sherlock:notes-submit-accepted',receive)
    if(stage==='note')ticket.noteAdmission=submission
    ticket.submitting={stage,prompt,requests:new Set()}
    try{button.click();await until(ticket,()=>accepted);if(ticket.submitting.requests.size!==1)throw Error('笔记请求归属尚未确认。');if(stage==='note')ticket.noteRequestId=[...ticket.submitting.requests][0];ticket.sent.add(stage)}finally{document.removeEventListener('sherlock:notes-submit-accepted',receive);ticket.submitting=undefined;if(stage==='note'&&!accepted)ticket.noteAdmission=undefined}
   }finally{ticket.typing=false}
  }
  const generate=async(ticket,input)=>{
   check(ticket);if(!ticket.detail.fresh||input?.sessionId!==sessionId||typeof input.requestId!=='string'||ticket.jobs.has(input.requestId))throw Error('笔记生成请求无效。')
   const note=input.prompt===ticket.prepared.prompts.note
   if(note&&(!ticket.noteAdmission||ticket.noteGeneration||ticket.noteRequestId&&ticket.noteRequestId!==input.requestId||ticket.submitting&&ticket.submitting.stage!=='note'))throw Error('笔记总结步骤顺序已变化。')
   const noteGeneration=note?ticket.noteGeneration={requestId:input.requestId,state:'pending'}:undefined
   ticket.pendingRequests.add(input.requestId)
   const controller=new AbortController(),stop=()=>controller.abort();ticket.jobs.set(input.requestId,controller);ticket.abort.signal.addEventListener('abort',stop,{once:true})
   try{
    const response=await fetch('/sherlock/home-guide/notes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'generate',sessionId,runId:ticket.detail.runId,input})})
    if(!response.ok){const error=await response.json();throw Error(error.message||'笔记示例生成失败。')}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result
    const consume=line=>{if(!line.trim())return;const value=JSON.parse(line);check(ticket);if(value.type==='error')throw Error(value.message);if(value.type==='result')result=value.result;else if(value.type==='progress')document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:{sessionId,requestId:input.requestId,...value.progress}}))}
    for(;;){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1)}}
    buffer+=decoder.decode();consume(buffer);check(ticket);if(input.prompt===ticket.prepared.prompts.chart){if(result?.kind!=='component'||result.node?.id!=='home-note-chart-'+ticket.detail.runId||result.node.containerSpec?.type!=='html')throw Error('笔记示例图表未完成。');ticket.chartReady=true}else if(note){if(result?.kind!=='text'||typeof result.markdown!=='string')throw Error('笔记总结回复未完成。');ticket.summary={requestId:input.requestId,markdown:result.markdown};noteGeneration.state='ready'}else if(result?.kind!=='text'||typeof result.markdown!=='string')throw Error('笔记示例结果未完成。');return result
   }catch(error){if(noteGeneration){noteGeneration.state='failed';noteGeneration.error=error.message||'笔记总结未完成。'}throw error
   }finally{controller.abort();ticket.abort.signal.removeEventListener('abort',stop);ticket.jobs.delete(input.requestId)}
  }
  const configureQuote=async ticket=>{
   check(ticket);if(!ticket.detail.fresh||!ticket.chartReady||ticket.quoteConfigured||ticket.configuringQuote||ticket.sent.size)throw Error('笔记行情步骤顺序已变化。')
   ticket.configuringQuote=true
   try{
    let root=await until(ticket,()=>{const rows=[...ticket.host.querySelectorAll('[data-financial-widget="quote"]')];if(rows.length>1)throw changed();return rows[0]})
    const owner=root.closest('[data-research-node-id]'),input=owner?.querySelector('input[role="combobox"][aria-label="搜索个股代码或名字"]')
    if(!owner||!ticket.host.contains(owner))throw changed()
    if(!input||input.value.trim())throw Error('行情标的已被修改，已保留当前配置。')
    await cue(ticket,input,'搜索中际旭创（300308）');input.focus({preventScroll:true})
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    let expected=''
    for(const character of '300308'){await playing(ticket);valid(ticket,input);if(input.value!==expected)throw Error('行情搜索已变化，已保留用户输入。');expected+=character;setter.call(input,expected);input.dispatchEvent(new Event('input',{bubbles:true}));await delay(ticket,120)}
    const matching=()=>{check(ticket);if(!ticket.host.contains(owner)||root.closest('[data-research-node-id]')!==owner||!owner.contains(input))throw changed();const id=input.getAttribute('aria-controls'),popups=[...document.querySelectorAll('[role="listbox"][aria-label="匹配标的"]')].filter(node=>node.id===id);if(!id||popups.length!==1)return;const rows=[...popups[0].querySelectorAll('button[role="option"]')].filter(row=>row.querySelector('strong')?.textContent==='中际旭创'&&[...row.querySelectorAll('small')].some(s=>s.textContent==='300308')&&row.querySelector('small')?.textContent==='SZ');if(rows.length>1)throw changed();return rows[0]}
    const option=await until(ticket,matching)
    await cue(ticket,option,'选择中际旭创（300308.SZ）');if(input.value!==expected||matching()!==option)throw changed();option.click()
    const quoteState=()=>{check(ticket);if(!owner.isConnected||!ticket.host.contains(owner))throw changed();const rows=[...owner.querySelectorAll('[data-financial-widget="quote"]')].filter(node=>node.closest('[data-research-node-id]')===owner);if(rows.length>1)throw changed();if(!rows.length)return;root=rows[0];const price=root.querySelector('.ew-quote-price-line strong')?.textContent||'';if(root.textContent.includes('中际旭创')&&Number(price.replace(/[,\s]/g,''))>0)return'ready';if(root.querySelector('.ew-financial-empty .ew-financial-retry'))return'failed'}
    let state
    try{state=await until(ticket,quoteState,true,25000)}catch(error){check(ticket);if(quoteState()==='ready')state='ready';else state='failed'}
    if(state!=='ready'){
     // Recover through the same footer and source selector the user can see.
     // This changes the actual native widget binding; it never supplies data.
     const footer=root.querySelector('.ew-financial-provenance');await cue(ticket,footer,'行情未载入，点击组件底部切换数据源');footer.click()
     const dialog=await until(ticket,()=>{const rows=[...document.querySelectorAll('[role="dialog"][aria-label="组件数据与自动更新"][data-component-data-surface="notes"]')];return rows.length===1?rows[0]:undefined})
     const select=await until(ticket,()=>dialog.querySelector('select[aria-label="数据源"]:not(:disabled)')),previous=select.value,next=[...select.options].find(option=>!option.disabled&&option.value!==previous)
     if(!next)throw Error('暂时没有其他可用行情数据源。')
     await cue(ticket,select,'改用'+next.textContent+'获取中际旭创行情');if(!dialog.isConnected||!select.isConnected||select.value!==previous||!ticket.host.contains(root))throw changed()
     Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,next.value);select.dispatchEvent(new Event('change',{bubbles:true}))
     await until(ticket,()=>select.isConnected&&select.value===next.value&&!select.disabled)
     const close=dialog.querySelector('button[aria-label="关闭数据设置"]');await cue(ticket,close,'返回行情面板，核对新来源和获取时间');if(!dialog.isConnected)throw changed();close.click()
     state=await until(ticket,quoteState,true,25000)
    }
    if(state!=='ready')throw Error('备用行情来源尚未完成加载。')
    ticket.quoteConfigured=true
   }catch(error){check(ticket);throw Error('个股行情尚未完整取得，已保留实际状态，请检查来源后重播。')}
   finally{ticket.configuringQuote=false}
  }
  const summary=async(ticket,append)=>{
   check(ticket);if(!ticket.detail.fresh||!ticket.noteAdmission||!ticket.sent.has('note')||ticket.summary?.appended||ticket.appendingSummary)throw Error('笔记总结步骤顺序已变化。')
   // Native submit acknowledgement precedes Markdown capture and the streamed
   // result. Wait for this admission's one semantic request, never another job.
   let requestId
   const ready=await until(ticket,()=>{const job=ticket.noteGeneration;if(!job)return;if(ticket.noteRequestId!==job.requestId||requestId&&requestId!==job.requestId)throw changed();requestId=job.requestId;if(job.state==='failed')throw Error(job.error);if(job.state!=='ready'||!ticket.summary)return;if(ticket.summary.requestId!==requestId)throw changed();return ticket.summary},true,20000)
   const current=()=>{check(ticket);if(ticket.summary!==ready||ticket.noteGeneration?.requestId!==ready.requestId)throw changed();const cards=[...ticket.host.querySelectorAll('[data-note-preview-request-id]')].filter(card=>card.dataset.notePreviewRequestId===ready.requestId&&card.dataset.notePreviewState==='ready'&&card.closest('.en-main')&&card.closest('[data-home-guide]')===ticket.host.closest('[data-home-guide]'));if(cards.length!==1)return;const card=cards[0],buttons=[...card.querySelectorAll('button')].filter(button=>button.getAttribute('data-note-preview-apply')===ready.requestId);if(buttons.length!==1||!ready.markdown.split('\n\n').every(part=>card.textContent.includes(part)))return;return buttons[0]}
   const button=await until(ticket,current);valid(ticket,button)
   if(!append){await cue(ticket,button,'阅读主区内容预览，正文尚未插入');return{requestId:ticket.summary.requestId}}
   ticket.appendingSummary=true
   try{
    await cue(ticket,button,'点击主区卡片，将总结插入笔记末尾');if(current()!==button)throw changed()
    const requestId=crypto.randomUUID();let tail
    const receiveTail=event=>{const value=event.detail;if(value?.sessionId===sessionId&&value.runId===ticket.detail.runId&&value.requestId===requestId)tail=value}
    window.addEventListener('sherlock:home-guide-notes-tail-reply',receiveTail)
    try{window.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-tail-check',{detail:{sessionId,runId:ticket.detail.runId,requestId,generationRequestId:ticket.summary.requestId}}))}finally{window.removeEventListener('sherlock:home-guide-notes-tail-reply',receiveTail)}
    check(ticket);if(tail?.ok!==true)throw Error('笔记末尾光标已变化，已保留用户当前操作。')
    let accepted=false;const receive=event=>{const value=event.detail;if(value?.sessionId===sessionId&&value.requestId===ticket.summary.requestId&&value.phase==='accepted')accepted=true}
    document.addEventListener('sherlock:notes-task-state',receive)
    try{button.click()}finally{document.removeEventListener('sherlock:notes-task-state',receive)}
    if(!accepted)throw Error('总结尚未采纳，正文已保留。');ticket.summary.appended=true
   }finally{ticket.appendingSummary=false}
  }
  const execute=async detail=>{
   if(detail.command==='dispose'){if(owned?.detail.runId===detail.runId)dispose();return}
   if(detail.command==='mount'){
    const host=hostFor(detail);if(owned?.detail.runId===detail.runId&&owned.host===host)return
    dispose();const ticket={detail,host,abort:new AbortController(),playing:false,sent:new Set(),jobs:new Map(),pendingRequests:new Set(),typing:false};owned=ticket
    if(detail.fresh)ticket.prepared=await rpc(ticket,'prepare',{cwd:detail.cwd,fresh:true})
    await until(ticket,()=>recordFor(ticket)?.ready&&inputFor(ticket),false);return
   }
   const ticket=owned;if(!ticket||ticket.detail.runId!==detail.runId||ticket.detail.hostId!==detail.hostId)throw changed();check(ticket)
   if(detail.command==='type')return type(ticket,detail.stage)
   if(detail.command==='generate')return generate(ticket,detail.input)
   if(detail.command==='configure-quote')return configureQuote(ticket)
   if(detail.command==='review-summary')return summary(ticket,false)
   if(detail.command==='append-summary')return summary(ticket,true)
   if(detail.command==='stop'){ticket.jobs.get(detail.generationRequestId)?.abort();return}
   throw Error('不支持的笔记示例命令。')
  }
  const receive=event=>{
   const detail=event.detail
   if(detail?.sessionId!==sessionId||!['requestId','sessionId','runId','hostId'].every(key=>typeof detail[key]==='string'&&/^[\w:-]{1,128}$/.test(detail[key])))return
   const signature=JSON.stringify(detail),old=requests.get(detail.requestId)
   const reply=(ok,result,message,cancelled=false)=>{if(!closed)window.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-native-reply',{detail:{requestId:detail.requestId,sessionId,runId:detail.runId,ok,result,message,...cancelled?{cancelled:true}:{}}}))}
   if(old&&old.signature!==signature){reply(false,undefined,'请求标识已用于其他操作。');return}
   const promise=old?.promise||execute(detail);requests.set(detail.requestId,{signature,promise});if(requests.size>128)requests.delete(requests.keys().next().value)
   void promise.then(result=>reply(true,result),error=>reply(false,undefined,error.message||'笔记示例已停止。',detail.command==='stop'&&error.name==='AbortError'))
  }
  const taskState=event=>{const value=event.detail,ticket=owned;if(!ticket||value?.sessionId!==sessionId||typeof value.requestId!=='string')return;try{check(ticket)}catch{return}if(value.phase==='preparing'&&ticket.submitting?.prompt===value.prompt){ticket.submitting.requests.add(value.requestId);ticket.pendingRequests.add(value.requestId)}if(['ready','replied','accepted','discarded','failed','stopped'].includes(value.phase))ticket.pendingRequests.delete(value.requestId)}
  const playback=event=>{const value=event.detail,ticket=owned;if(ticket&&value?.sessionId===sessionId&&value.runId===ticket.detail.runId){if(value.ending===true){dispose();return}ticket.playing=value.playing===true;if(ticket.detail.fresh)void rpc(ticket,'playback',{playing:ticket.playing}).catch(()=>{})}}
  const reset=()=>dispose(),observer=new MutationObserver(()=>{if(owned)try{check(owned)}catch{dispose()}})
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-home-guide']})
  window.addEventListener('sherlock:home-guide-notes-native-request',receive);window.addEventListener('sherlock:home-guide-playback',playback);window.addEventListener('sherlock:home-action-context-changed',reset);document.addEventListener('sherlock:notes-reset',reset);document.addEventListener('sherlock:notes-task-state',taskState)
  return()=>{dispose();closed=true;observer.disconnect();window.removeEventListener('sherlock:home-guide-notes-native-request',receive);window.removeEventListener('sherlock:home-guide-playback',playback);window.removeEventListener('sherlock:home-action-context-changed',reset);document.removeEventListener('sherlock:notes-reset',reset);document.removeEventListener('sherlock:notes-task-state',taskState)}
 },[sessionId,subagentPanel,researchSidebar])
 return null
}
