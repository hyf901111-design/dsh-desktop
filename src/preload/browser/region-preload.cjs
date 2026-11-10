const {ipcRenderer}=require('electron')
window.addEventListener('DOMContentLoaded',()=>{
 document.documentElement.lang='zh-CN'
 const style=document.createElement('style');style.textContent=`
 html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}body{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#252831;user-select:none}body[data-selecting=true]{cursor:crosshair}*{box-sizing:border-box}[hidden]{display:none!important}
 [data-browser-region-hint]{position:fixed;top:16px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:9px 14px;border-radius:9px;background:#1d2639e8;color:#fff;box-shadow:0 3px 14px #0002;white-space:nowrap;font-size:12px;pointer-events:none}
 [data-browser-region-rect]{position:fixed;pointer-events:none;border:1.5px solid #3b82f6;background:rgba(59,130,246,.09);border-radius:3px}
 [data-browser-region-question]{position:fixed;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:12px;background:#fff;border:1px solid #dce1e9;border-radius:12px;box-shadow:0 7px 26px #17244326;cursor:default}
 body[data-dark=true]{color:#e7e9ee}body[data-dark=true] [data-browser-region-question]{background:#24262b;border-color:#454951;box-shadow:0 7px 26px #0005}
 header{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:10px}header span{flex:1}button{font:inherit;color:inherit;border:0;border-radius:6px;cursor:pointer;padding:6px 10px;background:transparent}button:hover{background:#8692a51c}button:focus-visible,textarea:focus-visible{outline:2px solid #498df4;outline-offset:1px}button:disabled{opacity:.42;cursor:default}[data-browser-region-close]{font-size:18px;width:26px;height:26px;line-height:20px;padding:2px}
 textarea{display:block;resize:none;user-select:text;width:100%;height:84px;min-height:52px;max-height:180px;padding:8px 9px;border:1px solid #d4dbe6;border-radius:7px;background:transparent;color:inherit;font:inherit;line-height:1.5}body[data-dark=true] textarea{border-color:#525760}footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}[data-browser-region-send]{background:#367cf3;color:#fff;min-width:54px}[data-browser-region-delete]{color:#738096;font-size:12px;padding-left:0}[data-browser-region-error]{font-size:12px;color:#c44646;margin-top:8px;white-space:pre-wrap}
 `;document.head.append(style)
 const hint=document.createElement('div');hint.dataset.browserRegionHint='';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');hint.setAttribute('aria-atomic','true');hint.textContent='拖动框选网页内容 · Esc 取消';hint.hidden=true
 const rect=document.createElement('div');rect.dataset.browserRegionRect='';rect.hidden=true
 const popup=document.createElement('section');popup.dataset.browserRegionQuestion='';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','询问AI');popup.hidden=true
 const header=document.createElement('header'),title=document.createElement('span');title.textContent='询问AI'
 const close=document.createElement('button');close.type='button';close.dataset.browserRegionClose='';close.textContent='×';close.setAttribute('aria-label','关闭询问，保留草稿')
 const input=document.createElement('textarea');input.setAttribute('aria-label','询问内容');input.placeholder='询问这个区域…'
 const error=document.createElement('div');error.dataset.browserRegionError='';error.setAttribute('role','status');error.hidden=true
 const footer=document.createElement('footer'),remove=document.createElement('button'),send=document.createElement('button');remove.type=send.type='button';remove.dataset.browserRegionDelete='';remove.textContent='删除选区';send.dataset.browserRegionSend='';send.textContent='发送'
 header.append(title,close);footer.append(remove,send);popup.append(header,input,error,footer);document.body.append(rect,hint,popup)
 let state,gesture,composing=false,compositionVersion=0,queued,lastComposition,localSequence=0,outside,rightCancel,sendPending=false
 const emit=(kind,extra={})=>{if(state&&state.mode!=='closed')ipcRenderer.send('browser-app:region-action',{kind,operationId:state.operationId,...extra})}
 const clearRightCancel=()=>{if(rightCancel)clearTimeout(rightCancel.timer);rightCancel=undefined}
 const finishRightCancel=()=>{
  const pending=rightCancel;if(!pending?.released)return
  clearTimeout(pending.timer)
  // Contextmenu can precede or follow pointerup. Keep the native layer until
  // both have been consumed; allow a bounded drain when the platform suppresses it.
  pending.timer=setTimeout(()=>{if(rightCancel!==pending||state?.operationId!==pending.operationId)return;rightCancel=undefined;emit('close')},pending.menu?0:180)
 }
 const draw=r=>{rect.hidden=!r;if(r)Object.assign(rect.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'})}
 const point=e=>({x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))})
 const box=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)})
 const locate=()=>{if(popup.hidden||!state?.rect)return;const margin=8,r=state.rect,width=Math.min(340,Math.max(1,innerWidth-2*margin));popup.style.width=width+'px';const height=popup.getBoundingClientRect().height;let y=r.y+r.height+10;if(y+height>innerHeight-margin)y=r.y-height-10;popup.style.left=Math.max(margin,Math.min(innerWidth-margin-width,r.x))+'px';popup.style.top=Math.max(margin,Math.min(innerHeight-margin-height,y))+'px'}
 const flushSend=()=>{if(!sendPending||composing||state?.busy||localSequence>(state?.sequence??0))return;sendPending=false;emit('send')}
 const paint=(next,holdValue=false)=>{
  const same=state?.operationId===next.operationId,opening=next.mode==='question'&&(!same||state?.mode!=='question'),external=same&&(next.syncVersion??0)>(state?.syncVersion??0)
  if(same&&next.ownerSessionId===state.ownerSessionId&&next.draftRev!==undefined&&state.draftRev!==undefined&&next.draftRev<state.draftRev)return
  if(!same){clearRightCancel();localSequence=next.sequence??0;composing=false;queued=undefined;lastComposition=undefined;sendPending=false;gesture=undefined}
  state=next;hint.hidden=next.mode!=='selecting';document.body.dataset.dark=String(next.dark===true);document.body.dataset.selecting=String(next.mode==='selecting');
  if(next.mode==='closed'){clearRightCancel();popup.hidden=true;draw(null);gesture=undefined;sendPending=false;return}
  draw(next.rect);popup.hidden=next.mode!=='question';if(popup.hidden)return
  if(external){localSequence=Math.max(localSequence,next.sequence??0);sendPending=false}
  if(!holdValue&&(external||(next.sequence??0)>=localSequence)&&input.value!==next.draft){const start=input.selectionStart,end=input.selectionEnd;input.value=next.draft??'';if(document.activeElement===input)input.setSelectionRange(Math.min(start,input.value.length),Math.min(end,input.value.length))}
  input.disabled=next.busy===true;send.disabled=next.busy===true||next.canSend===false;remove.disabled=next.busy===true;error.textContent=next.error||'';error.hidden=!next.error;locate()
  if(opening&&!input.disabled){input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length)}
  flushSend()
 }
 ipcRenderer.on('browser-app:region-state',(_event,value)=>{
  if(!value||!['selecting','waiting','question','closed'].includes(value.mode))return
  if(composing&&state?.operationId===value.operationId&&value.mode==='question'){queued=value;return}
  paint(value)
 })
 const draft=()=>{if(!state||state.mode!=='question'||state.busy)return;localSequence++;emit('draft',{draft:input.value,draftRev:state.draftRev,sequence:localSequence,syncVersion:state.syncVersion??0})}
 input.addEventListener('compositionstart',()=>{composing=true;compositionVersion=state?.syncVersion??0})
 input.addEventListener('compositionend',()=>{
  const text=input.value,start=input.selectionStart,end=input.selectionEnd;composing=false
  if(queued){const next=queued;queued=undefined;if((next.syncVersion??0)>compositionVersion){paint(next);lastComposition={value:input.value};return}paint(next,true)}
  input.value=text;input.setSelectionRange(start,end);lastComposition={value:text};draft()
 })
 input.addEventListener('input',event=>{if(composing||event.isComposing)return;if(lastComposition?.value===input.value){lastComposition=undefined;return}lastComposition=undefined;draft()})
 const requestSend=()=>{if(composing||state?.busy||send.disabled)return;sendPending=true;flushSend()}
 input.addEventListener('keydown',event=>{if(event.isComposing||composing)return;if((event.metaKey||event.ctrlKey)&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();if(!state?.busy)emit(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo');return}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(!event.repeat)requestSend()}})
 close.addEventListener('click',()=>emit('close'));remove.addEventListener('click',()=>{if(!remove.disabled)emit('delete')});send.addEventListener('click',requestSend)
 document.addEventListener('pointerdown',event=>{
  if(!state||state.mode==='closed')return
  if(state.mode==='selecting'){
   if(event.button===2||event.button===0&&event.ctrlKey&&/Mac/.test(navigator.platform)){
    event.preventDefault();event.stopImmediatePropagation();clearRightCancel();gesture=undefined;draw(null);rightCancel={id:event.pointerId,operationId:state.operationId,released:false,menu:false};document.body.setPointerCapture?.(event.pointerId);return
   }
   if(event.button!==0)return;event.preventDefault();const p=point(event);gesture={id:event.pointerId,start:p,operationId:state.operationId};document.body.setPointerCapture?.(event.pointerId);draw(box(p,p));return
  }
  if(!popup.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();outside={id:event.pointerId,operationId:state.operationId};document.body.setPointerCapture?.(event.pointerId)}
 },true)
 document.addEventListener('pointermove',event=>{if(gesture?.id===event.pointerId&&state?.operationId===gesture.operationId){event.preventDefault();draw(box(gesture.start,point(event)))}})
 document.addEventListener('pointerup',event=>{
  if(rightCancel?.id===event.pointerId){event.preventDefault();event.stopImmediatePropagation();rightCancel.released=true;finishRightCancel();return}
  if(outside?.id===event.pointerId){const previous=outside;outside=undefined;event.preventDefault();event.stopImmediatePropagation();setTimeout(()=>{if(state?.operationId===previous.operationId)emit('close')},0);return}
  if(!gesture||gesture.id!==event.pointerId||state?.operationId!==gesture.operationId)return
  event.preventDefault();const selected=box(gesture.start,point(event));gesture=undefined;document.body.releasePointerCapture?.(event.pointerId)
  if(selected.width<4||selected.height<4){draw(null);return}
  draw(selected);hint.hidden=true;state={...state,mode:'waiting',rect:selected};document.body.dataset.selecting='false';emit('selection',{rect:selected})
 },true)
 document.addEventListener('contextmenu',event=>{
  if(!rightCancel&&state?.mode!=='selecting')return
  event.preventDefault();event.stopImmediatePropagation()
  if(!rightCancel){rightCancel={id:gesture?.id??-1,operationId:state.operationId,released:!gesture,menu:true};gesture=undefined;draw(null)}else rightCancel.menu=true
  finishRightCancel()
 },true)
 document.addEventListener('auxclick',event=>{if(rightCancel||state?.mode==='selecting'&&event.button===2){event.preventDefault();event.stopImmediatePropagation()}},true)
 document.addEventListener('click',event=>{if(state&&state.mode!=='closed'&&!popup.contains(event.target)){event.preventDefault();event.stopImmediatePropagation()}},true)
 const cancelGesture=()=>{if(rightCancel){rightCancel.released=true;finishRightCancel();return}if(gesture){gesture=undefined;draw(null);emit('close')}outside=undefined}
 document.addEventListener('pointercancel',cancelGesture);document.addEventListener('lostpointercapture',()=>{if(gesture)cancelGesture()})
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!composing){event.preventDefault();if(!rightCancel)emit('close')}},true)
 document.addEventListener('wheel',event=>{if(!state||state.mode==='closed'||popup.contains(event.target))return;event.preventDefault();emit('close')},{capture:true,passive:false})
 window.addEventListener('blur',()=>{if(state?.mode==='selecting')emit('close',{reason:'blur'})});window.addEventListener('resize',()=>{if(state?.mode==='selecting'&&state.bounds&&(innerWidth!==Math.round(state.bounds.width)||innerHeight!==Math.round(state.bounds.height)))emit('close',{reason:'resize'});else locate()})
 document.addEventListener('scroll',()=>{if(state?.mode==='selecting')emit('close')},true)
 ipcRenderer.send('browser-app:region-action',{kind:'ready'})
})
